import { err, mathError, ok, type Result, type Span } from './errors';
import { isDigit, type CanonicalSymbol } from './symbols';

export type BinaryOperator = '+' | '-' | '*' | '/';
export type Operator = BinaryOperator | 'neg';

export type Token =
  /** `value` is kept as a normalized decimal string ("0.5", "12"). */
  | { type: 'number'; value: string; span: Span }
  | { type: 'op'; op: Operator; span: Span }
  | { type: 'lparen'; span: Span }
  | { type: 'rparen'; span: Span }
  | { type: 'equals'; span: Span };

export interface TokenizeOutput {
  /** Tokens up to and including the first `=` (if any). */
  tokens: Token[];
  /** Whether a terminal `=` was found. Without it the result is "pending". */
  hasEquals: boolean;
  /** Symbols after the first `=`; usually a second equation merged onto the line. */
  trailing: CanonicalSymbol[];
}

export interface TokenizeOptions {
  /** Insert `*` for `2(3)`, `(2)(3)` and `(2)3`. Default true. */
  implicitMultiply?: boolean;
}

/** "007" stays as is (parseFloat handles it); ".5" → "0.5"; "5." → "5". */
function normalizeNumber(text: string): string {
  let out = text;
  if (out.startsWith('.')) out = `0${out}`;
  if (out.endsWith('.')) out = out.slice(0, -1);
  return out;
}

/**
 * Single left-to-right pass that merges digit/`.` runs into numbers,
 * classifies `-` as binary or unary (`neg`), drops unary `+`, and inserts
 * implicit multiplication.
 */
export function tokenize(
  symbols: readonly CanonicalSymbol[],
  options: TokenizeOptions = {},
): Result<TokenizeOutput> {
  const implicitMultiply = options.implicitMultiply ?? true;
  const tokens: Token[] = [];

  let numStart = -1;
  let numText = '';
  let seenDot = false;

  const last = (): Token | undefined => tokens.at(-1);

  const flushNumber = (end: number) => {
    tokens.push({ type: 'number', value: normalizeNumber(numText), span: [numStart, end] });
    numStart = -1;
    numText = '';
    seenDot = false;
  };

  /** Before an operand that starts at `i`, insert `*` if it directly follows one. */
  const maybeImplicitMultiply = (i: number, startsGroup: boolean) => {
    if (!implicitMultiply) return;
    const prev = last();
    if (!prev) return;
    if (prev.type === 'rparen' || (startsGroup && prev.type === 'number')) {
      tokens.push({ type: 'op', op: '*', span: [i, i] });
    }
  };

  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i];

    if (isDigit(s) || s === '.') {
      if (numStart < 0) {
        maybeImplicitMultiply(i, false);
        numStart = i;
      }
      if (s === '.') {
        if (seenDot) {
          return err(mathError('MULTIPLE_DECIMAL_POINTS', [numStart, i + 1]));
        }
        seenDot = true;
      }
      numText += s;
      continue;
    }

    if (numStart >= 0) flushNumber(i);

    switch (s) {
      case '=':
        tokens.push({ type: 'equals', span: [i, i + 1] });
        return ok({ tokens, hasEquals: true, trailing: symbols.slice(i + 1) });
      case '(':
        maybeImplicitMultiply(i, true);
        tokens.push({ type: 'lparen', span: [i, i + 1] });
        break;
      case ')':
        tokens.push({ type: 'rparen', span: [i, i + 1] });
        break;
      default: {
        // '+', '-', '*', '/'
        const prev = last();
        const unaryPosition = !prev || prev.type === 'op' || prev.type === 'lparen';
        if (unaryPosition && s === '-') {
          tokens.push({ type: 'op', op: 'neg', span: [i, i + 1] });
        } else if (unaryPosition && s === '+') {
          // Unary plus is a no-op.
        } else {
          tokens.push({ type: 'op', op: s, span: [i, i + 1] });
        }
      }
    }
  }

  if (numStart >= 0) flushNumber(symbols.length);
  return ok({ tokens, hasEquals: false, trailing: [] });
}
