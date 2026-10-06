import { err, mathError, ok, type MathError, type Result } from '../math/errors';
import type { Bounds, CanonicalSymbol, RecognizedExpression } from '../math/symbols';

/**
 * Adapter between ink-on (CoMER, https://github.com/kimseungdae/ink-on) and
 * the math engine. ink-on recognizes a whole expression and returns LaTeX
 * tokens; this maps them onto the engine's 18 canonical symbols.
 * Swapping recognizers again only touches this file.
 */

/** Subset of ink-on's `RecognitionResult` that the adapter needs. */
export interface InkOnRecognitionResult {
  latex: string;
  tokenIds?: readonly number[];
  encoderMs?: number;
  decoderMs?: number;
  totalMs?: number;
}

/** Shape of ink-on's `vocab.json` (only `idx2word` is used), or a plain id → token array. */
export type InkOnVocab = { idx2word: Readonly<Record<string, string>> } | readonly string[];

/** LaTeX token → canonical symbol. */
export const INKON_TOKEN_MAP: Readonly<Record<string, CanonicalSymbol>> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '+': '+',
  '-': '-',
  '\\times': '*',
  '\\cdot': '*',
  '\\div': '/',
  '/': '/',
  '.': '.',
  '=': '=',
  '(': '(',
  ')': ')',
};

export const INKON_SPECIAL_TOKENS: ReadonlySet<string> = new Set(['<pad>', '<sos>', '<eos>']);

function lookupToken(vocab: InkOnVocab, id: number): string | undefined {
  return Array.isArray(vocab)
    ? (vocab as readonly string[])[id]
    : (vocab as { idx2word: Record<string, string> }).idx2word[String(id)];
}

/** Turns ink-on output into raw LaTeX tokens, preferring `tokenIds` over splitting `latex`. */
export function inkOnTokens(result: InkOnRecognitionResult, vocab?: InkOnVocab): Result<string[]> {
  let tokens: string[];
  if (result.tokenIds && vocab) {
    tokens = [];
    for (const id of result.tokenIds) {
      const token = lookupToken(vocab, id);
      if (token === undefined) {
        return err(mathError('UNKNOWN_SYMBOL', [tokens.length, tokens.length + 1], `token id ${id}`));
      }
      tokens.push(token);
    }
  } else {
    tokens = result.latex.split(/\s+/).filter(Boolean);
  }
  return ok(tokens.filter((t) => !INKON_SPECIAL_TOKENS.has(t)));
}

const OPERAND_END = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', ')']);
const OPERAND_START = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '(']);

/**
 * Maps ink-on output to a `RecognizedExpression`.
 * - `\times` / `\cdot` → `*`, `\div` / `/` → `/`
 * - a letter `x` between two operands becomes `*` (a handwritten × often decodes as x)
 * - any other token returns UNKNOWN_SYMBOL with its index; `rawTokens` stays 1:1 with `symbols`
 */
export function adaptInkOn(
  result: InkOnRecognitionResult,
  vocab: InkOnVocab | undefined,
  bounds: Bounds,
): Result<RecognizedExpression, MathError & { rawTokens: string[] }> {
  const tokensResult = inkOnTokens(result, vocab);
  if (!tokensResult.ok) return err({ ...tokensResult.error, rawTokens: [] });
  const rawTokens = tokensResult.value;

  const symbols: CanonicalSymbol[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    let symbol: CanonicalSymbol | undefined = INKON_TOKEN_MAP[token];

    if (symbol === undefined && (token === 'x' || token === 'X')) {
      const prev = rawTokens[i - 1];
      const next = rawTokens[i + 1];
      if (prev !== undefined && next !== undefined && OPERAND_END.has(prev) && OPERAND_START.has(next)) {
        symbol = '*';
      }
    }

    if (symbol === undefined) {
      return err({ ...mathError('UNKNOWN_SYMBOL', [i, i + 1], token), rawTokens });
    }
    symbols.push(symbol);
  }

  return ok({ symbols, rawTokens, bounds });
}
