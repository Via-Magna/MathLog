/**
 * Error model for the math engine. No stage throws: every stage returns a
 * `Result`, and `evaluate()` turns failures into a renderable `EvalResult`.
 */

export type MathErrorCode =
  | 'UNKNOWN_SYMBOL'
  | 'MULTIPLE_DECIMAL_POINTS'
  | 'UNEXPECTED_OPERATOR'
  | 'MISSING_OPERAND'
  | 'MISSING_OPERATOR'
  | 'UNBALANCED_PARENS'
  | 'EMPTY_EXPRESSION'
  | 'OVERFLOW'
  | 'INPUT_TOO_LONG'
  | 'INTERNAL';

/** Half-open index range `[start, end)` into `symbols` / `rawTokens`. */
export type Span = readonly [start: number, end: number];

export interface MathError {
  code: MathErrorCode;
  span: Span;
  message: string;
}

export const ERROR_MESSAGES: Readonly<Record<MathErrorCode, string>> = {
  UNKNOWN_SYMBOL: 'Unrecognized symbol',
  MULTIPLE_DECIMAL_POINTS: 'A number has more than one decimal point',
  UNEXPECTED_OPERATOR: 'Two operators in a row',
  MISSING_OPERAND: 'An operator is missing a number',
  MISSING_OPERATOR: 'Two numbers without an operator between them',
  UNBALANCED_PARENS: 'Brackets do not match',
  EMPTY_EXPRESSION: 'Nothing to calculate',
  OVERFLOW: 'Number too large',
  INPUT_TOO_LONG: 'Expression is too long',
  INTERNAL: 'Internal error',
};

export function mathError(code: MathErrorCode, span: Span, detail?: string): MathError {
  const base = ERROR_MESSAGES[code];
  return { code, span, message: detail ? `${base}: ${detail}` : base };
}

export type Result<T, E = MathError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = MathError>(error: E): Result<never, E> {
  return { ok: false, error };
}
