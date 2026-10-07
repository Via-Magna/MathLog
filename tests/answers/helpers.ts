import type { EvalResult } from '../../src/math';
import type { EqualsSign } from '../../src/recognition/findEquals';
import type { LineResult } from '../../src/store/useRecognitionStore';

export const ok = (display: string, rawTokens: string[] = [], pending = false): EvalResult => ({
  kind: 'ok',
  value: Number(display),
  display,
  pending,
  rawTokens,
  trailing: [],
});

export const undef = (rawTokens: string[] = []): EvalResult => ({
  kind: 'undefined',
  display: 'Undefined',
  span: [0, 1],
  rawTokens,
});

export const bad = (rawTokens: string[] = [], message = 'Two operators in a row'): EvalResult => ({
  kind: 'error',
  code: 'UNEXPECTED_OPERATOR',
  span: [0, 1],
  message,
  rawTokens,
});

export const EQ: EqualsSign = { bounds: { x: 60, y: 115, w: 20, h: 13 }, strokeIds: ['eqTop', 'eqBottom'] };

/** A line at (0, 100), 80 × 40 px, with an "=" at its right end. */
export function line(over: Partial<LineResult> = {}): LineResult {
  return {
    key: 'k1',
    bounds: { x: 0, y: 100, w: 80, h: 40 },
    lineHeight: 40,
    equals: EQ,
    status: 'done',
    ...over,
  };
}

/** The tokens ink-on returns for 18+4×3=. */
export const TOKENS_18 = ['1', '8', '+', '4', '\\times', '3', '='];
