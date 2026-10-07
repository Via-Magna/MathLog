import { describe, it, expect } from 'vitest';
import { EDIT_GRACE_MS, graceDeadline, pruneSlots, reconcileSlots, type Slot } from '../../src/answers/slots';
import type { LineResult } from '../../src/store/useRecognitionStore';
import { bad, line, ok } from './helpers';

/** Runs a sequence of store snapshots through the reconciler. */
function run(...snapshots: LineResult[][]) {
  let slots = new Map<string, Slot>();
  const history: Slot[][] = [];
  snapshots.forEach((lines, i) => {
    slots = reconcileSlots(slots, lines, i * 100);
    history.push([...slots.values()]);
  });
  return { slots, history, only: () => [...slots.values()][0] };
}

const queued = (key: string, over: Partial<LineResult> = {}) => line({ key, status: 'queued', ...over });
const done = (key: string, display: string, over: Partial<LineResult> = {}) => line({ key, result: ok(display), ...over });

describe('reconcileSlots', () => {
  it('thinks while the first reading of a line with "=" runs, then shows the answer', () => {
    const { history } = run([queued('a')], [done('a', '30')]);
    expect(history[0][0]).toMatchObject({ phase: 'thinking', answer: null });
    expect(history[1][0]).toMatchObject({ phase: 'shown', answer: { text: '30' }, previous: null, fromStale: false });
  });

  it('does not create a slot for a line without "=" or without an answer', () => {
    expect(run([queued('a', { equals: null })]).slots.size).toBe(0);
    expect(run([done('a', '30', { result: ok('30', [], true) })]).slots.size).toBe(0);
  });

  it('never thinks when the model is unavailable', () => {
    const slots = reconcileSlots(new Map(), [queued('a')], 0, { modelUnavailable: true });
    expect(slots.size).toBe(0);
  });

  it('keeps the old answer up (stale) while an edited line is re-read', () => {
    const { history } = run([done('a', '30')], [queued('b')], [done('b', '31')]);
    const [shown, stale, fresh] = history.map((h) => h[0]);
    expect(stale.id).toBe(shown.id);
    expect(stale).toMatchObject({ phase: 'stale', answer: { text: '30' }, lineKey: 'b' });
    expect(fresh).toMatchObject({ phase: 'shown', answer: { text: '31' }, previous: { text: '30' }, fromStale: true });
  });

  it('undo (a cache hit) swaps straight back without a reading phase', () => {
    const { history } = run([done('a', '30')], [queued('b')], [done('b', '31')], [done('a', '30')]);
    expect(history[3][0]).toMatchObject({ phase: 'shown', answer: { text: '30' }, previous: { text: '31' }, fromStale: false });
    expect(history[3][0].id).toBe(history[0][0].id);
  });

  it('a re-read that confirms the answer brightens it again without a crossfade', () => {
    const { only } = run([done('a', '30')], [queued('b')], [done('b', '30')]);
    expect(only()).toMatchObject({ phase: 'shown', previous: null, fromStale: true });
  });

  it('a line that stays the same keeps its timestamp', () => {
    const { history } = run([done('a', '30')], [done('a', '30')]);
    expect(history[1][0].since).toBe(history[0][0].since);
  });

  it('a re-send of an unchanged line keeps it shown', () => {
    const { only } = run([done('a', '30')], [line({ key: 'a', status: 'recognizing' })]);
    expect(only().phase).toBe('shown');
  });

  it('hides (and keeps the text for a fade) when the "=" is erased', () => {
    const { only } = run([done('a', '30')], [done('b', '30', { equals: null, result: ok('30', [], true) })]);
    expect(only()).toMatchObject({ phase: 'hidden', answer: { text: '30' } });
  });

  it('hides a slot whose line vanished, then prunes it after the fade', () => {
    const { slots } = run([done('a', '30')], [queued('b')], []);
    const slot = [...slots.values()][0];
    expect(slot).toMatchObject({ phase: 'hidden', fromStale: true });
    expect(pruneSlots(slots, slot.since + 100, 180).size).toBe(1);
    expect(pruneSlots(slots, slot.since + 180, 180).size).toBe(0);
  });

  it('keeps hidden slots for lines that never got an answer, and drops thinking', () => {
    const { only } = run([queued('a')], [done('a', '?', { result: { kind: 'pending', rawTokens: [] } })]);
    expect(only()).toMatchObject({ phase: 'hidden', answer: null });
  });

  it('follows each of two lines separately', () => {
    const top = (key: string, d: string) => done(key, d);
    const bottom = (key: string, d: string) => done(key, d, { bounds: { x: 0, y: 300, w: 80, h: 40 } });
    const { history } = run([top('t', '1'), bottom('b', '2')], [top('t', '1'), bottom('b2', '3')]);
    const ids = (h: Slot[]) => Object.fromEntries(h.map((s) => [s.answer?.text, s.id]));
    expect(history[1].map((s) => s.answer?.text).sort()).toEqual(['1', '3']);
    expect(ids(history[1])['3']).toBe(ids(history[0])['2']);
    expect(ids(history[1])['1']).toBe(ids(history[0])['1']);
  });

  it('does not attach a new line to a far-away slot', () => {
    const { history } = run([done('a', '1')], [done('a', '1'), done('far', '2', { bounds: { x: 500, y: 500, w: 80, h: 40 } })]);
    expect(new Set(history[1].map((s) => s.id)).size).toBe(2);
  });
});

