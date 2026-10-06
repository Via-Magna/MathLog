import { mathError, type MathError, type MathErrorCode, type Span } from './errors';
import { evaluateRPN } from './evaluator';
import { formatNumber } from './format';
import { toRPN } from './parser';
import { isCanonicalSymbol, type CanonicalSymbol, type RecognizedExpression } from './symbols';
import { tokenize } from './tokenizer';

export * from './errors';
export * from './symbols';
export { tokenize, type Token, type TokenizeOutput, type TokenizeOptions } from './tokenizer';
export { toRPN, OPERATORS, type RPNToken } from './parser';
export { evaluateRPN, type RPNResult } from './evaluator';
export { formatNumber, DISPLAY_PRECISION } from './format';

export interface EvalOptions {
  /** Inputs longer than this return INPUT_TOO_LONG. Default 256. */
  maxSymbols?: number;
  /** Insert `*` for `2(3)` and `(2)(3)`. Default true. */
  implicitMultiply?: boolean;
}

export const DEFAULT_MAX_SYMBOLS = 256;

/**
 * Every variant carries `rawTokens` so the UI can show what the model read.
 * - `ok`        a value; `pending` is true when no `=` has been written yet
 * - `undefined` division by zero, displayed as "Undefined"
 * - `error`     malformed input once `=` is written
 * - `pending`   no `=` yet and the input is not (yet) valid: show nothing
 */
export type EvalResult =
  | {
      kind: 'ok';
      value: number;
      display: string;
      pending: boolean;
      rawTokens: string[];
      trailing: CanonicalSymbol[];
    }
  | { kind: 'undefined'; display: 'Undefined'; span: Span; rawTokens: string[] }
  | { kind: 'error'; code: MathErrorCode; span: Span; message: string; rawTokens: string[] }
  | { kind: 'pending'; rawTokens: string[] };

/** Wraps a MathError (e.g. from the ink-on adapter) as a renderable result. */
export function errorResult(error: MathError, rawTokens: string[]): EvalResult {
  return { kind: 'error', code: error.code, span: error.span, message: error.message, rawTokens };
}

function evaluateUnsafe(expr: RecognizedExpression, options: EvalOptions): EvalResult {
  const { symbols } = expr;
  const rawTokens = expr.rawTokens ?? symbols.map(String);
  const maxSymbols = options.maxSymbols ?? DEFAULT_MAX_SYMBOLS;

  if (symbols.length > maxSymbols) {
    return errorResult(mathError('INPUT_TOO_LONG', [0, symbols.length]), rawTokens);
  }
  const badIndex = symbols.findIndex((s) => !isCanonicalSymbol(s));
  if (badIndex >= 0) {
    const detail = String(rawTokens[badIndex] ?? symbols[badIndex]);
    return errorResult(mathError('UNKNOWN_SYMBOL', [badIndex, badIndex + 1], detail), rawTokens);
  }

  const hasEquals = symbols.includes('=');
  // Before `=` is written the user is mid-equation: never surface errors.
  const fail = (error: MathError): EvalResult =>
    hasEquals ? errorResult(error, rawTokens) : { kind: 'pending', rawTokens };

  const tokenized = tokenize(symbols, { implicitMultiply: options.implicitMultiply });
  if (!tokenized.ok) return fail(tokenized.error);

  const rpn = toRPN(tokenized.value.tokens);
  if (!rpn.ok) return fail(rpn.error);

  const result = evaluateRPN(rpn.value);
  if (result.kind === 'error') return fail(result.error);
  if (result.kind === 'undefined') {
    return hasEquals
      ? { kind: 'undefined', display: 'Undefined', span: result.span, rawTokens }
      : { kind: 'pending', rawTokens };
  }

  return {
    kind: 'ok',
    value: result.value,
    display: formatNumber(result.value),
    pending: !tokenized.value.hasEquals,
    rawTokens,
    trailing: tokenized.value.trailing,
  };
}

/**
 * Evaluates one recognized expression. Pure, synchronous, never throws.
 * Pipeline: tokenize → shunting-yard (toRPN) → evaluateRPN → formatNumber.
 */
export function evaluate(expr: RecognizedExpression, options: EvalOptions = {}): EvalResult {
  try {
    return evaluateUnsafe(expr, options);
  } catch (e) {
    console.error('[calcink/math] unexpected error', e);
    return errorResult(mathError('INTERNAL', [0, 0]), expr?.rawTokens ?? []);
  }
}

const CHAR_ALIASES: Readonly<Record<string, CanonicalSymbol>> = {
  '×': '*',
  x: '*',
  X: '*',
  '·': '*',
  '÷': '/',
  '−': '-',
  '–': '-',
};

/**
 * Convenience wrapper for tests and demos: `evaluateString('18+4×3=')`.
 * Whitespace is ignored; ×, x, ÷ and − are accepted as aliases.
 */
export function evaluateString(input: string, options: EvalOptions = {}): EvalResult {
  const chars = [...input].filter((c) => c.trim() !== '');
  const symbols = chars.map((c) => CHAR_ALIASES[c] ?? c) as CanonicalSymbol[];
  return evaluate({ symbols, rawTokens: chars, bounds: { x: 0, y: 0, w: 0, h: 0 } }, options);
}
