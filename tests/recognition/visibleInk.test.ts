import { describe, it, expect } from 'vitest';
import { groupIntoLines } from '../../src/recognition/lineGrouping';
import { isStrokeMeaningful, inkBBox } from '../../src/recognition/preprocess';
import { packLine, unpackLine } from '../../src/recognition/strokeConversion';
import { erasersOver, visibleInk } from '../../src/recognition/visibleInk';
import { digit, eraser, stroke } from './helpers';

const ids = (strokes: { id: string }[]) => strokes.map((s) => s.id);

describe('visibleInk', () => {
  it('drops eraser paths and empty strokes', () => {
    const a = digit('a', 0, 100);
    const far = eraser('e', [[500, 500], [520, 500]]);
    expect(ids(visibleInk([a, stroke('empty', []), far]))).toEqual(['a']);
  });

  it('drops ink completely covered by a later eraser', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    const wipe = eraser('wipe', [[0, 95], [0, 145]], 6);
    expect(ids(visibleInk([a, b, wipe]))).toEqual(['b']);
  });

  it('keeps ink that is only partly erased', () => {
    const a = digit('a', 0, 100);
    const nick = eraser('nick', [[0, 100], [2, 115]], 6);
    expect(ids(visibleInk([a, nick]))).toEqual(['a']);
  });

  it('treats several erasers as one covered area', () => {
    const a = digit('a', 0, 100);
    const top = eraser('top', [[0, 100], [2, 120]], 6);
    const bottom = eraser('bottom', [[2, 120], [0, 140]], 6);
    expect(visibleInk([a, top, bottom])).toEqual([]);
    expect(ids(visibleInk([a, top]))).toEqual(['a']);
  });

  it('never erases ink written after the eraser', () => {
    const wipe = eraser('wipe', [[0, 95], [0, 145]], 6);
    const rewritten = digit('new', 0, 100);
    expect(ids(visibleInk([wipe, rewritten]))).toEqual(['new']);
  });

  it('handles a single-tap eraser and a single-point ink dot', () => {
    const dot = stroke('dot', [[10, 10]]);
    expect(visibleInk([dot, eraser('tap', [[12, 10]], 5)])).toEqual([]);
    expect(ids(visibleInk([dot, eraser('miss', [[30, 10]], 5)]))).toEqual(['dot']);
  });

  it('samples between sparse points, so a gap in coverage keeps the stroke', () => {
    // Two points 100 px apart; erasers cover both ends but not the middle.
    const long = stroke('long', [[0, 0], [100, 0]]);
    const ends = [eraser('l', [[0, 0]], 10), eraser('r', [[100, 0]], 10)];
    expect(ids(visibleInk([long, ...ends]))).toEqual(['long']);
  });
});

describe('erasersOver', () => {
  const a = digit('a', 0, 100);

  it('lists later erasers touching the ink, in drawing order', () => {
    const e1 = eraser('e1', [[0, 110]], 4);
    const e2 = eraser('e2', [[2, 130]], 4);
    expect(erasersOver([a, e1, e2], [a])).toEqual(['e1', 'e2']);
  });

  it('ignores far erasers and erasers drawn before the ink', () => {
    const before = eraser('before', [[0, 110]], 4);
    const ink = digit('ink', 0, 100);
    const far = eraser('far', [[300, 300]], 4);
    expect(erasersOver([before, ink, far], [ink])).toEqual([]);
  });

  it('returns nothing for no ink', () => {
    expect(erasersOver([a], [])).toEqual([]);
  });
});

describe('grouping with the pixel eraser', () => {
  it('does not group eraser paths as ink', () => {
    const lines = groupIntoLines([digit('a', 0, 100), eraser('e', [[400, 400], [450, 400]])]);
    expect(lines.map((l) => l.strokeIds)).toEqual([['a']]);
    expect(lines[0].eraserIds).toEqual([]);
  });

  it('removes a fully erased digit from its line', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    const [line] = groupIntoLines([a, b, eraser('wipe', [[40, 95], [40, 145]], 6)]);
    expect(line.strokeIds).toEqual(['a']);
    expect(line.bounds.x).toBe(0);
  });

  it('puts a partial erase in the line key, and undo restores the old key', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    const nick = eraser('nick', [[40, 100]], 5);
    const before = groupIntoLines([a, b])[0];
    const after = groupIntoLines([a, b, nick])[0];
    expect(after.strokeIds).toEqual(['a', 'b']);
    expect(after.eraserIds).toEqual(['nick']);
    expect(after.key).not.toBe(before.key);
    expect(groupIntoLines([a, b])[0].key).toBe(before.key);
  });

  it('erase-and-rewrite gives a new key', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    const wipe = eraser('wipe', [[40, 95], [40, 145]], 6);
    const first = groupIntoLines([a, b])[0];
    const rewritten = groupIntoLines([a, b, wipe, digit('c', 40, 100)])[0];
    expect(rewritten.strokeIds).toEqual(['a', 'c']);
    expect(rewritten.key).not.toBe(first.key);
  });
});

describe('packing erasers for the worker', () => {
  it('packs ink and erasers in drawing order with eraser flags', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    const nick = eraser('nick', [[40, 100]], 5);
    const c = digit('c', 80, 100);
    const all = [b, a, nick, c];
    const [line] = groupIntoLines(all);
    const packed = packLine(all, line);
    expect(packed.isEraser).toEqual([false, false, true, false]);
    expect(packed.lineWidths).toEqual([3, 3, 5, 3]);
    const unpacked = unpackLine(packed);
    expect(unpacked[2]).toEqual({ points: [{ x: 40, y: 0 }], lineWidth: 5, isEraser: true });
    expect(unpacked[0].isEraser).toBeUndefined();
  });

  it('omits eraser flags for a line without erasers', () => {
    const a = digit('a', 0, 100);
    const [line] = groupIntoLines([a]);
    expect(packLine([a], line).isEraser).toBeUndefined();
  });

  it('preprocessing ignores eraser paths for the ink box and the dot filter', () => {
    const ink = { points: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 0, y: 30 }, { x: 0, y: 40 }, { x: 0, y: 50 }], lineWidth: 3 };
    const wipe = { points: [{ x: -50, y: -50 }, { x: 200, y: 200 }], lineWidth: 10, isEraser: true };
    expect(inkBBox([ink, wipe])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 50 });
    expect(isStrokeMeaningful([ink, wipe])).toBe(true);
    expect(isStrokeMeaningful([wipe])).toBe(false);
  });
});
