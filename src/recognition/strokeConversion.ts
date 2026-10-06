import type { Stroke } from '../types';
import type { EquationLine } from './lineGrouping';

/** ink-on's stroke shape. Coordinates are line-relative CSS px. */
export interface InkPoint {
  x: number;
  y: number;
}

export interface InkStroke {
  points: InkPoint[];
  lineWidth: number;
}

/** A line's strokes packed into one transferable buffer. */
export interface PackedLine {
  /** x0, y0, x1, y1, … for every point of every stroke. */
  points: Float32Array;
  strokeLengths: number[];
  lineWidths: number[];
}

/**
 * Packs a line's strokes (in `line.strokeIds` order) into a Float32Array,
 * shifting coordinates so the line's top-left corner is (0, 0).
 * Stroke ids not found in `strokes` are skipped.
 */
export function packLine(strokes: readonly Stroke[], line: EquationLine): PackedLine {
  const byId = new Map(strokes.map((s) => [s.id, s]));
  const members = line.strokeIds
    .map((id) => byId.get(id))
    .filter((s): s is Stroke => s !== undefined);

  const total = members.reduce((n, s) => n + s.points.length, 0);
  const points = new Float32Array(total * 2);
  const ox = line.bounds.x;
  const oy = line.bounds.y;
  let i = 0;
  for (const s of members) {
    for (const p of s.points) {
      points[i++] = p.x - ox;
      points[i++] = p.y - oy;
    }
  }
  return {
    points,
    strokeLengths: members.map((s) => s.points.length),
    lineWidths: members.map((s) => s.width),
  };
}

/** Rebuilds ink-on strokes from a packed line (runs in the worker). */
export function unpackLine(packed: PackedLine): InkStroke[] {
  const out: InkStroke[] = [];
  let i = 0;
  packed.strokeLengths.forEach((len, s) => {
    const points: InkPoint[] = [];
    for (let k = 0; k < len; k++) {
      points.push({ x: packed.points[i], y: packed.points[i + 1] });
      i += 2;
    }
    out.push({ points, lineWidth: packed.lineWidths[s] });
  });
  return out;
}
