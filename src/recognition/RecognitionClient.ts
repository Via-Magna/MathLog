import type { EvalResult } from '../math';
import { RECOGNITION_CONFIG } from './config';
import type { EquationLine } from './lineGrouping';
import type {
  ExecutionProvider,
  FromWorker,
  InitMessage,
  RecognitionErrorCode,
  ToWorker,
} from './protocol';
import type { PackedLine } from './strokeConversion';
import { realTimers, type Timers } from './timers';

/**
 * Main-thread side of the worker: lifecycle, request ids, timeouts,
 * stale-result dropping and one automatic restart after a crash.
 *
 * Acceptance rule: a result is delivered only if its requestId is the latest
 * one sent for that line and the line hasn't been dropped since.
 */

export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null;
  onerror: ((event: Event) => void) | null;
}

export type ModelState = 'idle' | 'loading' | 'ready' | 'unavailable';

export interface ModelInfo {
  executionProvider?: ExecutionProvider;
  threads?: number;
  warmupMs?: number;
  error?: string;
}

export interface ClientEvents {
  onModelState(state: ModelState, progress: number, info: ModelInfo): void;
  onResult(lineKey: string, latex: string, result: EvalResult, totalMs: number): void;
  onFailed(lineKey: string, code: RecognitionErrorCode, message: string): void;
}

export interface ClientOptions {
  timeoutMs?: number;
  maxRestarts?: number;
  timers?: Timers;
}

export class RecognitionClient {
  private worker: WorkerLike | null = null;
  private nextId = 1;
  /** lineKey → latest requestId sent. */
  private latest = new Map<string, number>();
  private timeouts = new Map<number, unknown>();
  private restarts = 0;
  private state: ModelState = 'idle';
  private readonly timeoutMs: number;
  private readonly maxRestarts: number;
  private readonly timers: Timers;
  private readonly createWorker: () => WorkerLike;
  private readonly init: InitMessage;
  private readonly events: ClientEvents;

  constructor(createWorker: () => WorkerLike, init: InitMessage, events: ClientEvents, options: ClientOptions = {}) {
    this.createWorker = createWorker;
    this.init = init;
    this.events = events;
    this.timeoutMs = options.timeoutMs ?? RECOGNITION_CONFIG.requestTimeoutMs;
    this.maxRestarts = options.maxRestarts ?? 1;
    this.timers = options.timers ?? realTimers;
  }

  get modelState(): ModelState {
    return this.state;
  }

  start(): void {
    this.spawn();
  }

  /** Sends one line; returns its requestId. The point buffer is transferred. */
  recognize(line: EquationLine, packed: PackedLine): number {
    const requestId = this.nextId++;
    this.latest.set(line.key, requestId);
    this.worker?.postMessage(
      {
        type: 'recognize',
        requestId,
        lineKey: line.key,
        points: packed.points,
        strokeLengths: packed.strokeLengths,
        lineWidths: packed.lineWidths,
        ...(packed.isEraser && { isEraser: packed.isEraser }),
        bounds: line.bounds,
      },
      [packed.points.buffer],
    );
    this.timeouts.set(
      requestId,
      this.timers.setTimeout(() => this.timeout(line.key, requestId), this.timeoutMs),
    );
    return requestId;
  }

  /** Forget lines that no longer exist; any late results for them are ignored. */
  drop(lineKeys: string[]): void {
    if (lineKeys.length === 0) return;
    for (const key of lineKeys) {
      const id = this.latest.get(key);
      if (id !== undefined) this.clearTimeout(id);
      this.latest.delete(key);
    }
    this.worker?.postMessage({ type: 'drop', lineKeys });
  }

  dispose(): void {
    for (const handle of this.timeouts.values()) this.timers.clearTimeout(handle);
    this.timeouts.clear();
    this.latest.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private spawn() {
    const worker = this.createWorker();
    worker.onmessage = (event) => this.onMessage(event.data);
    worker.onerror = (event) => this.onCrash(event);
    this.worker = worker;
    this.setState('loading', 0, {});
    worker.postMessage(this.init);
  }

  private setState(state: ModelState, progress: number, info: ModelInfo) {
    this.state = state;
    this.events.onModelState(state, progress, info);
  }

  private isCurrent(lineKey: string | undefined, requestId: number | undefined): lineKey is string {
    return lineKey !== undefined && requestId !== undefined && this.latest.get(lineKey) === requestId;
  }

  private settle(lineKey: string, requestId: number) {
    this.latest.delete(lineKey);
    this.clearTimeout(requestId);
  }

  private clearTimeout(requestId: number) {
    const handle = this.timeouts.get(requestId);
    if (handle !== undefined) this.timers.clearTimeout(handle);
    this.timeouts.delete(requestId);
  }

  private onMessage(msg: FromWorker) {
    switch (msg.type) {
      case 'progress':
        this.setState('loading', msg.totalBytes > 0 ? Math.min(1, msg.loadedBytes / msg.totalBytes) : 0, {});
        return;
      case 'ready':
        this.setState('ready', 1, {
          executionProvider: msg.executionProvider,
          threads: msg.threads,
          warmupMs: msg.warmupMs,
        });
        return;
      case 'result':
        if (!this.isCurrent(msg.lineKey, msg.requestId)) {
          this.clearTimeout(msg.requestId);
          return;
        }
        this.settle(msg.lineKey, msg.requestId);
        this.events.onResult(msg.lineKey, msg.latex, msg.result, msg.timings.totalMs);
        return;
      case 'failed':
        if (msg.requestId === undefined) {
          // Model-level failure (MODEL_LOAD_FAILED after the worker's own retry).
          this.setState('unavailable', 0, { error: msg.message });
          return;
        }
        if (!this.isCurrent(msg.lineKey, msg.requestId)) {
          this.clearTimeout(msg.requestId);
          return;
        }
        this.settle(msg.lineKey, msg.requestId);
        this.events.onFailed(msg.lineKey, msg.code, msg.message);
        return;
    }
  }

  private timeout(lineKey: string, requestId: number) {
    this.timeouts.delete(requestId);
    if (this.latest.get(lineKey) !== requestId) return;
    this.latest.delete(lineKey);
    this.events.onFailed(lineKey, 'INFERENCE_TIMEOUT', `No result after ${this.timeoutMs} ms`);
  }

  private onCrash(event: Event) {
    console.error('[calcink] recognition worker crashed', event);
    const inFlight = [...this.latest.keys()];
    for (const handle of this.timeouts.values()) this.timers.clearTimeout(handle);
    this.timeouts.clear();
    this.latest.clear();
    this.worker?.terminate();
    this.worker = null;
    for (const key of inFlight) this.events.onFailed(key, 'WORKER_CRASHED', 'Recognition worker crashed');

    if (this.restarts < this.maxRestarts) {
      this.restarts++;
      this.spawn();
    } else {
      this.setState('unavailable', 0, { error: 'Recognition worker crashed' });
    }
  }
}
