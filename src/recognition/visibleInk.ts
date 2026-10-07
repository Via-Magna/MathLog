import type { Point, Stroke } from '../types';
import { computeBoundingBox, pointToSegmentDistance } from '../utils/geometry';

/**
 * The pixel eraser (PR #24) adds `isEraser` strokes instead of deleting ink,
 * so the stroke list still holds digits the user can no longer see.
 * These helpers decide what recognition should treat as ink. Pure.
 */

/** Spacing (px) at which an ink stroke's centreline is sampled for coverage. */
const SAMPLE_STEP = 2;

interface EraserShape {
  stroke: Stroke;
  /** Bounding box grown by the eraser radius. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** An eraser path is drawn with lineWidth = width × 2, so its radius is `width`. */
export const eraserRadius = (eraser: Stroke): number => eraser.width;

function toShape(eraser: Stroke): EraserShape {
  const r = eraserRadius(eraser);
  const { minX, minY, maxX, maxY } = computeBoundingBox(eraser.points);
  return { stroke: eraser, minX: minX - r, minY: minY - r, maxX: maxX + r, maxY: maxY + r };
}

function underEraser(x: number, y: number, e: EraserShape): boolean {
  if (x < e.minX || x > e.maxX || y < e.minY || y > e.maxY) return false;
  const pts = e.stroke.points;
  const r = eraserRadius(e.stroke);
  if (pts.length === 1) return pointToSegmentDistance(x, y, pts[0].x, pts[0].y, pts[0].x, pts[0].y) <= r;
  for (let i = 1; i < pts.length; i++) {
    if (pointToSegmentDistance(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= r) return true;
  }
  return false;
}

/** Points along the polyline at most SAMPLE_STEP apart, including every vertex. */
function samples(points: readonly Point[]): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SAMPLE_STEP);
    for (let k = 1; k <= n; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, pressure: a.pressure });
    }
  }
  return out;
}

function boxesTouch(a: { minX: number; minY: number; maxX: number; maxY: number }, b: EraserShape): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** True if every sample of the ink's centreline lies under one of the erasers. */
function fullyErased(ink: Stroke, erasers: readonly EraserShape[]): boolean {
  const box = computeBoundingBox(ink.points);
  const near = erasers.filter((e) => boxesTouch(box, e));
  if (near.length === 0) return false;
  return samples(ink.points).every((p) => near.some((e) => underEraser(p.x, p.y, e)));
}

/**
 * Ink strokes that are still at least partly visible, in drawing order.
 * Eraser strokes are removed, and so is any ink whose whole centreline is
 * covered by erasers drawn *after* it (an eraser never affects later ink).
 * Partly erased ink is kept; the worker cuts it with the eraser paths.
 */
export function visibleInk(strokes: readonly Stroke[]): Stroke[] {
  const later: EraserShape[] = [];
  const kept: Stroke[] = [];
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s.points.length === 0) continue;
    if (s.isEraser) later.push(toShape(s));
    else if (!fullyErased(s, later)) kept.push(s);
  }
  return kept.reverse();
}

/**
 * Ids of eraser strokes (in drawing order) that pass over any of `ink` after
 * it was drawn. They go into the line key, so a partial erase re-reads the line.
 */
export function erasersOver(strokes: readonly Stroke[], ink: readonly Stroke[]): string[] {
  if (ink.length === 0) return [];
  const order = new Map(strokes.map((s, i) => [s.id, i]));
  const firstInk = Math.min(...ink.map((s) => order.get(s.id) ?? Infinity));
  const inkBoxes = ink.map((s) => ({ index: order.get(s.id) ?? Infinity, ...computeBoundingBox(s.points) }));
  const ids: string[] = [];
  for (let i = firstInk + 1; i < strokes.length; i++) {
    const s = strokes[i];
    if (!s.isEraser || s.points.length === 0) continue;
    const shape = toShape(s);
    if (inkBoxes.some((b) => b.index < i && boxesTouch(b, shape))) ids.push(s.id);
  }
  return ids;
}
