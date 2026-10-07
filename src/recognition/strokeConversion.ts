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
  /** Erases earlier strokes (destination-out); `lineWidth` is the eraser radius. */
  isEraser?: boolean;
}

/** A line's strokes packed into one transferable buffer. */
export interface PackedLine {
  /** x0, y0, x1, y1, … for every point of every stroke. */
  points: Float32Array;
  strokeLengths: number[];
  lineWidths: number[];
  /** Per stroke: true for eraser paths. Omitted when the line has none. */
  isEraser?: boolean[];
}

/**
 * Packs a line's strokes into a Float32Array, shifting coordinates so the
 * line's top-left corner is (0, 0). Without erasers the order is
 * `line.strokeIds` (left to right); with erasers it is drawing order, so each
 * eraser only cuts ink drawn before it. Ids not found in `strokes` are skipped.
 */
export function packLine(strokes: readonly Stroke[], line: EquationLine): PackedLine {
  let members: Stroke[];
  if (line.eraserIds.length === 0) {
    const byId = new Map(strokes.map((s) => [s.id, s]));
    members = line.strokeIds.map((id) => byId.get(id)).filter((s): s is Stroke => s !== undefined);
  } else {
    const wanted = new Set([...line.strokeIds, ...line.eraserIds]);
    members = strokes.filter((s) => wanted.has(s.id));
  }

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
  const packed: PackedLine = {
    points,
    strokeLengths: members.map((s) => s.points.length),
    lineWidths: members.map((s) => s.width),
  };
  if (line.eraserIds.length > 0) packed.isEraser = members.map((s) => s.isEraser === true);
  return packed;
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
    const stroke: InkStroke = { points, lineWidth: packed.lineWidths[s] };
    if (packed.isEraser?.[s]) stroke.isEraser = true;
    out.push(stroke);
  });
  return out;
}
