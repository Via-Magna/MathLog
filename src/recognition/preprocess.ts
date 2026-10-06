import type { InkPoint, InkStroke } from './strokeConversion';

/**
 * Pure parts of ink-on's stroke preprocessing, ported from
 * kimseungdae/ink-on src/core/preprocessing.ts (Apache-2.0).
 *
 * ink-on's own `preprocessStrokes` calls `document.createElement('canvas')`,
 * which does not exist in a Web Worker, so the drawing half lives in
 * `preprocessCanvas.ts` (OffscreenCanvas) and the maths lives here.
 * Constants are unchanged so the model sees the same input it was tuned for.
 */

export const MODEL_H = 256;
export const MAX_W = 1024;
export const MIN_W = 128;
/** Width aligned to a multiple of 64 for the conv/pool layers. */
export const W_ALIGN = 64;
/** CROHME images average ~107 px high; content is scaled to this height. */
export const TARGET_H = 128;
export const PAD = 16;
export const RESAMPLE_INTERVAL = 3;

/** Same shape as ink-on's `PreprocessResult`, accepted by `InferenceEngine.recognize`. */
export interface PreprocessResult {
  tensor: Float32Array;
  height: number;
  width: number;
  /** 1 = padding, 0 = content. */
  mask: Uint8Array;
  maskHeight: number;
  maskWidth: number;
}

export interface InkBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Resamples a polyline at a uniform spacing (ink-on: 3 px). */
export function resamplePoints(points: InkPoint[], interval = RESAMPLE_INTERVAL): InkPoint[] {
  if (points.length < 2) return points;
  const resampled: InkPoint[] = [points[0]];
  let remaining = interval;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= remaining) {
      remaining -= dist;
      continue;
    }
    let covered = remaining;
    while (covered <= dist) {
      const t = covered / dist;
      resampled.push({ x: prev.x + dx * t, y: prev.y + dy * t });
      covered += interval;
    }
    remaining = covered - dist;
  }
  resampled.push(points[points.length - 1]);
  return resampled;
}

export function inkBBox(strokes: readonly InkStroke[]): InkBBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

const MIN_STROKE_SIZE = 8;
const MIN_TOTAL_POINTS = 6;
const MIN_PATH_LENGTH = 15;

/** ink-on's filter for dots and accidental taps. */
export function isStrokeMeaningful(strokes: readonly InkStroke[]): boolean {
  if (strokes.length === 0) return false;
  const bbox = inkBBox(strokes);
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  if (!(w >= MIN_STROKE_SIZE || h >= MIN_STROKE_SIZE)) return false;

  let totalPoints = 0;
  let totalLength = 0;
  for (const s of strokes) {
    totalPoints += s.points.length;
    for (let i = 1; i < s.points.length; i++) {
      const dx = s.points[i].x - s.points[i - 1].x;
      const dy = s.points[i].y - s.points[i - 1].y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }
  }
  return totalPoints >= MIN_TOTAL_POINTS && totalLength >= MIN_PATH_LENGTH;
}

export interface RawCanvasSize {
  width: number;
  height: number;
}

/** Size of the first-pass canvas: the ink's box plus PAD on every side. */
export function rawCanvasSize(bbox: InkBBox): RawCanvasSize {
  const rawW = Math.max(1, Math.ceil(bbox.maxX - bbox.minX));
  const rawH = Math.max(1, Math.ceil(bbox.maxY - bbox.minY));
  return { width: rawW + PAD * 2, height: rawH + PAD * 2 };
}

export interface TargetLayout {
  /** Drawn content size inside the model canvas. */
  contentW: number;
  contentH: number;
  /** Model canvas width (height is always MODEL_H). */
  canvasW: number;
}

/** Scales content to TARGET_H (or MAX_W), top-left aligned, width rounded up to W_ALIGN. */
export function targetLayout(src: RawCanvasSize): TargetLayout {
  const scale = Math.min(TARGET_H / src.height, MAX_W / src.width);
  const contentW = Math.max(1, Math.round(src.width * scale));
  const contentH = Math.max(1, Math.round(src.height * scale));
  const canvasW = Math.min(MAX_W, Math.max(MIN_W, Math.ceil((contentW + PAD) / W_ALIGN) * W_ALIGN));
  return { contentW, contentH, canvasW };
}

/** Padding mask: 0 inside the content rectangle, 1 elsewhere. */
export function buildMask(layout: TargetLayout): Uint8Array {
  const { canvasW, contentW, contentH } = layout;
  const mask = new Uint8Array(MODEL_H * canvasW);
  for (let y = 0; y < MODEL_H; y++) {
    const row = y * canvasW;
    for (let x = 0; x < canvasW; x++) {
      mask[row + x] = y < contentH && x < contentW ? 0 : 1;
    }
  }
  return mask;
}

/** RGBA bytes → grayscale floats in [0, 1] (ITU-R 601 luma, as ink-on). */
export function rgbaToGray(data: Uint8ClampedArray, pixels: number): Float32Array {
  const tensor = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    tensor[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
  }
  return tensor;
}
