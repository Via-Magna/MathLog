import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { EngineConfig, EngineResult, InkOnVocabFile } from '../../src/recognition/engine';
import type { FromWorker, InitMessage, RecognizeMessage } from '../../src/recognition/protocol';
import { RecognitionWorkerCore, type WorkerDeps } from '../../src/recognition/workerCore';

const vocab = JSON.parse(
  readFileSync(new URL('../fixtures/inkon-vocab.json', import.meta.url), 'utf8'),
) as InkOnVocabFile;

const INIT: InitMessage = {
  type: 'init',
  encoderUrl: '/models/comer/encoder_int8.onnx',
  decoderUrl: '/models/comer/decoder_int8.onnx',
  vocabUrl: '/models/comer/vocab.json',
  ortWasmPath: '/ort/',
  beamWidth: 3,
  maxDecodeSteps: 50,
  executionProvider: 'wasm',
  mode: 'number',
};

/** A line with one long vertical stroke: passes ink-on's "meaningful" filter. */
function request(requestId: number, lineKey: string, tall = true): RecognizeMessage {
  const n = 8;
  const points = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) points[i * 2 + 1] = tall ? i * 6 : i * 0.2;
  return { type: 'recognize', requestId, lineKey, points, strokeLengths: [n], lineWidths: [3], bounds: { x: 0, y: 0, w: 1, h: 42 } };
}

const ids = (tokens: string[]) => tokens.map((t) => vocab.word2idx[t]);

interface Harness {
  core: RecognitionWorkerCore;
  posted: FromWorker[];
  configs: EngineConfig[];
  recognizeCalls: number;
  /** Tokens returned by the next recognize calls (warm-up included). */
  outputs: (string[] | Error)[];
  release: () => void;
}

function harness(opts: { failCreate?: number; failWebGPU?: boolean; gate?: boolean; totalMs?: number } = {}): Harness {
  const h: Harness = {
    core: undefined as unknown as RecognitionWorkerCore,
    posted: [],
    configs: [],
    recognizeCalls: 0,
    outputs: [],
    release: () => {},
  };
  let failures = opts.failCreate ?? 0;
  let gate: Promise<void> = Promise.resolve();
  if (opts.gate) gate = new Promise((resolve) => (h.release = resolve));

  const deps: WorkerDeps = {
    createEngine: async (config) => {
      h.configs.push(config);
      config.onProgress?.(50, 100);
      if (failures > 0) {
        failures--;
        throw new Error('fetch failed');
      }
      return {
        executionProvider: config.executionProvider,
        threads: 4,
        engine: {
          recognize: async (): Promise<EngineResult> => {
            h.recognizeCalls++;
            if (opts.failWebGPU && config.executionProvider === 'webgpu') throw new Error('webgpu op unsupported');
            if (h.recognizeCalls > 1) await gate;
            const out = h.outputs.shift() ?? ['1'];
            if (out instanceof Error) throw out;
            return { latex: out.join(' '), tokenIds: ids(out), encoderMs: 10, decoderMs: 20, totalMs: opts.totalMs ?? 30 };
          },
          dispose: () => {},
        },
      };
    },
    loadVocab: async () => vocab,
    preprocess: () => ({ tensor: new Float32Array(1), height: 256, width: 128, mask: new Uint8Array(1), maskHeight: 256, maskWidth: 128 }),
    post: (m) => h.posted.push(m),
    sleep: async () => {},
    now: () => 0,
    retryDelayMs: 0,
  };
  h.core = new RecognitionWorkerCore(deps);
  return h;
}

const results = (h: Harness) => h.posted.filter((m) => m.type === 'result');

