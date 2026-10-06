/**
 * The 18 canonical symbols the math engine understands.
 * Any recognizer (currently ink-on / CoMER) must be adapted to this set
 * before calling `evaluate()`; see `src/recognition/inkOnAdapter.ts`.
 */
export const CANONICAL_SYMBOLS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '.', '=', '(', ')',
] as const;

export type CanonicalSymbol = (typeof CANONICAL_SYMBOLS)[number];

export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_SYMBOLS);

export function isCanonicalSymbol(value: unknown): value is CanonicalSymbol {
  return typeof value === 'string' && CANONICAL_SET.has(value);
}

export function isDigit(value: string): value is Digit {
  return value.length === 1 && value >= '0' && value <= '9';
}

/** Axis-aligned box in canvas CSS pixels. */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One handwritten expression, adapted from the recognizer's output. */
export interface RecognizedExpression {
  /** Canonical symbols, left to right. */
  symbols: CanonicalSymbol[];
  /** The recognizer's raw tokens, 1:1 with `symbols`, for messages and UI hints. */
  rawTokens: string[];
  /** Union of the expression's stroke boxes (from Phase 1 geometry, not the model). */
  bounds: Bounds;
}
