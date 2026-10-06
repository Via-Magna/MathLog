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
 * Renders a single stroke onto a canvas 2D context using perfect-freehand.
 * The stroke is rendered as a filled Path2D shape (not ctx.stroke()).
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke
): void {
  if (stroke.points.length === 0) return;

  // Convert Point[] to the format perfect-freehand expects: [x, y, pressure][]
  const inputPoints = stroke.points.map((p) => [p.x, p.y, p.pressure]);

  // Generate the smooth outline via perfect-freehand
  const outlinePoints = getStroke(inputPoints, {
    size: stroke.width * 2, // perfect-freehand 'size' is diameter
    ...FREEHAND_OPTIONS,
  });

  // Convert outline to an SVG path string and create a Path2D
  const pathData = getSvgPathFromStroke(outlinePoints);
  const path = new Path2D(pathData);

  // Fill the stroke outline
  ctx.fillStyle = stroke.color;
  ctx.fill(path);
}

/**
 * Renders all strokes in the given array onto a canvas context.
 * Clears the canvas first, then fills with background color, then draws all strokes.
 */
export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  bgColor: string,
  showLines: boolean = false
): void {
  // Clear entire canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fill with background color
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showLines) {
    ctx.save();
    ctx.beginPath();
    // Assuming the css dimensions are passed, wait, canvas.width/height is physical pixels
    // We should use logic that works with DPR scaling. Since ctx is already scaled,
    // canvas.width/height is larger by DPR, but ctx operations use logical CSS pixels.
    // However, canvas.width is the physical width. We should divide by DPR, or just draw
    // enough lines to cover the screen.
    // Instead of doing math with DPR here, since ctx is scaled, we can just draw lines
    // far enough down (e.g. 4000px) or pass logical dimensions.
    // For simplicity, draw up to 4000px down which covers 4K displays.
    const LINE_SPACING = 30; // 30px logical spacing
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    // Set line dash for dotted lines like the user's image
    ctx.setLineDash([4, 4]); 

    for (let y = LINE_SPACING; y < 4000; y += LINE_SPACING) {
      ctx.moveTo(0, y);
      ctx.lineTo(4000, y); // wide enough for any screen
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw each stroke
  for (const stroke of strokes) {
    renderStroke(ctx, stroke);
  }
}

/**
 * Renders an in-progress stroke (active points not yet committed) onto
 * the foreground canvas. Clears the foreground first.
 */
export function renderActiveStroke(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  points: Array<[number, number, number]>,
  color: string,
  width: number
): void {
  // Clear the foreground canvas (it's transparent)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (points.length === 0) return;

  const outlinePoints = getStroke(points, {
    size: width * 2,
    ...FREEHAND_OPTIONS,
  });

  const pathData = getSvgPathFromStroke(outlinePoints);
  const path = new Path2D(pathData);

  ctx.fillStyle = color;
  ctx.fill(path);
}
