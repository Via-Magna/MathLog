import { errorResult, evaluate } from '../math';
import { RECOGNITION_CONFIG } from './config';
import type { EngineFactory, InkOnVocabFile, RecognitionEngine } from './engine';
import { adaptInkOn } from './inkOnAdapter';
import { isStrokeMeaningful, type PreprocessResult } from './preprocess';
import type { ExecutionProvider, FromWorker, InitMessage, RecognizeMessage, ToWorker } from './protocol';
import { unpackLine, type InkStroke } from './strokeConversion';

/**
 * Everything the recognition worker does, minus the `self.onmessage` glue,
 * so it can be unit-tested with a fake engine.
 *
 * - init: load vocab, create the ink-on engine (WebGPU → WASM fallback),
 *   warm it up, retry once on failure, then report `ready`
 * - one inference at a time; at most one queued request per line
 * - `drop` removes queued work for lines that no longer exist
 * - per request: strokes → preprocess → ink-on → adaptInkOn → evaluate
 */

export interface WorkerDeps {
  createEngine: EngineFactory;
  loadVocab: (url: string) => Promise<InkOnVocabFile>;
  preprocess: (strokes: readonly InkStroke[]) => PreprocessResult;
  post: (message: FromWorker) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  retryDelayMs?: number;
  slowRunMs?: number;
  slowRunWindow?: number;
}

/** A short "1+1" so the first real request doesn't pay for JIT and allocation. */
export const WARMUP_STROKES: InkStroke[] = [
  { points: [{ x: 10, y: 0 }, { x: 10, y: 20 }, { x: 10, y: 40 }], lineWidth: 3 },
  { points: [{ x: 30, y: 20 }, { x: 45, y: 20 }, { x: 60, y: 20 }], lineWidth: 3 },
  { points: [{ x: 45, y: 5 }, { x: 45, y: 20 }, { x: 45, y: 35 }], lineWidth: 3 },
  { points: [{ x: 80, y: 0 }, { x: 80, y: 20 }, { x: 80, y: 40 }], lineWidth: 3 },
];

export class RecognitionWorkerCore {
  private engine: RecognitionEngine | null = null;
  private vocab: InkOnVocabFile | null = null;
  private init: InitMessage | null = null;
  private provider: ExecutionProvider = 'wasm';
  private threads = 1;
  private beamWidth = 3;
  private queue: RecognizeMessage[] = [];
  private busy = false;
  private recentMs: number[] = [];
  private readonly deps: WorkerDeps;

  constructor(deps: WorkerDeps) {
    this.deps = deps;
  }

  handle(message: ToWorker): Promise<void> {
    switch (message.type) {
      case 'init':
        return this.start(message);
      case 'recognize':
        this.enqueue(message);
        return this.pump();
      case 'drop': {
        const gone = new Set(message.lineKeys);
        this.queue = this.queue.filter((r) => !gone.has(r.lineKey));
        return Promise.resolve();
      }
    }
  }

  /** Queued request count (for tests and debugging). */
  get pending(): number {
    return this.queue.length;
  }

  private enqueue(req: RecognizeMessage) {
    const i = this.queue.findIndex((r) => r.lineKey === req.lineKey);
    if (i >= 0) this.queue[i] = req;
    else this.queue.push(req);
  }