describe('worker init', () => {
  it('loads, warms up, reports progress and ready', async () => {
    const h = harness();
    await h.core.handle(INIT);
    expect(h.posted[0]).toEqual({ type: 'progress', loadedBytes: 50, totalBytes: 100 });
    expect(h.posted.at(-1)).toEqual({ type: 'ready', executionProvider: 'wasm', threads: 4, warmupMs: 0 });
    expect(h.recognizeCalls).toBe(1);
    expect(h.configs[0]).toMatchObject({ beamWidth: 3, maxDecodeSteps: 50, ortWasmPath: '/ort/' });
  });

  it('retries a failed load once', async () => {
    const h = harness({ failCreate: 1 });
    await h.core.handle(INIT);
    expect(h.posted.at(-1)?.type).toBe('ready');
  });

  it('reports MODEL_LOAD_FAILED after the retry also fails', async () => {
    const h = harness({ failCreate: 2 });
    await h.core.handle(INIT);
    expect(h.posted.at(-1)).toEqual({ type: 'failed', code: 'MODEL_LOAD_FAILED', message: 'fetch failed' });
  });

  it('falls back from WebGPU to WASM', async () => {
    const h = harness({ failWebGPU: true });
    await h.core.handle({ ...INIT, executionProvider: 'webgpu' });
    expect(h.configs.map((c) => c.executionProvider)).toEqual(['webgpu', 'wasm']);
    expect(h.posted.at(-1)).toMatchObject({ type: 'ready', executionProvider: 'wasm' });
  });
});

describe('worker requests', () => {
  it('chains ink-on → adapter → evaluate', async () => {
    const h = harness();
    await h.core.handle(INIT);
    h.outputs.push(['1', '8', '+', '4', '\\times', '3', '=']);
    await h.core.handle(request(1, 'L1'));
    expect(results(h)).toEqual([
      {
        type: 'result',
        requestId: 1,
        lineKey: 'L1',
        latex: '1 8 + 4 \\times 3 =',
        result: expect.objectContaining({ kind: 'ok', display: '30', pending: false }),
        timings: { encoderMs: 10, decoderMs: 20, totalMs: 30 },
      },
    ]);
  });

  it('returns adapter errors as EvalResult errors', async () => {
    const h = harness();
    await h.core.handle(INIT);
    h.outputs.push(['2', '^', '{', '3', '}', '=']);
    await h.core.handle(request(1, 'L1'));
    expect(results(h)[0]).toMatchObject({ result: { kind: 'error', code: 'UNKNOWN_SYMBOL', span: [1, 2] } });
  });

  it('skips inference for taps and dots', async () => {
    const h = harness();
    await h.core.handle(INIT);
    await h.core.handle(request(1, 'dot', false));
    expect(h.recognizeCalls).toBe(1); // warm-up only
    expect(results(h)[0]).toMatchObject({ latex: '', result: { kind: 'pending' } });
  });

  it('turns an inference exception into INFERENCE_FAILED and keeps going', async () => {
    const h = harness();
    await h.core.handle(INIT);
    h.outputs.push(new Error('session run failed'), ['5', '=']);
    await h.core.handle(request(1, 'A'));
    await h.core.handle(request(2, 'B'));
    expect(h.posted.find((m) => m.type === 'failed')).toEqual({
      type: 'failed',
      requestId: 1,
      lineKey: 'A',
      code: 'INFERENCE_FAILED',
      message: 'session run failed',
    });
    expect(results(h)[0]).toMatchObject({ requestId: 2, result: { display: '5' } });
  });

  it('queues requests that arrive before the model is ready', async () => {
    const h = harness();
    const early = h.core.handle(request(1, 'L1'));
    await early;
    expect(results(h)).toHaveLength(0);
    h.outputs.push(['1', '='], ['2', '=']); // first is consumed by warm-up
    await h.core.handle(INIT);
    expect(results(h)).toHaveLength(1);
  });

  it('keeps one queued request per line and honours drop', async () => {
    const h = harness({ gate: true });
    await h.core.handle(INIT);
    const running = h.core.handle(request(1, 'A')); // blocks on the gate
    await h.core.handle(request(2, 'B'));
    await h.core.handle(request(3, 'B')); // replaces 2
    await h.core.handle(request(4, 'C'));
    expect(h.core.pending).toBe(2);
    await h.core.handle({ type: 'drop', lineKeys: ['C'] });
    expect(h.core.pending).toBe(1);
    h.release();
    await running;
    expect(results(h).map((r) => (r.type === 'result' ? r.requestId : 0))).toEqual([1, 3]);
  });

  it('drops to beam width 1 when runs are slow', async () => {
    const h = harness({ totalMs: 5000 });
    await h.core.handle(INIT);
    for (let i = 1; i <= 3; i++) await h.core.handle(request(i, `L${i}`));
    expect(h.configs.map((c) => c.beamWidth)).toEqual([3, 1]);
  });
});
