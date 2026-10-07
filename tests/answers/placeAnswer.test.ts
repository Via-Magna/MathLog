import { describe, it, expect } from 'vitest';
import { DIGIT_HEIGHT_EM, MAX_FONT_PX, MIN_FONT_PX, fontSizeFor, gapFor, placeAnswer, type PlaceInput } from '../../src/answers/placeAnswer';
import { line } from './helpers';

/** Every glyph is half the font size wide. */
const measure = (text: string, px: number) => text.length * px * 0.5;
const canvas = { width: 800, height: 600 };

const place = (over: Partial<PlaceInput> = {}) =>
  placeAnswer({ line: line(), text: '30', measure, canvas, obstacles: [], ...over });

describe('font size', () => {
  it('matches the written digit height: 18 px font up to 120 px digits', () => {
    expect(fontSizeFor(40)).toBe(71);
    // The answer's digits are as tall as the written ones.
    expect(fontSizeFor(40) * DIGIT_HEIGHT_EM).toBeCloseTo(40, 0);
    expect(fontSizeFor(5)).toBe(MIN_FONT_PX);
    expect(fontSizeFor(500)).toBe(MAX_FONT_PX);
    expect(MAX_FONT_PX * DIGIT_HEIGHT_EM).toBeCloseTo(120, 0);
  });

  it('gap scales with the writing, within 6–36 px', () => {
    expect(gapFor(40)).toBe(12);
    expect(gapFor(1)).toBe(6);
    expect(gapFor(1000)).toBe(36);
  });
});

describe('placeAnswer', () => {
  it('sits just right of the "=", centred on it', () => {
    const p = place();
    expect(p.where).toBe('right');
    expect(p.fontPx).toBe(71);
    expect(p.x).toBe(80 + 12);
    const eqCentre = 115 + 13 / 2;
    expect(p.box.y + p.box.h / 2).toBeCloseTo(eqCentre);
    expect(p.baseline).toBeCloseTo(eqCentre + (71 * DIGIT_HEIGHT_EM) / 2);
    expect(p.box.w).toBe(measure('30', 71));
  });

  it('goes after any ink written beyond the "="', () => {
    const p = place({ line: line({ bounds: { x: 0, y: 100, w: 140, h: 40 } }) });
    expect(p.x).toBe(140 + 12);
  });

  it('centres on the line when no "=" was found', () => {
    const p = place({ line: line({ equals: null }) });
    expect(p.x).toBe(92);
    expect(p.box.y + p.box.h / 2).toBeCloseTo(120);
  });

  it('shrinks to fit before the canvas edge', () => {
    const p = place({ text: '123456', canvas: { width: 200, height: 600 } });
    expect(p.where).toBe('right');
    expect(p.fontPx).toBe(33);
    expect(p.box.x + p.box.w).toBeLessThanOrEqual(192);
  });

  it('shrinks to fit before a neighbouring equation', () => {
    const p = place({ obstacles: [{ x: 120, y: 100, w: 50, h: 40 }] });
    expect(p.where).toBe('right');
    expect(p.fontPx).toBe(22);
    expect(p.box.x + p.box.w).toBeLessThanOrEqual(120);
  });

  it('moves under the "=" when there is no room on the right', () => {
    const p = place({ obstacles: [{ x: 95, y: 100, w: 50, h: 40 }] });
    expect(p.where).toBe('below');
    expect(p.x).toBe(60);
    expect(p.box.y).toBeGreaterThanOrEqual(140);
    expect(p.fontPx).toBe(57);
  });

  it('pulls a below-placed answer back inside the canvas', () => {
    const p = place({
      text: '123456',
      line: line({ bounds: { x: 100, y: 100, w: 80, h: 40 }, equals: { bounds: { x: 160, y: 115, w: 20, h: 13 }, strokeIds: ['a', 'b'] } }),
      canvas: { width: 200, height: 600 },
    });
    expect(p.where).toBe('below');
    expect(p.box.x + p.box.w).toBeLessThanOrEqual(192);
  });

  it('falls back to a small answer on the right when nothing is free', () => {
    const p = place({ obstacles: [{ x: -1000, y: -1000, w: 5000, h: 5000 }] });
    expect(p.where).toBe('right');
    expect(p.fontPx).toBe(MIN_FONT_PX);
    expect(p.x).toBe(92);
  });
});
