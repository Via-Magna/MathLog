import type { Stroke } from '../../src/types';
import type { Timers } from '../../src/recognition/timers';

let clock = 1_000;

/** A stroke through the given points (pressure 0.5, width 3). */
export function stroke(id: string, points: [number, number][], width = 3): Stroke {
  return {
    id,
    points: points.map(([x, y]) => ({ x, y, pressure: 0.5 })),
    color: '#000',
    width,
    createdAt: clock++,
  };
}

/** A tall "digit-like" vertical stroke of height h at (x, y). */
export const digit = (id: string, x: number, y: number, h = 40) =>
  stroke(id, [
    [x, y],
    [x + 2, y + h / 2],
    [x, y + h],
  ]);

/** A flat bar (minus sign, = bar) of width w at (x, y). */
export const bar = (id: string, x: number, y: number, w = 20) =>
  stroke(id, [
    [x, y],
    [x + w / 2, y + 1],
    [x + w, y],
  ]);

/** A dot (decimal point, ÷ dot). */
export const dot = (id: string, x: number, y: number) => stroke(id, [[x, y]]);

/** Manually advanced timers. */
export class FakeTimers implements Timers {
  now = 0;
  private nextId = 1;
  private pending = new Map<number, { at: number; fn: () => void }>();

  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.nextId++;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  };

  clearTimeout = (handle: unknown): void => {
    this.pending.delete(handle as number);
  };

  get size(): number {
    return this.pending.size;
  }

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let nextId: number | undefined;
      let next: { at: number; fn: () => void } | undefined;
      for (const [id, t] of this.pending) {
        if (t.at <= target && (!next || t.at < next.at)) {
          next = t;
          nextId = id;
        }
      }
      if (!next || nextId === undefined) break;
      this.pending.delete(nextId);
      this.now = next.at;
      next.fn();
    }
    this.now = target;
  }
}
