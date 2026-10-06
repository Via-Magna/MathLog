/**
 * A single sampled coordinate from a pointer event.
 * All coordinates are in logical (CSS) pixels relative to the canvas element.
 */
export interface Point {
  x: number;
  y: number;
  /** Pressure from Pointer Events API. 0.0–1.0. Defaults to 0.5 for mouse. */
  pressure: number;
}

/**
 * A single completed drawing gesture (pointerdown → pointermove × N → pointerup).
 * Strokes are the single source of truth for what is on the canvas.
 */
export interface Stroke {
  /** Unique identifier (crypto.randomUUID()). Used for targeted erasing. */
  id: string;
  /** Ordered array of sampled points making up this stroke. */
  points: Point[];
  /** Hex color of this stroke, captured at time of drawing. */
  color: string;
  /** Base stroke width in logical pixels, captured at time of drawing. */
  width: number;
  /** Timestamp (Date.now()) when stroke was committed (pointerup). */
  createdAt: number;
  /** True if this stroke represents an erasure path */
  isEraser?: boolean;
}

/** Available drawing tools */
export type Tool = 'pen' | 'eraser';
