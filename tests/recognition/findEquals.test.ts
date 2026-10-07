import { describe, it, expect } from 'vitest';
import { findEquals, type StrokeBox } from '../../src/recognition/findEquals';
import { groupIntoLines } from '../../src/recognition/lineGrouping';
import { RecognitionScheduler } from '../../src/recognition/RecognitionScheduler';
import type { LineResult } from '../../src/store/useRecognitionStore';
import { FakeTimers, bar, digit, dot } from './helpers';

/** A box from (x, y) with size w × h. */
const box = (id: string, x: number, y: number, w: number, h: number): StrokeBox => ({
  id,
  minX: x,
  minY: y,
  maxX: x + w,
  maxY: y + h,
});

const H = 40;

describe('findEquals', () => {
  it('finds two stacked bars', () => {
    const eq = findEquals([box('d', 0, 100, 5, 40), box('top', 50, 114, 20, 2), box('bottom', 51, 126, 19, 2)], H);
    expect(eq).toEqual({ bounds: { x: 50, y: 114, w: 20, h: 14 }, strokeIds: ['top', 'bottom'] });
  });

  it('orders the bars top then bottom whatever the input order', () => {
    const eq = findEquals([box('bottom', 50, 126, 20, 2), box('top', 50, 114, 20, 2)], H);
    expect(eq?.strokeIds).toEqual(['top', 'bottom']);
  });

  it('picks the rightmost "=" when there are several', () => {
    const boxes = [
      box('a1', 0, 114, 20, 2),
      box('a2', 0, 126, 20, 2),
      box('b1', 100, 114, 20, 2),
      box('b2', 100, 126, 20, 2),
    ];
    expect(findEquals(boxes, H)?.strokeIds).toEqual(['b1', 'b2']);
  });

  it('does not take a lone minus sign for "="', () => {
    expect(findEquals([box('d', 0, 100, 5, 40), box('minus', 20, 120, 20, 2)], H)).toBeNull();
  });

  it('does not take ÷ (a bar between two dots) for "="', () => {
    expect(findEquals([box('dotTop', 10, 110, 2, 2), box('bar', 0, 120, 20, 2), box('dotBottom', 10, 130, 2, 2)], H)).toBeNull();
  });

  it('rejects bars that are too far apart or too close vertically', () => {
    expect(findEquals([box('a', 0, 100, 20, 2), box('b', 0, 140, 20, 2)], H)).toBeNull(); // 40 px > 0.9 H
    expect(findEquals([box('a', 0, 100, 20, 2), box('b', 0, 101, 20, 2)], H)).toBeNull(); // 1 px < 0.08 H
  });

  it('rejects side-by-side minus signs and very different widths', () => {
    expect(findEquals([box('a', 0, 114, 20, 2), box('b', 30, 126, 20, 2)], H)).toBeNull();
    expect(findEquals([box('long', 0, 114, 60, 2), box('short', 0, 126, 12, 2)], H)).toBeNull();
  });

  it('ignores strokes that are not flat bars', () => {
    expect(findEquals([box('tall', 0, 100, 20, 30), box('bar', 0, 126, 20, 2)], H)).toBeNull(); // too tall
    expect(findEquals([box('tiny', 0, 114, 4, 1), box('bar', 0, 126, 20, 2)], H)).toBeNull(); // too short
    expect(findEquals([box('blob', 0, 114, 12, 10), box('bar', 0, 126, 20, 2)], H)).toBeNull(); // not horizontal
  });

  it('respects custom options', () => {
    const boxes = [box('a', 0, 100, 20, 2), box('b', 0, 140, 20, 2)];
    expect(findEquals(boxes, H, { maxGap: 1.2 })).not.toBeNull();
  });
});

describe('line geometry from groupIntoLines', () => {
  // 1 2 = written with 40 px digits at y 100..140
  const strokes = [digit('1', 0, 100), digit('2', 30, 100), bar('eqTop', 60, 115), bar('eqBottom', 60, 127)];

  it('finds the "=" of a written line', () => {
    const [line] = groupIntoLines(strokes);
    expect(line.equals?.strokeIds).toEqual(['eqTop', 'eqBottom']);
    expect(line.equals?.bounds).toEqual({ x: 60, y: 115, w: 20, h: 13 });
  });

  it('has no "=" until both bars are written', () => {
    expect(groupIntoLines(strokes.slice(0, 3))[0].equals).toBeNull();
  });

  it('measures line height from the digits, not dots or operator strokes', () => {
    // 1 8 + 4 × 3 with 50 px digits: "+" and "×" strokes are 30 px, the 4's crossbar stroke 25 px.
    const strokes = [
      digit('1', 0, 100, 50),
      digit('8', 30, 100, 50),
      digit('plusV', 70, 110, 30),
      bar('plusH', 60, 125),
      digit('4', 100, 100, 50),
      digit('4bar', 110, 120, 25),
      digit('x1', 140, 110, 30),
      digit('x2', 150, 110, 30),
      digit('3', 180, 100, 50),
      dot('p', 210, 149),
    ];
    expect(groupIntoLines(strokes)[0].lineHeight).toBe(50);
  });

  it('gives each line its own height', () => {
    const lines = groupIntoLines([digit('s1', 0, 100, 30), digit('s2', 30, 100, 30), digit('b1', 0, 300, 80)]);
    expect(lines.map((l) => l.lineHeight)).toEqual([30, 80]);
  });

  it('sizes a small equation by its own digits on a page of large writing', () => {
    const big = [digit('B1', 0, 100, 100), digit('B2', 60, 100, 100), digit('B3', 120, 100, 100)];
    const small = [digit('s1', 0, 400, 20), digit('s2', 20, 400, 20), bar('sEq1', 40, 407, 12), bar('sEq2', 40, 413, 12)];
    const lines = groupIntoLines([...big, ...small]);
    expect(lines.map((l) => l.lineHeight)).toEqual([100, 20]);
    expect(lines[1].equals?.strokeIds).toEqual(['sEq1', 'sEq2']);
  });

  it('falls back to the default height for a line of only small strokes', () => {
    expect(groupIntoLines([bar('m', 0, 100)])[0].lineHeight).toBe(40);
  });

  it('is published with the line result', () => {
    let published: Record<string, LineResult> = {};
    const scheduler = new RecognitionScheduler({
      client: { recognize: () => 1, drop: () => {} },
      publish: (lines) => (published = lines),
      timers: new FakeTimers(),
    });
    scheduler.onStrokesChanged(strokes);
    const [result] = Object.values(published);
    expect(result).toMatchObject({ status: 'queued', lineHeight: 40, equals: { strokeIds: ['eqTop', 'eqBottom'] } });
  });
});
