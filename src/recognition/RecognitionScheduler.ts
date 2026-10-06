import type { EvalResult } from '../math';
import type { LineResult } from '../store/useRecognitionStore';
import type { Stroke } from '../types';
import { RECOGNITION_CONFIG } from './config';
import { groupIntoLines, type EquationLine, type GroupingOptions } from './lineGrouping';
import type { RecognitionErrorCode } from './protocol';
import { packLine } from './strokeConversion';
import { realTimers, type Timers } from './timers';

/**
 * Watches the stroke list and decides what to recognize, and when.
 * - regroups lines on every change (add, erase, undo, redo, clear)
 * - unchanged lines and cache hits (undo/redo) publish instantly
 * - changed lines are sent once the pen has been idle for `idleMs`
 * - vanished lines are dropped from the store and the worker
 * No React here, so it is testable with fake timers.
 */

export interface SchedulerClient {
  recognize(line: EquationLine, packed: ReturnType<typeof packLine>): number;
  drop(lineKeys: string[]): void;
}

export interface SchedulerOptions {
  client: SchedulerClient;
  publish: (lines: Record<string, LineResult>) => void;
  idleMs?: number;
  cacheSize?: number;
  timers?: Timers;
  grouping?: Partial<GroupingOptions>;
}

export class RecognitionScheduler {
  private strokes: readonly Stroke[] = [];
  private lines = new Map<string, EquationLine>();
  private results = new Map<string, LineResult>();
  private cache = new Map<string, LineResult>();
  private dirty = new Set<string>();
  private timer: unknown = null;
  private penDown = false;
  private modelReady = false;
  private readonly opts: Required<Omit<SchedulerOptions, 'grouping'>> & { grouping: Partial<GroupingOptions> };

  constructor(options: SchedulerOptions) {
    this.opts = {
      idleMs: RECOGNITION_CONFIG.idleMs,
      cacheSize: RECOGNITION_CONFIG.cacheSize,
      timers: realTimers,
      grouping: {},
      ...options,
    };
  }

  onStrokesChanged(strokes: readonly Stroke[]): void {
    this.strokes = strokes;
    const next = new Map(groupIntoLines(strokes, this.opts.grouping).map((l) => [l.key, l]));

    const removed = [...this.lines.keys()].filter((k) => !next.has(k));
    for (const key of removed) {
      this.results.delete(key);
      this.dirty.delete(key);
    }
    this.opts.client.drop(removed);

    for (const [key, line] of next) {
      if (this.lines.has(key)) continue; // unchanged line: keep its status/result
      const cached = this.cache.get(key);
      if (cached) {
        this.touch(key, cached);
        this.results.set(key, cached);
      } else {
        this.results.set(key, { key, bounds: line.bounds, status: 'queued' });
        this.dirty.add(key);
      }
    }
    this.lines = next;
    this.publish();
    this.schedule();
  }

  onPointerDown(): void {
    this.penDown = true;
    this.cancelTimer();
  }

  onPointerUp(): void {
    this.penDown = false;
    this.schedule();
  }

  /** Model became ready (first load or after a crash): resend every line without a result. */
  onModelReady(): void {
    this.modelReady = true;
    for (const [key, r] of this.results) {
      if (r.status !== 'done') {
        this.dirty.add(key);
        this.results.set(key, { ...r, status: 'queued' });
      }
    }
    this.publish();
    this.schedule();
  }

  onModelLost(): void {
    this.modelReady = false;
    this.cancelTimer();
  }

  onResult(lineKey: string, latex: string, result: EvalResult, totalMs: number): void {
    const line = this.lines.get(lineKey);
    if (!line) return;
    const done: LineResult = { key: lineKey, bounds: line.bounds, status: 'done', latex, result, totalMs };
    this.results.set(lineKey, done);
    this.touch(lineKey, done);
    this.publish();
  }

  onFailed(lineKey: string, _code: RecognitionErrorCode): void {
    const current = this.results.get(lineKey);
    if (!current || !this.lines.has(lineKey)) return;
    this.results.set(lineKey, { ...current, status: 'failed' });
    this.publish();
  }

  /** Sends all dirty lines now (called by the idle timer). */
  flush(): void {
    this.cancelTimer();
    if (!this.modelReady || this.penDown || this.dirty.size === 0) return;
    for (const key of this.orderDirty()) {
      const line = this.lines.get(key)!;
      this.opts.client.recognize(line, packLine(this.strokes, line));
      this.results.set(key, { ...this.results.get(key)!, status: 'recognizing' });
    }
    this.dirty.clear();
    this.publish();
  }

  dispose(): void {
    this.cancelTimer();
  }

  private schedule() {
    this.cancelTimer();
    if (!this.modelReady || this.penDown || this.dirty.size === 0) return;
    this.timer = this.opts.timers.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.opts.idleMs);
  }

  private cancelTimer() {
    if (this.timer !== null) this.opts.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  /** The line holding the most recent stroke goes first; the rest top to bottom. */
  private orderDirty(): string[] {
    let newest: Stroke | undefined;
    for (const s of this.strokes) if (!newest || s.createdAt > newest.createdAt) newest = s;
    const keys = [...this.dirty];
    const first = keys.find((k) => newest !== undefined && this.lines.get(k)!.strokeIds.includes(newest.id));
    return first ? [first, ...keys.filter((k) => k !== first)] : keys;
  }

  private touch(key: string, value: LineResult) {
    this.cache.delete(key);
    this.cache.set(key, value);
    while (this.cache.size > this.opts.cacheSize) {
      this.cache.delete(this.cache.keys().next().value!);
    }
  }

  private publish() {
    this.opts.publish(Object.fromEntries(this.results));
  }
}
