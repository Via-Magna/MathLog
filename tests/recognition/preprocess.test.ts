import { describe, it, expect } from 'vitest';
import {
  MAX_W,
  MIN_W,
  MODEL_H,
  PAD,
  TARGET_H,
  buildMask,
  inkBBox,
  isStrokeMeaningful,
  rawCanvasSize,
  resamplePoints,
  rgbaToGray,
  targetLayout,
} from '../../src/recognition/preprocess';
import type { InkStroke } from '../../src/recognition/strokeConversion';

const line = (pts: [number, number][], lineWidth = 3): InkStroke => ({
  points: pts.map(([x, y]) => ({ x, y })),
  lineWidth,
});

describe('resamplePoints', () => {
  it('leaves 0 or 1 points alone', () => {
    expect(resamplePoints([])).toEqual([]);
    expect(resamplePoints([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
  });

  it('spaces points evenly along the path', () => {
    const out = resamplePoints([{ x: 0, y: 0 }, { x: 9, y: 0 }], 3);
    expect(out.map((p) => p.x)).toEqual([0, 3, 6, 9, 9]);
  });

  it('skips points closer than the interval', () => {
    const out = resamplePoints([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 6, y: 0 }], 3);
    expect(out.map((p) => p.x)).toEqual([0, 3, 6, 6]);
  });
});

describe('isStrokeMeaningful (ink-on filter)', () => {
  it('rejects nothing and taps', () => {
    expect(isStrokeMeaningful([])).toBe(false);
    expect(isStrokeMeaningful([line([[0, 0]])])).toBe(false);
    expect(isStrokeMeaningful([line([[0, 0], [3, 3]])])).toBe(false);
  });

  it('rejects strokes with too few points or too little length', () => {
    expect(isStrokeMeaningful([line([[0, 0], [0, 20]])])).toBe(false); // 2 points
    expect(isStrokeMeaningful([line([[0, 0], [0, 2], [0, 4], [0, 6], [0, 8], [0, 9]])])).toBe(false); // 9 px long
  });

  it('accepts a real digit', () => {
    const one = line(Array.from({ length: 8 }, (_, i) => [0, i * 5] as [number, number]));
    expect(isStrokeMeaningful([one])).toBe(true);
  });
});

describe('canvas layout', () => {
  it('pads the raw canvas around the ink box', () => {
    const bbox = inkBBox([line([[10, 20], [110, 60]])]);
    expect(bbox).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 60 });
    expect(rawCanvasSize(bbox)).toEqual({ width: 100 + 2 * PAD, height: 40 + 2 * PAD });
  });

  it('scales content to the target height and aligns width to 64', () => {
    const layout = targetLayout({ width: 400, height: 64 });
    expect(layout.contentH).toBe(TARGET_H);
    expect(layout.contentW).toBe(800);
    expect(layout.canvasW % 64).toBe(0);
    expect(layout.canvasW).toBeGreaterThanOrEqual(layout.contentW + PAD);
  });

  it('clamps very wide content to MAX_W', () => {
    const layout = targetLayout({ width: 5000, height: 50 });
    expect(layout.contentW).toBeLessThanOrEqual(MAX_W);
    expect(layout.canvasW).toBe(MAX_W);
  });

  it('never goes below MIN_W', () => {
    expect(targetLayout({ width: 10, height: 200 }).canvasW).toBe(MIN_W);
  });

  it('builds a mask that is 0 over content and 1 elsewhere', () => {
    const mask = buildMask({ contentW: 2, contentH: 3, canvasW: 128 });
    expect(mask).toHaveLength(MODEL_H * 128);
    expect(mask[0]).toBe(0);
    expect(mask[1]).toBe(0);
    expect(mask[2]).toBe(1);
    expect(mask[2 * 128 + 1]).toBe(0);
    expect(mask[3 * 128]).toBe(1);
  });

  it('converts RGBA to grayscale in [0, 1]', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]);
    const gray = rgbaToGray(data, 3);
    expect(gray[0]).toBeCloseTo(1, 5);
    expect(gray[1]).toBe(0);
    expect(gray[2]).toBeCloseTo(0.299, 5);
  });
});
