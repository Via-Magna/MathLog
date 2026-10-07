import type { Bounds } from '../math/symbols';
import type { LineResult } from '../store/useRecognitionStore';

/**
 * Where an answer goes and how big it is. Pure: text width comes from an
 * injected `measure`, so this runs in tests without a canvas.
 *
 * Rules, in order:
 * 1. Font size follows the writing: digits drawn as tall as the user's,
 *    from an 18 px font up to 120 px tall digits.
 * 2. Just right of the line (normally its "="), vertically centred on the "=".
 * 3. If that runs off the canvas or into other ink/answers, shrink to fit
 *    the free space (down to MIN_FONT_PX).
 * 4. Still no room: under the "=", right-aligned to the canvas if needed.
 * 5. Nowhere free: the right-hand spot at minimum size (overlap beats hiding).
 */

/** Caveat's digit height as a share of the font size (measured in Chrome: 0–9 ascend ≈ 0.56 em). */
export const DIGIT_HEIGHT_EM = 0.56;
export const MIN_FONT_PX = 18;
/** Caps the answer's digits at 120 px tall, so even very large writing can be matched. */
export const MAX_FONT_PX = Math.round(120 / DIGIT_HEIGHT_EM);
/** Canvas edge margin, px. */
export const EDGE_MARGIN = 8;

/** Width in CSS px of `text` at `fontPx`. */
export type MeasureText = (text: string, fontPx: number) => number;

export interface Placement {
  /** Left edge of the text, CSS px. */
  x: number;
  /** Alphabetic baseline, CSS px. */
  baseline: number;
  fontPx: number;
  /** Box the text occupies, for collisions and hit areas. */
  box: Bounds;
  where: 'right' | 'below';
}

export interface PlaceInput {
  line: Pick<LineResult, 'bounds' | 'lineHeight' | 'equals'>;
  text: string;
  measure: MeasureText;
  canvas: { width: number; height: number };
  /** Other lines' ink and already placed answers. */
  obstacles: readonly Bounds[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fontSizeFor(lineHeight: number): number {
  return Math.round(clamp(lineHeight / DIGIT_HEIGHT_EM, MIN_FONT_PX, MAX_FONT_PX));
}

/** Gap between the "=" and the answer, px. */
export function gapFor(lineHeight: number): number {
  return clamp(lineHeight * 0.3, 6, 36);
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function boxAt(x: number, centreY: number, width: number, fontPx: number): Bounds {
  // Caveat's digits sit within ~0.56 em; leave room for descenders and taller glyphs like "?".
  const h = fontPx * 0.8;
  return { x, y: centreY - h / 2, w: width, h };
}

function toPlacement(box: Bounds, fontPx: number, where: Placement['where']): Placement {
  const centreY = box.y + box.h / 2;
  return { x: box.x, baseline: centreY + (fontPx * DIGIT_HEIGHT_EM) / 2, fontPx, box, where };
}

export function placeAnswer({ line, text, measure, canvas, obstacles }: PlaceInput): Placement {
  const { bounds, lineHeight, equals } = line;
  const gap = gapFor(lineHeight);
  const anchor = equals?.bounds ?? bounds;
  const centreY = anchor.y + anchor.h / 2;
  // Right of all of the line's ink: normally the "=", but never on top of ink written after it.
  const x = Math.max(anchor.x + anchor.w, bounds.x + bounds.w) + gap;
  const rightLimit = canvas.width - EDGE_MARGIN;

  const free = (box: Bounds) =>
    box.x + box.w <= rightLimit && box.y >= 0 && box.y + box.h <= canvas.height && !obstacles.some((o) => overlaps(box, o));

  // 2. Full size, right of the "=".
  const fullPx = fontSizeFor(lineHeight);
  const full = boxAt(x, centreY, measure(text, fullPx), fullPx);
  if (free(full)) return toPlacement(full, fullPx, 'right');

  // 3. Shrink to the room before the canvas edge or the nearest obstacle on that row.
  const blockers = obstacles.filter((o) => o.x + o.w > x && o.y < full.y + full.h && o.y + o.h > full.y);
  const limit = Math.min(rightLimit, ...blockers.map((o) => o.x - gap / 2));
  const room = limit - x;
  if (room > 0) {
    const scaled = Math.floor((fullPx * room) / full.w);
    const px = Math.min(fullPx, scaled);
    if (px >= MIN_FONT_PX) {
      const box = boxAt(x, centreY, measure(text, px), px);
      if (free(box)) return toPlacement(box, px, 'right');
    }
  }

  // 4. Below the "=", pulled left if it would run off the canvas.
  const belowPx = Math.max(MIN_FONT_PX, Math.min(fullPx, fontSizeFor(lineHeight * 0.8)));
  const belowW = measure(text, belowPx);
  const belowX = clamp(anchor.x, EDGE_MARGIN, Math.max(EDGE_MARGIN, rightLimit - belowW));
  const belowTop = bounds.y + bounds.h + gap / 2;
  const below = boxAt(belowX, belowTop + belowPx * 0.4, belowW, belowPx);
  if (free(below)) return toPlacement(below, belowPx, 'below');

  // 5. Give up gracefully.
  const fallback = boxAt(x, centreY, measure(text, MIN_FONT_PX), MIN_FONT_PX);
  return toPlacement(fallback, MIN_FONT_PX, 'right');
}
