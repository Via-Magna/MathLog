import { describe, it, expect } from 'vitest';
import { fnv1a, groupIntoLines, lineKey } from '../../src/recognition/lineGrouping';
import { bar, digit, dot, stroke } from './helpers';

const ids = (lines: ReturnType<typeof groupIntoLines>) => lines.map((l) => l.strokeIds);

describe('groupIntoLines', () => {
  it('returns no lines for no strokes', () => {
    expect(groupIntoLines([])).toEqual([]);
    expect(groupIntoLines([stroke('empty', [])])).toEqual([]);
  });

  it('keeps one written line together, ordered left to right', () => {
    const strokes = [digit('b', 40, 100), digit('a', 0, 102), digit('c', 80, 98)];
    expect(ids(groupIntoLines(strokes))).toEqual([['a', 'b', 'c']]);
  });

  it('splits two lines written one above the other', () => {
    const strokes = [digit('a1', 0, 100), digit('a2', 40, 100), digit('b1', 0, 200), digit('b2', 40, 205)];
    expect(ids(groupIntoLines(strokes))).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2'],
    ]);
  });

  it('keeps = bars, a minus sign and ÷ dots on their line', () => {
    // 1 2 ÷ 3 − 4 = on one line (digits 40 px tall at y 100..140)
    const strokes = [
      digit('1', 0, 100),
      digit('2', 30, 100),
      dot('divTop', 70, 112),
      bar('divBar', 60, 120),
      dot('divBottom', 70, 128),
      digit('3', 100, 100),
      bar('minus', 130, 120),
      digit('4', 160, 100),
      bar('eqTop', 190, 115),
      bar('eqBottom', 190, 125),
    ];
    const lines = groupIntoLines(strokes);
    expect(lines).toHaveLength(1);
    expect(lines[0].strokeIds).toHaveLength(strokes.length);
  });

  it('keeps a decimal point on its line', () => {
    const strokes = [digit('1', 0, 100), dot('point', 20, 139), digit('5', 30, 100)];
    expect(ids(groupIntoLines(strokes))).toEqual([['1', 'point', '5']]);
  });

  it('joins slightly slanted writing by centre distance', () => {
    const strokes = [digit('a', 0, 100), digit('b', 40, 115), digit('c', 80, 130)];
    expect(groupIntoLines(strokes)).toHaveLength(1);
  });

  it('splits two equations written side by side', () => {
    const strokes = [digit('a1', 0, 100), digit('a2', 30, 100), digit('b1', 400, 100), digit('b2', 430, 100)];
    expect(ids(groupIntoLines(strokes))).toEqual([
      ['a1', 'a2'],
      ['b1', 'b2'],
    ]);
  });

  it('gives a far-away small stroke its own line', () => {
    const strokes = [digit('a', 0, 100), digit('b', 30, 100), dot('stray', 10, 400)];
    expect(ids(groupIntoLines(strokes))).toEqual([['a', 'b'], ['stray']]);
  });

  it('groups a canvas of only small strokes', () => {
    const strokes = [bar('m1', 0, 100), bar('m2', 40, 102)];
    expect(groupIntoLines(strokes)).toHaveLength(1);
  });

  it('computes bounds as the union of stroke boxes', () => {
    const [line] = groupIntoLines([digit('a', 10, 100, 40), digit('b', 50, 95, 50)]);
    expect(line.bounds).toEqual({ x: 10, y: 95, w: 42, h: 50 });
  });

  it('respects custom options', () => {
    const strokes = [digit('a', 0, 100), digit('b', 100, 100)];
    expect(groupIntoLines(strokes, { gapRatio: 1 })).toHaveLength(2);
    expect(groupIntoLines(strokes)).toHaveLength(1);
  });
});

describe('line keys', () => {
  it('are stable regardless of stroke order', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    expect(groupIntoLines([a, b])[0].key).toBe(groupIntoLines([b, a])[0].key);
    expect(lineKey(['x', 'y'])).toBe(lineKey(['y', 'x']));
  });

  it('change when a stroke is erased or added', () => {
    const a = digit('a', 0, 100);
    const b = digit('b', 40, 100);
    const c = digit('c', 80, 100);
    const k2 = groupIntoLines([a, b])[0].key;
    expect(groupIntoLines([a, b, c])[0].key).not.toBe(k2);
    expect(groupIntoLines([a])[0].key).not.toBe(k2);
  });

  it('only change for the edited line', () => {
    const top = [digit('t1', 0, 100), digit('t2', 40, 100)];
    const bottom = [digit('b1', 0, 200)];
    const before = groupIntoLines([...top, ...bottom]);
    const after = groupIntoLines([...top, ...bottom, digit('b2', 40, 200)]);
    expect(after[0].key).toBe(before[0].key);
    expect(after[1].key).not.toBe(before[1].key);
  });

  it('hash is 8 hex chars and deterministic', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});
