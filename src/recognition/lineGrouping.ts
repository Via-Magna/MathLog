import type { Bounds } from '../math/symbols';
import type { Stroke } from '../types';
import { computeBoundingBox } from '../utils/geometry';

/**
 * Splits canvas strokes into equation lines. ink-on reads one expression per
 * call, so each line is recognized separately. Pure and O(n log n).
 */

export interface EquationLine {
  /** Stable id: FNV-1a hash of the sorted stroke ids. Same strokes → same key. */
  key: string;
  /** Stroke ids, left to right by bounding-box minX. */
  strokeIds: string[];
  /** Union of the strokes' boxes, canvas CSS px. */
  bounds: Bounds;
}

export interface GroupingOptions {
  /** Strokes at most this tall (px) are ignored when estimating line height. */
  minTallHeight: number;
  /** Vertical overlap needed to join a line, as a share of the smaller height. */
  overlapRatio: number;
  /** A stroke whose centre is within this × H of the line's centre also joins. */
  centreRatio: number;
  /** Strokes shorter than this × H (dots, −, = bars) attach to the nearest line. */
  smallRatio: number;
  /** A horizontal gap wider than this × H splits a line in two. */
  gapRatio: number;
  /** Small strokes farther than this × H from every line start their own line. */
  maxAttachRatio: number;
  /** Line height used when there are no tall strokes. */
  defaultLineHeight: number;
}

export const DEFAULT_GROUPING: GroupingOptions = {
  minTallHeight: 8,
  overlapRatio: 0.4,
  centreRatio: 0.6,
  smallRatio: 0.35,
  gapRatio: 4,
  maxAttachRatio: 1,
  defaultLineHeight: 40,
};

interface Box {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  h: number;
  cy: number;
}

interface Group {
  minY: number;
  maxY: number;
  members: Box[];
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 32-bit FNV-1a, hex. Collisions only matter within one canvas, where they are vanishingly unlikely. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function lineKey(strokeIds: readonly string[]): string {
  return fnv1a([...strokeIds].sort().join('|'));
}

function toBox(stroke: Stroke): Box {
  const { minX, minY, maxX, maxY } = computeBoundingBox(stroke.points);
  return { id: stroke.id, minX, minY, maxX, maxY, h: maxY - minY, cy: (minY + maxY) / 2 };
}

function verticalDistance(box: Box, group: Group): number {
  if (box.cy < group.minY) return group.minY - box.cy;
  if (box.cy > group.maxY) return box.cy - group.maxY;
  return 0;
}

function toLine(members: Box[]): EquationLine {
  const sorted = [...members].sort((a, b) => a.minX - b.minX);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of sorted) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const strokeIds = sorted.map((b) => b.id);
  return {
    key: lineKey(strokeIds),
    strokeIds,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

/** Splits one group where the horizontal gap between neighbours exceeds `maxGap`. */
function splitByGap(members: Box[], maxGap: number): Box[][] {
  const sorted = [...members].sort((a, b) => a.minX - b.minX);
  const parts: Box[][] = [];
  let current: Box[] = [];
  let runMaxX = -Infinity;
  for (const b of sorted) {
    if (current.length > 0 && b.minX - runMaxX > maxGap) {
      parts.push(current);
      current = [];
      runMaxX = -Infinity;
    }
    current.push(b);
    runMaxX = Math.max(runMaxX, b.maxX);
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export function groupIntoLines(
  strokes: readonly Stroke[],
  options: Partial<GroupingOptions> = {},
): EquationLine[] {
  const opts = { ...DEFAULT_GROUPING, ...options };
  const boxes = strokes.filter((s) => s.points.length > 0).map(toBox);
  if (boxes.length === 0) return [];

  const H = median(boxes.filter((b) => b.h > opts.minTallHeight).map((b) => b.h)) ?? opts.defaultLineHeight;

  let small = boxes.filter((b) => b.h < opts.smallRatio * H);
  let big = boxes.filter((b) => b.h >= opts.smallRatio * H);
  if (big.length === 0) {
    big = small;
    small = [];
  }

  // 1. Tall strokes, top to bottom: join the current line or start a new one.
  big.sort((a, b) => a.cy - b.cy);
  const groups: Group[] = [];
  for (const b of big) {
    const cur = groups.at(-1);
    if (cur) {
      const overlap = Math.min(b.maxY, cur.maxY) - Math.max(b.minY, cur.minY);
      const curH = cur.maxY - cur.minY;
      const centreGap = Math.abs(b.cy - (cur.minY + cur.maxY) / 2);
      if (overlap >= opts.overlapRatio * Math.min(b.h, curH) || centreGap <= opts.centreRatio * H) {
        cur.members.push(b);
        cur.minY = Math.min(cur.minY, b.minY);
        cur.maxY = Math.max(cur.maxY, b.maxY);
        continue;
      }
    }
    groups.push({ minY: b.minY, maxY: b.maxY, members: [b] });
  }

  // 2. Small strokes (dots, −, = bars) attach to the nearest line.
  small.sort((a, b) => a.cy - b.cy);
  for (const s of small) {
    let best: Group | undefined;
    let bestDist = Infinity;
    for (const g of groups) {
      const d = verticalDistance(s, g);
      if (d < bestDist) {
        bestDist = d;
        best = g;
      }
    }
    if (best && bestDist <= opts.maxAttachRatio * H) {
      best.members.push(s);
    } else {
      groups.push({ minY: s.minY, maxY: s.maxY, members: [s] });
    }
  }

  // 3. Split side-by-side equations, then build stable lines.
  const lines = groups.flatMap((g) => splitByGap(g.members, opts.gapRatio * H)).map(toLine);
  return lines.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
}
