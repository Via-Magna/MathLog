import { describe, it, expect } from 'vitest';
import type { EvalResult } from '../../src/math';
import type { EquationLine } from '../../src/recognition/lineGrouping';
import type { FromWorker, InitMessage, ToWorker } from '../../src/recognition/protocol';
import { RecognitionClient, type ModelState, type WorkerLike } from '../../src/recognition/RecognitionClient';
import { FakeTimers } from './helpers';

class FakeWorker implements WorkerLike {
  sent: { msg: ToWorker; transfer?: Transferable[] }[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<FromWorker>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  postMessage(msg: ToWorker, transfer?: Transferable[]) {
    this.sent.push({ msg, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: FromWorker) {
    this.onmessage?.({ data } as MessageEvent<FromWorker>);
  }
  crash() {
    this.onerror?.(new Event('error'));
  }
}

const INIT = { type: 'init' } as InitMessage;
const OK: EvalResult = { kind: 'ok', value: 2, display: '2', pending: false, rawTokens: ['1', '+', '1', '='], trailing: [] };
const line = (key: string): EquationLine => ({
  key,
  strokeIds: [key],
  eraserIds: [],
  bounds: { x: 0, y: 0, w: 10, h: 10 },
  lineHeight: 10,
  equals: null,
});
const packed = () => ({ points: new Float32Array([1, 2]), strokeLengths: [1], lineWidths: [3] });
const result = (requestId: number, lineKey: string): FromWorker => ({
  type: 'result',
  requestId,
  lineKey,
  latex: '1 + 1 =',
  result: OK,
  timings: { encoderMs: 1, decoderMs: 2, totalMs: 3 },
});

function setup(maxRestarts = 1) {
  const workers: FakeWorker[] = [];
  const timers = new FakeTimers();
  const states: [ModelState, number][] = [];
  const results: string[] = [];
  const failures: string[] = [];
  const client = new RecognitionClient(
    () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
    INIT,
    {
      onModelState: (s, p) => states.push([s, p]),
      onResult: (key, latex) => results.push(`${key}:${latex}`),
      onFailed: (key, code) => failures.push(`${key}:${code}`),
    },
    { timeoutMs: 1000, timers, maxRestarts },
  );
  client.start();
  return { client, workers, timers, states, results, failures, worker: () => workers.at(-1)! };
}

describe('RecognitionClient', () => {
  it('sends init and reports model progress and readiness', () => {
    const t = setup();
    expect(t.worker().sent[0].msg).toBe(INIT);
    t.worker().emit({ type: 'progress', loadedBytes: 25, totalBytes: 100 });
    t.worker().emit({ type: 'progress', loadedBytes: 5, totalBytes: 0 });
    t.worker().emit({ type: 'ready', executionProvider: 'wasm', threads: 4, warmupMs: 120 });
    expect(t.states).toEqual([
      ['loading', 0],
      ['loading', 0.25],
      ['loading', 0],
      ['ready', 1],
    ]);
    expect(t.client.modelState).toBe('ready');
  });

  it('transfers the point buffer and delivers the matching result', () => {
    const t = setup();
    const p = packed();
    const id = t.client.recognize(line('A'), p);
    const sent = t.worker().sent[1];
    expect(sent.msg).toMatchObject({ type: 'recognize', requestId: id, lineKey: 'A' });
    expect(sent.transfer).toEqual([p.points.buffer]);
    t.worker().emit(result(id, 'A'));
    expect(t.results).toEqual(['A:1 + 1 =']);
    expect(t.timers.size).toBe(0);
  });

  it('ignores superseded and out-of-order results', () => {
    const t = setup();
    const first = t.client.recognize(line('A'), packed());
    const second = t.client.recognize(line('A'), packed());
    t.worker().emit(result(first, 'A'));
    expect(t.results).toEqual([]);
    t.worker().emit(result(second, 'A'));
    t.worker().emit(result(second, 'A')); // duplicate
    expect(t.results).toEqual(['A:1 + 1 =']);
  });

  it('ignores results for dropped lines and tells the worker', () => {
    const t = setup();
    const id = t.client.recognize(line('A'), packed());
    t.client.drop(['A']);
    expect(t.worker().sent.at(-1)?.msg).toEqual({ type: 'drop', lineKeys: ['A'] });
    t.worker().emit(result(id, 'A'));
    expect(t.results).toEqual([]);
    t.client.drop([]); // no-op
    expect(t.worker().sent.at(-1)?.msg).toEqual({ type: 'drop', lineKeys: ['A'] });
  });

  it('delivers per-request failures and ignores stale ones', () => {
    const t = setup();
    const a = t.client.recognize(line('A'), packed());
    t.worker().emit({ type: 'failed', requestId: a, lineKey: 'A', code: 'INFERENCE_FAILED', message: 'x' });
    t.worker().emit({ type: 'failed', requestId: 999, lineKey: 'B', code: 'INFERENCE_FAILED', message: 'x' });
    expect(t.failures).toEqual(['A:INFERENCE_FAILED']);
  });

  it('marks the model unavailable on a model-level failure', () => {
    const t = setup();
    t.worker().emit({ type: 'failed', code: 'MODEL_LOAD_FAILED', message: '404' });
    expect(t.states.at(-1)).toEqual(['unavailable', 0]);
  });

  it('times out a request and ignores its late result', () => {
    const t = setup();
    const id = t.client.recognize(line('A'), packed());
    t.timers.advance(999);
    expect(t.failures).toEqual([]);
    t.timers.advance(1);
    expect(t.failures).toEqual(['A:INFERENCE_TIMEOUT']);
    t.worker().emit(result(id, 'A'));
    expect(t.results).toEqual([]);
  });

  it('does not time out a request that was superseded', () => {
    const t = setup();
    t.client.recognize(line('A'), packed());
    const second = t.client.recognize(line('A'), packed());
    t.worker().emit(result(second, 'A'));
    t.timers.advance(2000);
    expect(t.failures).toEqual([]);
  });

  it('restarts once after a crash, then gives up', () => {
    const t = setup(1);
    t.client.recognize(line('A'), packed());
    t.worker().crash();
    expect(t.workers).toHaveLength(2);
    expect(t.workers[0].terminated).toBe(true);
    expect(t.failures).toEqual(['A:WORKER_CRASHED']);
    expect(t.worker().sent[0].msg).toBe(INIT);
    t.worker().crash();
    expect(t.workers).toHaveLength(2);
    expect(t.states.at(-1)).toEqual(['unavailable', 0]);
  });

  it('dispose terminates the worker and clears timers', () => {
    const t = setup();
    t.client.recognize(line('A'), packed());
    t.client.dispose();
    expect(t.worker().terminated).toBe(true);
    expect(t.timers.size).toBe(0);
  });
});
