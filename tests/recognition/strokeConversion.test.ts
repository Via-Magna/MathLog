import { describe, it, expect } from 'vitest';
import { groupIntoLines } from '../../src/recognition/lineGrouping';
import { packLine, unpackLine } from '../../src/recognition/strokeConversion';
import { stroke } from './helpers';

describe('stroke conversion (canvas → line coordinates)', () => {
  const a = stroke('a', [
    [110, 205],
    [112, 240],
  ], 4);
  const b = stroke('b', [
    [150, 200],
    [160, 210],
    [170, 245],
  ], 2);
  const [line] = groupIntoLines([b, a]);

  it('offsets coordinates so the line starts at (0, 0)', () => {
    const packed = packLine([a, b], line);
    expect(Array.from(packed.points)).toEqual([0, 5, 2, 40, 40, 0, 50, 10, 60, 45]);
  });

  it('keeps stroke lengths and widths in left-to-right order', () => {
    const packed = packLine([b, a], line);
    expect(packed.strokeLengths).toEqual([2, 3]);
    expect(packed.lineWidths).toEqual([4, 2]);
  });

  it('round-trips through unpackLine', () => {
    expect(unpackLine(packLine([a, b], line))).toEqual([
      { points: [{ x: 0, y: 5 }, { x: 2, y: 40 }], lineWidth: 4 },
      { points: [{ x: 40, y: 0 }, { x: 50, y: 10 }, { x: 60, y: 45 }], lineWidth: 2 },
    ]);
  });

  it('skips strokes that are no longer on the canvas', () => {
    const packed = packLine([a], line);
    expect(packed.strokeLengths).toEqual([2]);
    expect(packed.points).toHaveLength(4);
  });

  it('keeps fractional coordinates', () => {
    const c = stroke('c', [
      [0.5, 0.25],
      [10.75, 20.5],
    ]);
    const [l] = groupIntoLines([c]);
    expect(unpackLine(packLine([c], l))[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 10.25, y: 20.25 },
    ]);
  });

  it('produces a transferable buffer', () => {
    expect(packLine([a, b], line).points.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
