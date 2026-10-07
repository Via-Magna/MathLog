import { describe, it, expect, vi } from 'vitest';
import { AnswerRenderer, STALE_ALPHA, TIMING } from '../../src/answers/AnswerRenderer';
import { EDIT_GRACE_MS } from '../../src/answers/slots';
import type { LineResult } from '../../src/store/useRecognitionStore';
import { TOKENS_18, bad, line, ok } from './helpers';

function setup({ reduced = false } = {}) {
  let now = 0;
  const frames: (() => void)[] = [];
  const texts: { text: string; alpha: number; font: string; x: number; y: number }[] = [];
  const dots: number[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    textBaseline: 'alphabetic',
    getTransform: () => ({ a: 2, d: 2 }),
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => dots.push(ctx.globalAlpha)),
    measureText: (text: string) => ({ width: text.length * parseFloat(ctx.font.split(' ')[1]) * 0.5 }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, alpha: ctx.globalAlpha, font: ctx.font, x, y }),
  };
  const canvas = { width: 1600, height: 1200 };
  const onAnnounce = vi.fn();
  const timers: { cb: () => void; ms: number }[] = [];
  const renderer = new AnswerRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    ctx: ctx as unknown as CanvasRenderingContext2D,
    onAnnounce,
    now: () => now,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: vi.fn(),
    reducedMotion: () => reduced,
    setTimer: (cb, ms) => timers.push({ cb, ms }),
    clearTimer: (handle) => timers.splice((handle as number) - 1, 1, { cb: () => {}, ms: -1 }),
  });
  /** Runs one pending frame at time `t`; returns what it drew. */
  const frame = (t = now) => {
    now = t;
    texts.length = 0;
    dots.length = 0;
    const cb = frames.shift();
    cb?.();
    return { ran: cb !== undefined, texts: [...texts], dots: [...dots] };
  };
  return {
    renderer,
    frame,
    frames,
    timers,
    onAnnounce,
    ctx,
    at: (t: number) => (now = t),
    update: (lines: LineResult[], opts = {}) => renderer.update(lines, opts),
  };
}

const answer18 = line({ result: ok('30', TOKENS_18) });
const textOf = (f: { texts: { text: string }[] }) => f.texts.map((t) => t.text);