describe('editing grace (erase a digit, then rewrite it)', () => {
  const at = (slots: Map<string, Slot>, lines: LineResult[], now: number) => reconcileSlots(slots, lines, now);
  const first = (slots: Map<string, Slot>) => [...slots.values()][0];
  const unreadable = (key: string) => line({ key, result: bad(['7', '+', '=']) });

  it('holds the old answer (stale) while the half-edited line reads as "?"', () => {
    let s = at(new Map(), [done('a', '8')], 0);
    s = at(s, [queued('b')], 1000); // eraser stroke
    s = at(s, [unreadable('b')], 1500); // "7+=" read
    expect(first(s)).toMatchObject({ phase: 'stale', answer: { text: '8' } });
    s = at(s, [queued('c')], 2500); // new digit written
    s = at(s, [done('c', '14')], 3000);
    expect(first(s)).toMatchObject({ phase: 'shown', answer: { text: '14' }, previous: { text: '8' } });
  });

  it('shows "?" once the grace runs out without a rewrite', () => {
    let s = at(new Map(), [done('a', '8')], 0);
    s = at(s, [unreadable('b')], 1000);
    expect(graceDeadline(s)).toBe(1000 + EDIT_GRACE_MS);
    s = at(s, [unreadable('b')], 1000 + EDIT_GRACE_MS);
    expect(first(s)).toMatchObject({ phase: 'shown', answer: { text: '?' } });
    expect(graceDeadline(s)).toBeNull();
  });

  it('also holds when the edited line loses its answer but still has its "="', () => {
    let s = at(new Map(), [done('a', '8')], 0);
    s = at(s, [done('b', '8', { result: ok('7', ['7', '+'], true) })], 1000);
    expect(first(s)).toMatchObject({ phase: 'stale', answer: { text: '8' } });
  });

  it('still hides at once when the "=" itself is erased', () => {
    let s = at(new Map(), [done('a', '8')], 0);
    s = at(s, [done('b', '8', { equals: null, result: ok('8', ['7', '+', '1'], true) })], 1000);
    expect(first(s).phase).toBe('hidden');
  });

  it('never holds a "?" over another "?"', () => {
    let s = at(new Map(), [unreadable('a')], 0);
    s = at(s, [unreadable('b')], 1000);
    expect(first(s)).toMatchObject({ phase: 'shown', answer: { text: '?' } });
  });

  it('undo straight to an earlier answer skips the grace', () => {
    let s = at(new Map(), [done('a', '8')], 0);
    s = at(s, [unreadable('b')], 1000);
    s = at(s, [done('a', '8')], 1200);
    expect(first(s)).toMatchObject({ phase: 'shown', answer: { text: '8' } });
  });
});