  private async start(init: InitMessage): Promise<void> {
    this.init = init;
    this.beamWidth = init.beamWidth;
    const retryDelay = this.deps.retryDelayMs ?? RECOGNITION_CONFIG.modelRetryDelayMs;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.vocab = await this.deps.loadVocab(init.vocabUrl);
        const warmupMs = await this.createAndWarm(init.executionProvider);
        this.deps.post({
          type: 'ready',
          executionProvider: this.provider,
          threads: this.threads,
          warmupMs,
        });
        return this.pump();
      } catch (e) {
        if (attempt === 0) {
          await this.deps.sleep(retryDelay);
          continue;
        }
        this.deps.post({ type: 'failed', code: 'MODEL_LOAD_FAILED', message: messageOf(e) });
      }
    }
  }

  /** Creates the engine and runs a warm-up; falls back from WebGPU to WASM on any failure. */
  private async createAndWarm(provider: ExecutionProvider): Promise<number> {
    const init = this.init!;
    try {
      const created = await this.deps.createEngine({
        encoderUrl: init.encoderUrl,
        decoderUrl: init.decoderUrl,
        ortWasmPath: init.ortWasmPath,
        beamWidth: this.beamWidth,
        maxDecodeSteps: init.maxDecodeSteps,
        executionProvider: provider,
        onProgress: (loadedBytes, totalBytes) =>
          this.deps.post({ type: 'progress', loadedBytes, totalBytes }),
      });
      this.engine?.dispose();
      this.engine = created.engine;
      this.provider = created.executionProvider;
      this.threads = created.threads;
      const t0 = this.deps.now();
      await this.engine.recognize(this.deps.preprocess(WARMUP_STROKES), this.vocab!, init.mode);
      return Math.round(this.deps.now() - t0);
    } catch (e) {
      if (provider === 'webgpu') {
        console.warn('[calcink] WebGPU failed, falling back to WASM (WEBGPU_FAILED)', e);
        return this.createAndWarm('wasm');
      }
      throw e;
    }
  }

  private async pump(): Promise<void> {
    if (this.busy || !this.engine || !this.vocab) return;
    const req = this.queue.shift();
    if (!req) return;
    this.busy = true;
    try {
      await this.process(req);
      // Still "busy": a beam-width switch must not overlap another inference.
      await this.maybeSlowDown();
    } finally {
      this.busy = false;
    }
    return this.pump();
  }

  private async process(req: RecognizeMessage): Promise<void> {
    const strokes = unpackLine(req);
    if (!isStrokeMeaningful(strokes)) {
      this.deps.post({
        type: 'result',
        requestId: req.requestId,
        lineKey: req.lineKey,
        latex: '',
        result: { kind: 'pending', rawTokens: [] },
        timings: { encoderMs: 0, decoderMs: 0, totalMs: 0 },
      });
      return;
    }
    try {
      const input = this.deps.preprocess(strokes);
      const r = await this.engine!.recognize(input, this.vocab!, this.init!.mode);
      const adapted = adaptInkOn(r, this.vocab!, req.bounds);
      const result = adapted.ok
        ? evaluate(adapted.value)
        : errorResult(adapted.error, adapted.error.rawTokens);
      this.recentMs.push(r.totalMs);
      this.deps.post({
        type: 'result',
        requestId: req.requestId,
        lineKey: req.lineKey,
        latex: r.latex,
        result,
        timings: { encoderMs: r.encoderMs, decoderMs: r.decoderMs, totalMs: r.totalMs },
      });
    } catch (e) {
      this.deps.post({
        type: 'failed',
        requestId: req.requestId,
        lineKey: req.lineKey,
        code: 'INFERENCE_FAILED',
        message: messageOf(e),
      });
    }
  }

  /** Drops to beam width 1 when recent runs are consistently slow. */
  private async maybeSlowDown(): Promise<void> {
    const window = this.deps.slowRunWindow ?? RECOGNITION_CONFIG.slowRunWindow;
    const limit = this.deps.slowRunMs ?? RECOGNITION_CONFIG.slowRunMs;
    if (this.beamWidth <= 1 || this.recentMs.length < window) return;
    const last = this.recentMs.slice(-window);
    const avg = last.reduce((a, b) => a + b, 0) / window;
    if (avg <= limit) return;
    this.beamWidth = 1;
    this.recentMs = [];
    try {
      await this.createAndWarm(this.provider);
    } catch (e) {
      console.warn('[calcink] could not switch to beam width 1', e);
    }
  }
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
