/** Default ink color */
export const DEFAULT_STROKE_COLOR = '#1a1a2e';

/** Default pen width in logical pixels */
export const DEFAULT_STROKE_WIDTH = 3;

/** Min/max stroke width range */
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 10;

/** Maximum undo stack depth */
export const MAX_UNDO_STACK_SIZE = 50;

/** Eraser hit-test distance threshold in logical pixels */
export const ERASER_HIT_THRESHOLD = 10;

/** perfect-freehand configuration */
export const FREEHAND_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
} as const;

/** Canvas background color */
export const CANVAS_BG_COLOR = '#f5f5f5';
