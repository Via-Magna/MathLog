import {
  MODEL_H,
  PAD,
  buildMask,
  inkBBox,
  rawCanvasSize,
  resamplePoints,
  rgbaToGray,
  targetLayout,
  type PreprocessResult,
} from './preprocess';
import type { InkStroke } from './strokeConversion';

/**
 * Worker-safe version of ink-on's `preprocessStrokes` using OffscreenCanvas.
 * Same steps as the original (kimseungdae/ink-on, Apache-2.0):
 * white strokes on black, quadratic smoothing, scale to 128 px high,
 * top-left aligned on a 256 px high canvas, grayscale tensor + padding mask.
 */

type Ctx = OffscreenCanvasRenderingContext2D;

let rawCanvas: OffscreenCanvas | null = null;
let targetCanvas: OffscreenCanvas | null = null;

function canvasOf(cache: 'raw' | 'target', w: number, h: number): OffscreenCanvas {
  const fw = Math.max(1, Math.floor(w));
  const fh = Math.max(1, Math.floor(h));
  let c = cache === 'raw' ? rawCanvas : targetCanvas;
  if (!c) {
    c = new OffscreenCanvas(fw, fh);
    if (cache === 'raw') rawCanvas = c;
    else targetCanvas = c;
  } else if (c.width !== fw || c.height !== fh) {
    c.width = fw;
    c.height = fh;
  }
  return c;
}

function context(c: OffscreenCanvas): Ctx {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  return ctx;
}

function renderStrokes(strokes: readonly InkStroke[]): OffscreenCanvas {
  const bbox = inkBBox(strokes);
  const size = rawCanvasSize(bbox);
  const canvas = canvasOf('raw', size.width, size.height);
  const ctx = context(canvas);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const tx = (x: number) => x - bbox.minX + PAD;
  const ty = (y: number) => y - bbox.minY + PAD;

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const pts = resamplePoints(stroke.points);
    ctx.beginPath();
    ctx.lineWidth = Math.max(2, stroke.lineWidth);
    ctx.moveTo(tx(pts[0].x), ty(pts[0].y));
    if (pts.length === 1) {
      // A single tap: draw a dot so decimal points are visible.
      ctx.lineTo(tx(pts[0].x) + 0.01, ty(pts[0].y));
    } else if (pts.length === 2) {
      ctx.lineTo(tx(pts[1].x), ty(pts[1].y));
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(tx(pts[i].x), ty(pts[i].y), tx(mx), ty(my));
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(tx(last.x), ty(last.y));
    }
    ctx.stroke();
  }
  return canvas;
}

export function preprocessStrokes(strokes: readonly InkStroke[]): PreprocessResult {
  const raw = renderStrokes(strokes);
  const layout = targetLayout({ width: raw.width, height: raw.height });
  const target = canvasOf('target', layout.canvasW, MODEL_H);
  const ctx = context(target);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, layout.canvasW, MODEL_H);
  ctx.drawImage(raw, 0, 0, layout.contentW, layout.contentH);

  const pixels = layout.canvasW * MODEL_H;
  const image = ctx.getImageData(0, 0, layout.canvasW, MODEL_H);
  return {
    tensor: rgbaToGray(image.data, pixels),
    height: MODEL_H,
    width: layout.canvasW,
    mask: buildMask(layout),
    maskHeight: MODEL_H,
    maskWidth: layout.canvasW,
  };
}