describe('AnswerRenderer', () => {
  it('fades a new answer in, in the handwriting font, then stops requesting frames', () => {
    const r = setup();
    r.update([answer18]);
    const first = r.frame(0);
    expect(first.texts).toHaveLength(0); // alpha 0 at t = 0
    const mid = r.frame(TIMING.fadeInMs / 2);
    expect(mid.texts[0].text).toBe('30');
    expect(mid.texts[0].alpha).toBeGreaterThan(0);
    expect(mid.texts[0].alpha).toBeLessThan(1);
    expect(mid.texts[0].font).toContain('Caveat');
    const end = r.frame(TIMING.fadeInMs);
    expect(end.texts[0].alpha).toBe(1);
    expect(r.frames).toHaveLength(0);
    expect(r.renderer.animating).toBe(false);
  });

  it('clears the whole logical canvas each frame (bitmap / dpr)', () => {
    const r = setup();
    r.update([answer18]);
    r.frame(0);
    expect(r.ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('announces new answers for screen readers, once', () => {
    const r = setup();
    r.update([answer18]);
    r.update([answer18]);
    expect(r.onAnnounce).toHaveBeenCalledTimes(1);
    expect(r.onAnnounce).toHaveBeenCalledWith('18 plus 4 times 3 equals 30');
  });

  it('dims the answer while the line is re-read, then crossfades to the new one', () => {
    const r = setup();
    r.update([answer18]);
    r.frame(1000);
    r.at(2000);
    r.update([line({ key: 'k2', status: 'recognizing' })]);
    const dim = r.frame(2000 + TIMING.dimMs);
    expect(textOf(dim)).toEqual(['30']);
    expect(dim.texts[0].alpha).toBeCloseTo(STALE_ALPHA);

    r.at(3000);
    r.update([line({ key: 'k2', result: ok('31') })]);
    const mid = r.frame(3000 + TIMING.crossfadeMs / 2);
    expect(textOf(mid)).toEqual(['30', '31']);
    expect(mid.texts[0].alpha).toBeLessThan(STALE_ALPHA);
    const end = r.frame(3000 + TIMING.crossfadeMs);
    expect(textOf(end)).toEqual(['31']);
  });

  it('shows thinking dots after a short delay and keeps animating them', () => {
    const r = setup();
    r.update([line({ status: 'queued' })]);
    expect(r.frame(0).dots).toHaveLength(0);
    expect(r.frame(TIMING.thinkingDelayMs + 400).dots).toHaveLength(3);
    expect(r.frames).toHaveLength(1);
  });

  it('with reduced motion: no fades, static dots, no animation loop', () => {
    const r = setup({ reduced: true });
    r.update([line({ status: 'queued' })]);
    const thinking = r.frame(0);
    expect(thinking.dots).toEqual([0.5, 0.5, 0.5]);
    expect(r.frames).toHaveLength(0);

    r.update([answer18]);
    const shown = r.frame(0);
    expect(shown.texts[0].alpha).toBe(1);
    expect(r.frames).toHaveLength(0);
  });

  it('fades an answer out when its line is erased, then forgets it', () => {
    const r = setup();
    r.update([answer18]);
    r.frame(1000);
    r.at(2000);
    r.update([]);
    expect(textOf(r.frame(2000 + TIMING.fadeOutMs / 2))).toEqual(['30']);
    r.frame(2000 + TIMING.fadeOutMs);
    r.update([]);
    r.frame(5000);
    expect(r.renderer.slotList).toHaveLength(0);
  });

  it('draws Undefined and ? in their own colours, with a reading hint for ?', () => {
    const r = setup();
    r.update([line({ result: bad(['1', '+', '+', '=']) })]);
    const f = r.frame(1000);
    expect(textOf(f)).toEqual(['?', 'I read “1++=”', 'Two operators in a row']);
  });

  it('draws "What I read" under every finished line when the toggle is on', () => {
    const r = setup();
    r.update([answer18, line({ key: 'k2', bounds: { x: 0, y: 300, w: 80, h: 40 }, equals: null, result: ok('5', ['5'], true) })], {
      showReadings: true,
    });
    const f = r.frame(1000);
    expect(textOf(f)).toEqual(expect.arrayContaining(['30', 'I read “18+4×3=”', 'I read “5”']));
    const hint = f.texts.find((t) => t.text === 'I read “18+4×3=”')!;
    expect(hint.y).toBe(100 + 40 + 6);
  });

  it('says so when nothing could be read', () => {
    const r = setup();
    r.update([line({ result: bad([]) })]);
    expect(textOf(r.frame(1000))).toContain('I couldn’t read this line');
  });

  it('re-measures after invalidate (resize or font load)', () => {
    const r = setup();
    r.update([answer18]);
    r.frame(1000);
    r.renderer.invalidate();
    expect(r.frames).toHaveLength(1);
    expect(textOf(r.frame(2000))).toEqual(['30']);
  });

  it('holds the answer while an edited line reads as "?", then shows "?" when the grace timer fires', () => {
    const r = setup();
    r.update([answer18]);
    r.frame(1000);
    r.at(2000);
    r.update([line({ key: 'k2', result: bad(['1', '8', '+', '4', '\\times', '=']) })]);
    const held = r.frame(2000 + TIMING.dimMs);
    expect(textOf(held)).toEqual(['30']); // no "?" and no error hint yet
    const pending = r.timers.filter((t) => t.ms >= 0).at(-1)!;
    expect(pending.ms).toBe(EDIT_GRACE_MS);

    r.at(2000 + EDIT_GRACE_MS);
    pending.cb();
    const after = r.frame(2000 + EDIT_GRACE_MS + TIMING.crossfadeMs);
    expect(textOf(after)).toEqual(['?', 'I read “18+4×=”', 'Two operators in a row']);
  });

  it('stops after dispose', () => {
    const r = setup();
    r.update([answer18]);
    r.renderer.dispose();
    expect(r.frame(0).texts).toHaveLength(0); // the already-queued frame draws nothing
    r.update([answer18]);
    expect(r.frames).toHaveLength(0); // and nothing new is queued
  });
});
