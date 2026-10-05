import type { Point, Stroke } from '../types';
import { ERASER_HIT_THRESHOLD } from './constants';

/**
 * Computes the axis-aligned bounding box (AABB) of a stroke.
 * Returns { minX, minY, maxX, maxY }.
 */
export function computeBoundingBox(points: Point[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Computes the minimum distance from a point to a line segment AB.
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a single point
    const ddx = px - ax;
    const ddy = py - ay;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  // Project point onto the line, clamping t to [0, 1]
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ddx = px - projX;
  const ddy = py - projY;

  return Math.sqrt(ddx * ddx + ddy * ddy);
}

/**
 * Tests whether a pointer position (px, py) "hits" a given stroke.
 * First does a fast AABB rejection, then a precise segment distance check.
 */
export function hitTestStroke(
  px: number,
  py: number,
  stroke: Stroke,
  threshold: number = ERASER_HIT_THRESHOLD
): boolean {
  const { points } = stroke;
  if (points.length === 0) return false;

  // Fast AABB rejection test
  const bbox = computeBoundingBox(points);
  if (
    px < bbox.minX - threshold ||
    px > bbox.maxX + threshold ||
    py < bbox.minY - threshold ||
    py > bbox.maxY + threshold
  ) {
    return false;
  }

  // Single-point stroke: just check distance to that point
  if (points.length === 1) {
    const dx = px - points[0].x;
    const dy = py - points[0].y;
    return Math.sqrt(dx * dx + dy * dy) <= threshold;
  }

  // Check distance to each line segment
  for (let i = 0; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(
      px, py,
      points[i].x, points[i].y,
      points[i + 1].x, points[i + 1].y
    );
    if (dist <= threshold) return true;
  }

  return false;
}
