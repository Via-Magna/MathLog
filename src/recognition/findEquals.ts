import type { Bounds } from '../math/symbols';

/**
 * Finds a line's "=" from stroke geometry, so the answer can sit just right
 * of it. The model only says *that* there is an "=", not *where*. Pure.
 *
 * An "=" is two flat, horizontal bars stacked one above the other, of similar
 * width and overlapping horizontally. If several pairs qualify (e.g. "3=3="),
 * the rightmost wins, since the answer goes after the last "=".
 */

export interface StrokeBox {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface EqualsSign {
  /** Union of the two bars, canvas CSS px. */
  bounds: Bounds;
  /** [top bar, bottom bar] stroke ids. */
  strokeIds: [string, string];
}

export interface EqualsOptions {
  /** A bar is at most this × lineHeight tall… */
  maxBarHeight: number;
  /** …at least this × lineHeight wide… */
  minBarWidth: number;
  /** …and at least this many times wider than tall. */
  minAspect: number;
  /** Bars' centres are this × lineHeight apart, vertically (min, max). */
  minGap: number;
  maxGap: number;
  /** Horizontal overlap needed, as a share of the narrower bar. */
  minOverlap: number;
  /** Narrower bar ÷ wider bar. */
  minWidthRatio: number;
}

export const DEFAULT_EQUALS: EqualsOptions = {
  maxBarHeight: 0.35,
  minBarWidth: 0.25,
  minAspect: 1.5,
  minGap: 0.08,
  maxGap: 0.9,
  minOverlap: 0.5,
  minWidthRatio: 0.4,
};

const width = (b: StrokeBox) => b.maxX - b.minX;
const height = (b: StrokeBox) => b.maxY - b.minY;
const centreY = (b: StrokeBox) => (b.minY + b.maxY) / 2;

export function findEquals(
  boxes: readonly StrokeBox[],
  lineHeight: number,
  options: Partial<EqualsOptions> = {},
): EqualsSign | null {
  const o = { ...DEFAULT_EQUALS, ...options };
  const bars = boxes.filter((b) => {
    const w = width(b);
    const h = height(b);
    return h <= o.maxBarHeight * lineHeight && w >= o.minBarWidth * lineHeight && w >= o.minAspect * h;
  });

  let best: EqualsSign | null = null;
  let bestRight = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const [top, bottom] = centreY(bars[i]) <= centreY(bars[j]) ? [bars[i], bars[j]] : [bars[j], bars[i]];
      const gap = centreY(bottom) - centreY(top);
      if (gap < o.minGap * lineHeight || gap > o.maxGap * lineHeight) continue;

      const narrow = Math.min(width(top), width(bottom));
      const wide = Math.max(width(top), width(bottom));
      if (narrow < o.minWidthRatio * wide) continue;
      const overlap = Math.min(top.maxX, bottom.maxX) - Math.max(top.minX, bottom.minX);
      if (overlap < o.minOverlap * narrow) continue;

      const right = Math.max(top.maxX, bottom.maxX);
      if (right <= bestRight) continue;
      bestRight = right;
      const x = Math.min(top.minX, bottom.minX);
      const y = Math.min(top.minY, bottom.minY);
      best = {
        bounds: { x, y, w: right - x, h: Math.max(top.maxY, bottom.maxY) - y },
        strokeIds: [top.id, bottom.id],
      };
    }
  }
  return best;
}
