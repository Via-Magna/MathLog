import { describe, it, expect } from 'vitest';
import type { EvalResult } from '../../src/math';
import type { EquationLine } from '../../src/recognition/lineGrouping';
import { RecognitionScheduler } from '../../src/recognition/RecognitionScheduler';
import type { PackedLine } from '../../src/recognition/strokeConversion';
import type { LineResult } from '../../src/store/useRecognitionStore';
import type { Stroke } from '../../src/types';
import { FakeTimers, digit } from './helpers';

const OK = (display: string): EvalResult => ({ kind: 'ok', value: Number(display), display, pending: false, rawTokens: [], trailing: [] });

function setup(ready = true) {
  const timers = new FakeTimers();
  const sent: { line: EquationLine; packed: PackedLine }[] = [];
  const dropped: string[][] = [];
  let published: Record<string, LineResult> = {};
  const scheduler = new RecognitionScheduler({
    client: {
      recognize: (line, packed) => {
        sent.push({ line, packed });
        return sent.length;
      },
      drop: (keys) => {
        if (keys.length) dropped.push(keys);
      },
    },
    publish: (lines) => (published = lines),
    idleMs: 400,
    timers,
  });
  if (ready) scheduler.onModelReady();
  return { scheduler, timers, sent, dropped, lines: () => Object.values(published) };
}

const top = [digit('t1', 0, 100), digit('t2', 40, 100)];
const bottom = [digit('b1', 0, 300)];

describe('RecognitionScheduler', () => {
  it('publishes new lines as queued, then sends them after 400 ms idle', () => {
    const t = setup();
    t.scheduler.onStrokesChanged(top);
    expect(t.lines().map((l) => l.status)).toEqual(['queued']);
    t.timers.advance(399);
    expect(t.sent).toHaveLength(0);
    t.timers.advance(1);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].line.strokeIds).toEqual(['t1', 't2']);
    expect(t.lines()[0].status).toBe('recognizing');
  });

  it('restarts the idle timer on every change', () => {
    const t = setup();
    t.scheduler.onStrokesChanged([top[0]]);
    t.timers.advance(300);
    t.scheduler.onStrokesChanged(top);
    t.timers.advance(300);
    expect(t.sent).toHaveLength(0);
    t.timers.advance(100);
    expect(t.sent).toHaveLength(1);
  });

  it('never sends while the pen is down', () => {
    const t = setup();
    t.scheduler.onStrokesChanged(top);
    t.scheduler.onPointerDown();
    t.timers.advance(5000);
    expect(t.sent).toHaveLength(0);
    t.scheduler.onPointerUp();
    t.timers.advance(400);
    expect(t.sent).toHaveLength(1);
  });

  it('waits for the model before sending, then sends pending lines', () => {
    const t = setup(false);
    t.scheduler.onStrokesChanged(top);
    t.timers.advance(1000);
    expect(t.sent).toHaveLength(0);
    t.scheduler.onModelReady();
    t.timers.advance(400);
    expect(t.sent).toHaveLength(1);
  });

  it('stores results and only re-sends the line that changed', () => {
    const t = setup();
    t.scheduler.onStrokesChanged([...top, ...bottom]);
    t.timers.advance(400);
    expect(t.sent).toHaveLength(2);
    const keyOf = (first: string) => t.sent.find((s) => s.line.strokeIds[0] === first)!.line.key;
    const a = keyOf('t1');
    const b = keyOf('b1');
    t.scheduler.onResult(a, '1 1', OK('11'), 900);
    t.scheduler.onResult(b, '1', OK('1'), 800);
    expect(t.lines().every((l) => l.status === 'done')).toBe(true);

    t.scheduler.onStrokesChanged([...top, ...bottom, digit('b2', 40, 300)]);
    t.timers.advance(400);
    expect(t.sent).toHaveLength(3);
    expect(t.sent[2].line.strokeIds).toEqual(['b1', 'b2']);
    expect(t.dropped).toEqual([[b]]);
    expect(t.lines().find((l) => l.key === a)).toMatchObject({ status: 'done', latex: '1 1', totalMs: 900 });
  });

  it('restores cached results on undo without a new request', () => {
    const t = setup();
    t.scheduler.onStrokesChanged(top);
    t.timers.advance(400);
    t.scheduler.onResult(t.sent[0].line.key, '1 1', OK('11'), 900);

    const withExtra = [...top, digit('t3', 80, 100)];
    t.scheduler.onStrokesChanged(withExtra); // new line key
    t.scheduler.onStrokesChanged(top); // undo
    t.timers.advance(1000);
    expect(t.sent).toHaveLength(1);
    expect(t.lines()).toEqual([expect.objectContaining({ status: 'done', latex: '1 1' })]);
  });

  it('clearing the canvas empties the store and drops every line', () => {
    const t = setup();
    t.scheduler.onStrokesChanged([...top, ...bottom]);
    t.scheduler.onStrokesChanged([]);
    expect(t.lines()).toEqual([]);
    expect(t.dropped[0]).toHaveLength(2);
    t.timers.advance(1000);
    expect(t.sent).toHaveLength(0);
  });

  it('ignores results and failures for lines that are gone', () => {
    const t = setup();
    t.scheduler.onStrokesChanged(top);
    t.timers.advance(400);
    const key = t.sent[0].line.key;
    t.scheduler.onStrokesChanged([]);
    t.scheduler.onResult(key, 'x', OK('1'), 1);
    t.scheduler.onFailed(key, 'INFERENCE_FAILED');
    expect(t.lines()).toEqual([]);
  });

  it('marks failed lines and retries them when the model comes back', () => {
    const t = setup();
    t.scheduler.onStrokesChanged(top);
    t.timers.advance(400);
    t.scheduler.onFailed(t.sent[0].line.key, 'WORKER_CRASHED');
    expect(t.lines()[0].status).toBe('failed');
    t.scheduler.onModelLost();
    t.scheduler.onModelReady();
    expect(t.lines()[0].status).toBe('queued');
    t.timers.advance(400);
    expect(t.sent).toHaveLength(2);
  });

  it('sends the line with the newest stroke first', () => {
    const t = setup();
    const strokes: Stroke[] = [...top, ...bottom];
    t.scheduler.onStrokesChanged(strokes); // bottom's b1 is newest
    t.timers.advance(400);
    expect(t.sent[0].line.strokeIds).toEqual(['b1']);
  });

  it('evicts the oldest cache entries beyond cacheSize', () => {
    const timers = new FakeTimers();
    const sent: EquationLine[] = [];
    const s = new RecognitionScheduler({
      client: { recognize: (l) => sent.push(l), drop: () => {} },
      publish: () => {},
      timers,
      cacheSize: 1,
    });
    s.onModelReady();
    const a = [digit('a', 0, 0)];
    const b = [digit('b', 0, 0)];
    s.onStrokesChanged(a);
    timers.advance(400);
    s.onResult(sent[0].key, '1', OK('1'), 1);
    s.onStrokesChanged(b);
    timers.advance(400);
    s.onResult(sent[1].key, '1', OK('1'), 1);
    s.onStrokesChanged(a); // evicted → must be sent again
    timers.advance(400);
    expect(sent).toHaveLength(3);
    s.dispose();
  });

  it('flush does nothing when there is no dirty line', () => {
    const t = setup();
    t.scheduler.flush();
    expect(t.sent).toHaveLength(0);
  });
});
