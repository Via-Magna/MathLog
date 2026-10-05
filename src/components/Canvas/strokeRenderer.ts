import getStroke from 'perfect-freehand';
import type { Stroke } from '../../types';
import { FREEHAND_OPTIONS } from '../../utils/constants';

/**
 * Converts a perfect-freehand outline (array of [x, y] points) into
 * an SVG path data string, which can be used with Path2D.
 */
function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';

  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );

  d.push('Z');
  return d.join(' ');
}

/**
 * Renders smooth ink or a constant-width, round eraser path.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke
): void {
  if (stroke.points.length === 0) return;

  if (stroke.isEraser) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = stroke.width * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = stroke.points[0];
    if (stroke.points.length === 1) {
      ctx.arc(first.x, first.y, stroke.width, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(first.x, first.y);
      for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const inputPoints = stroke.points.map((p) => [p.x, p.y, p.pressure]);
  const outlinePoints = getStroke(inputPoints, {
    size: stroke.width * 2,
    ...FREEHAND_OPTIONS,
  });

  const pathData = getSvgPathFromStroke(outlinePoints);
  const path = new Path2D(pathData);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = stroke.color;
  
  ctx.fill(path);
  ctx.restore();
}

/**
 * Renders all strokes in the given array onto a canvas context.
 * Clears the canvas first. (Assumes transparent background).
 */
export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  strokes: Stroke[]
): void {
  clearCanvasLayer(ctx, canvas);

  for (const stroke of strokes) {
    renderStroke(ctx, stroke);
  }
}

/**
 * Renders the solid background color and optional grid lines onto the lines canvas.
 */
export function renderGridLines(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  bgColor: string,
  showLines: boolean
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (showLines) {
    ctx.save();
    ctx.beginPath();
    const LINE_SPACING = 30;
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]); 

    const transform = ctx.getTransform();
    const width = canvas.width / transform.a;
    const height = canvas.height / transform.d;
    for (let y = LINE_SPACING; y < height; y += LINE_SPACING) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Renders an in-progress stroke (active points not yet committed) onto
 * the foreground canvas. Clears the foreground first.
 */
export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  stroke: Stroke,
  background: HTMLCanvasElement
): void {
  clearCanvasLayer(ctx, canvas);
  if (stroke.isEraser) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(background, 0, 0);
    ctx.restore();
  }
  renderStroke(ctx, stroke);
}

export function clearCanvasLayer(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
