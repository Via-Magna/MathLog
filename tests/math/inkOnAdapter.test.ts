import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate } from '../../src/math';
import {
  adaptInkOn,
  inkOnTokens,
  INKON_TOKEN_MAP,
  type InkOnRecognitionResult,
} from '../../src/recognition/inkOnAdapter';

/** Copy of ink-on's public/models/comer/vocab.json (113 tokens). */
const vocab = JSON.parse(
  readFileSync(new URL('../fixtures/inkon-vocab.json', import.meta.url), 'utf8'),
) as { word2idx: Record<string, number>; idx2word: Record<string, string> };

const BOUNDS = { x: 10, y: 20, w: 300, h: 60 };

/** Builds a fixture the way ink-on returns it: <sos> … <eos> token ids plus latex. */
function recognition(tokens: string[]): InkOnRecognitionResult {
  const ids = ['<sos>', ...tokens, '<eos>'].map((t) => {
    const id = vocab.word2idx[t];
    if (id === undefined) throw new Error(`token not in vocab: ${t}`);
    return id;
  });
  return { latex: tokens.join(' '), tokenIds: ids, encoderMs: 300, decoderMs: 900, totalMs: 1200 };
}

describe('vocab fixture', () => {
  it('contains every token the adapter maps', () => {
    for (const token of Object.keys(INKON_TOKEN_MAP)) {
      expect(vocab.word2idx[token], token).toBeTypeOf('number');
    }
  });
});

describe('inkOnTokens', () => {
  it('maps token ids through idx2word and strips special tokens', () => {
    const r = inkOnTokens(recognition(['1', '\\times', '2']), vocab);
    expect(r).toEqual({ ok: true, value: ['1', '\\times', '2'] });
  });

  it('accepts a plain id → token array as vocab', () => {
    const list = Array.from({ length: 113 }, (_, i) => vocab.idx2word[String(i)]);
    const r = inkOnTokens({ latex: '', tokenIds: [12, 6, 13] }, list);
    expect(r).toEqual({ ok: true, value: ['1', '+', '2'] });
  });

  it('falls back to splitting latex when no ids or vocab are given', () => {
    expect(inkOnTokens({ latex: '  1 8 + 4 \\times 3 = ' })).toEqual({
      ok: true,
      value: ['1', '8', '+', '4', '\\times', '3', '='],
    });
  });

  it('rejects an id that is not in the vocab', () => {
    const r = inkOnTokens({ latex: '', tokenIds: [12, 999] }, vocab);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'UNKNOWN_SYMBOL', span: [1, 2] });
  });
});

describe('adaptInkOn', () => {
  it('maps the brief example and evaluates it', () => {
    const r = adaptInkOn(recognition(['1', '8', '+', '4', '\\times', '3', '=']), vocab, BOUNDS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.symbols).toEqual(['1', '8', '+', '4', '*', '3', '=']);
      expect(r.value.rawTokens).toEqual(['1', '8', '+', '4', '\\times', '3', '=']);
      expect(r.value.bounds).toBe(BOUNDS);
      expect(evaluate(r.value)).toMatchObject({ kind: 'ok', display: '30' });
    }
  });

  it.each([
    [['8', '\\div', '2', '='], '4'],
    [['8', '/', '2', '='], '4'],
    [['3', '\\cdot', '4', '='], '12'],
    [['-', '2', '.', '5', '+', '1', '='], '-1.5'],
    [['(', '1', '+', '2', ')', '\\times', '3', '='], '9'],
  ])('%j → %s', (tokens, display) => {
    const r = adaptInkOn(recognition(tokens), vocab, BOUNDS);
    expect(r.ok && evaluate(r.value)).toMatchObject({ kind: 'ok', display });
  });

  it('reads a letter x between operands as ×', () => {
    for (const tokens of [
      ['6', 'x', '7', '='],
      [')', 'x', '('],
      ['2', 'X', '.', '5'],
    ]) {
      const r = adaptInkOn({ latex: tokens.join(' ') }, undefined, BOUNDS);
      expect(r.ok, tokens.join(' ')).toBe(true);
    }
  });

  it.each([
    [['x', '+', '1', '='], 0],
    [['2', '+', 'x', '='], 2],
    [['2', 'x'], 1],
    [['2', '^', '{', '3', '}', '='], 1],
    [['\\frac', '{', '1', '}', '{', '2', '}'], 0],
    [['\\alpha', '='], 0],
  ])('rejects %j at index %i', (tokens, index) => {
    const r = adaptInkOn(recognition(tokens as string[]), vocab, BOUNDS);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('UNKNOWN_SYMBOL');
      expect(r.error.span).toEqual([index, index + 1]);
      expect(r.error.rawTokens).toEqual(tokens);
    }
  });

  it('returns empty rawTokens when ids cannot be decoded', () => {
    const r = adaptInkOn({ latex: '', tokenIds: [999] }, vocab, BOUNDS);
    expect(!r.ok && r.error.rawTokens).toEqual([]);
  });
});
