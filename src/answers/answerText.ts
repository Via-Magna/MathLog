import type { EvalResult } from '../math';
import type { LineResult } from '../store/useRecognitionStore';

/**
 * What to write next to a line, and how to describe what the model read.
 * Pure; reads Phase 3 results, never re-evaluates.
 */

export type AnswerKind = 'value' | 'undefined' | 'unknown';

export interface AnswerText {
  kind: AnswerKind;
  /** Drawn on the canvas: "30", "Undefined" or "?". */
  text: string;
}

/** True when the user has written an "=": by geometry, or because the model read one. */
export function hasEquals(line: Pick<LineResult, 'equals' | 'result'>): boolean {
  return line.equals !== null || (line.result?.rawTokens.includes('=') ?? false);
}

/**
 * The answer for a finished line, or null when nothing should be shown:
 * - a value once "=" is written                → "30"
 * - division by zero                           → "Undefined"
 * - unreadable / malformed, but "=" is written → "?"
 * - no "=" yet, or nothing read                → null
 * Lines still being read return null; the slot state machine decides what stays up.
 */
export function answerText(line: Pick<LineResult, 'status' | 'result' | 'equals'>): AnswerText | null {
  if (line.status === 'failed') return hasEquals(line) ? { kind: 'unknown', text: '?' } : null;
  if (line.status !== 'done' || !line.result) return null;
  const r: EvalResult = line.result;
  switch (r.kind) {
    case 'ok':
      // A typographic minus reads better than a hyphen in handwriting fonts.
      return r.pending ? null : { kind: 'value', text: r.display.replace(/^-/, '−') };
    case 'undefined':
      return { kind: 'undefined', text: 'Undefined' };
    case 'error':
      return hasEquals(line) ? { kind: 'unknown', text: '?' } : null;
    case 'pending':
      return null;
  }
}

const PRETTY: Readonly<Record<string, string>> = {
  '\\times': '×',
  '\\cdot': '×',
  '\\div': '÷',
  '-': '−',
};

/** The model's tokens as a short string, e.g. "18+4×3=". */
export function readingText(rawTokens: readonly string[]): string {
  return rawTokens.map((t) => PRETTY[t] ?? t.replace(/^\\/, '')).join('');
}

const SPOKEN: Readonly<Record<string, string>> = {
  '+': ' plus ',
  '-': ' minus ',
  '\\times': ' times ',
  '\\cdot': ' times ',
  '*': ' times ',
  '\\div': ' divided by ',
  '/': ' divided by ',
  '=': ' equals ',
  '.': ' point ',
  '(': ' open bracket ',
  ')': ' close bracket ',
};

/** Screen-reader sentence, e.g. "18 plus 4 times 3 equals 30". */
export function spokenText(rawTokens: readonly string[], answer: AnswerText): string {
  // Speak only up to the first "=": the maths stops there, and ink-on sometimes
  // reads a single "=" as "= =" or picks up stray marks after it.
  const firstEquals = rawTokens.indexOf('=');
  const spokenTokens = firstEquals >= 0 ? rawTokens.slice(0, firstEquals + 1) : rawTokens;
  const said = spokenTokens
    .map((t) => SPOKEN[t] ?? t.replace(/^\\/, ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const value =
    answer.kind === 'value' ? answer.text.replace(/^[-−]/, 'minus ') : answer.kind === 'undefined' ? 'undefined' : 'not readable';
  if (!said) return `Answer ${value}`;
  return said.endsWith('equals') ? `${said} ${value}` : `${said}, ${value}`;
}

/** Second line of the reading hint, e.g. "Two operators in a row". */
export function hintDetail(result: EvalResult | undefined): string | null {
  if (result?.kind === 'error') return result.message;
  if (result?.kind === 'undefined') return 'Division by zero';
  return null;
}
