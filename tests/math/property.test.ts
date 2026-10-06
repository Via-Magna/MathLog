import { describe, it, expect } from 'vitest';
import { CANONICAL_SYMBOLS, evaluate, formatNumber, type CanonicalSymbol } from '../../src/math';
import { rng, sym } from './helpers';

/**
 * Property tests with a seeded PRNG (no extra dependency, reproducible).
 * 1. Random symbol soup never throws and always returns a known result kind.
 * 2. Random valid expressions agree with an independent recursive-descent
 *    reference evaluator written only for this test.
 */

const RUNS = 2000;
const BOUNDS = { x: 0, y: 0, w: 0, h: 0 };

function run(symbols: CanonicalSymbol[]) {
  // Generated expressions can exceed the default 256-symbol guard.
  return evaluate({ symbols, rawTokens: symbols.slice(), bounds: BOUNDS }, { maxSymbols: 10_000 });
}

describe('property: never throws', () => {
  it(`handles ${RUNS} random symbol sequences`, () => {
    const rand = rng(1);
    const kinds = new Set(['ok', 'undefined', 'error', 'pending']);
    for (let n = 0; n < RUNS; n++) {
      const len = Math.floor(rand() * 30);
      const symbols = Array.from(
        { length: len },
        () => CANONICAL_SYMBOLS[Math.floor(rand() * CANONICAL_SYMBOLS.length)],
      );
      const withEquals = [...symbols, '='] as CanonicalSymbol[];
      expect(() => run(symbols)).not.toThrow();
      const r = run(withEquals);
      expect(kinds.has(r.kind)).toBe(true);
      // Once `=` is written the result is never "pending".
      expect(r.kind).not.toBe('pending');
    }
  });
});

/** expr := term (('+'|'-') term)* ; term := factor (('*'|'/') factor)* ; factor := '-'? primary */
function genExpr(rand: () => number, depth: number): string {
  const terms = 1 + Math.floor(rand() * 3);
  let s = genTerm(rand, depth);
  for (let i = 1; i < terms; i++) s += (rand() < 0.5 ? '+' : '-') + genTerm(rand, depth);
  return s;
}

function genTerm(rand: () => number, depth: number): string {
  const factors = 1 + Math.floor(rand() * 3);
  let s = genFactor(rand, depth);
  for (let i = 1; i < factors; i++) s += (rand() < 0.5 ? '*' : '/') + genFactor(rand, depth);
  return s;
}

function genFactor(rand: () => number, depth: number): string {
  const neg = rand() < 0.2 ? '-' : '';
  if (depth > 0 && rand() < 0.25) return `${neg}(${genExpr(rand, depth - 1)})`;
  const intPart = String(Math.floor(rand() * 1000));
  const frac = rand() < 0.3 ? `.${Math.floor(rand() * 100)}` : '';
  return neg + intPart + frac;
}

/** Independent reference: recursive descent over the same string. */
function reference(src: string): number | 'undefined' {
  let i = 0;
  let divByZero = false;
  const expr = (): number => {
    let v = term();
    while (src[i] === '+' || src[i] === '-') v = src[i++] === '+' ? v + term() : v - term();
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (src[i] === '*' || src[i] === '/') {
      const o = src[i++];
      const r = factor();
      if (o === '/' && r === 0) divByZero = true;
      v = o === '*' ? v * r : v / r;
    }
    return v;
  };
  const factor = (): number => {
    if (src[i] === '-') {
      i++;
      return -factor();
    }
    if (src[i] === '(') {
      i++;
      const v = expr();
      i++; // ')'
      return v;
    }
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    return Number.parseFloat(src.slice(start, i));
  };
  const v = expr();
  return divByZero ? 'undefined' : v;
}

describe('property: matches a reference evaluator', () => {
  it(`agrees on ${RUNS} random valid expressions`, () => {
    const rand = rng(42);
    for (let n = 0; n < RUNS; n++) {
      const src = genExpr(rand, 3);
      const expected = reference(src);
      const r = run(sym(`${src}=`));
      if (expected === 'undefined') {
        expect(r.kind, src).toBe('undefined');
      } else {
        expect(r.kind, src).toBe('ok');
        if (r.kind === 'ok') expect(r.display, src).toBe(formatNumber(expected));
      }
    }
  });
});
