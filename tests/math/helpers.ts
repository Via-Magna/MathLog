import type { CanonicalSymbol } from '../../src/math';

const ALIASES: Record<string, CanonicalSymbol> = { '×': '*', '÷': '/', '−': '-' };

/** '12.5+3=' → ['1','2','.','5','+','3','='] (accepts ×, ÷, −). */
export function sym(input: string): CanonicalSymbol[] {
  return [...input.replace(/\s+/g, '')].map((c) => ALIASES[c] ?? (c as CanonicalSymbol));
}

/** Deterministic PRNG (mulberry32) so property tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
