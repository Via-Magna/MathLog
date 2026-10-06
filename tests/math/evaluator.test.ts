import { describe, it, expect } from 'vitest';
import { evaluateRPN, tokenize, toRPN, type RPNToken } from '../../src/math';
import { sym } from './helpers';

function run(input: string) {
  const t = tokenize(sym(input));
  if (!t.ok) throw new Error(t.error.code);
  const r = toRPN(t.value.tokens);
  if (!r.ok) throw new Error(r.error.code);
  return evaluateRPN(r.value);
}

function value(input: string): number {
  const r = run(input);
  if (r.kind !== 'ok') throw new Error(`expected ok, got ${r.kind}`);
  return r.value;
}

const num = (value: string): RPNToken => ({ type: 'number', value, span: [0, 1] });
const op = (o: '+' | '-' | '*' | '/' | 'neg'): RPNToken => ({ type: 'op', op: o, span: [0, 1] });

describe('evaluateRPN: arithmetic', () => {
  it('adds, subtracts, multiplies and divides', () => {
    expect(value('7+5')).toBe(12);
    expect(value('7-5')).toBe(2);
    expect(value('7×5')).toBe(35);
    expect(value('7÷2')).toBe(3.5);
  });

  it('respects precedence', () => {
    expect(value('18+4×3')).toBe(30);
  });

  it('negates', () => {
    expect(value('-(-3)')).toBe(3);
    expect(value('--5')).toBe(5);
  });

  it('parses leading zeros as decimal, not octal', () => {
    expect(value('010+1')).toBe(11);
  });
});

describe('evaluateRPN: division by zero', () => {
  it('returns undefined for x ÷ 0', () => {
    expect(run('5÷0').kind).toBe('undefined');
  });

  it('returns undefined for 0 ÷ 0', () => {
    expect(run('0÷0').kind).toBe('undefined');
  });

  it('returns undefined when the divisor evaluates to zero', () => {
    expect(run('1÷(2-2)').kind).toBe('undefined');
    expect(run('1÷-0').kind).toBe('undefined');
  });

  it('points the span at the ÷ sign', () => {
    const r = run('12÷0');
    expect(r.kind === 'undefined' && r.span).toEqual([2, 3]);
  });

  it('allows 0 ÷ x', () => {
    expect(value('0÷5')).toBe(0);
  });
});

describe('evaluateRPN: overflow', () => {
  it('returns OVERFLOW when a result is not finite', () => {
    const big = '9'.repeat(200);
    const r = run(`${big}×${big}`);
    expect(r.kind === 'error' && r.error.code).toBe('OVERFLOW');
  });

  it('returns OVERFLOW for a literal too large for a double', () => {
    const r = evaluateRPN([num('9'.repeat(400))]);
    expect(r.kind === 'error' && r.error.code).toBe('OVERFLOW');
  });
});

describe('evaluateRPN: malformed RPN (defensive, unreachable after toRPN)', () => {
  it('reports stack underflow for a binary operator', () => {
    const r = evaluateRPN([num('1'), op('+')]);
    expect(r.kind === 'error' && r.error.code).toBe('INTERNAL');
  });

  it('reports stack underflow for negation', () => {
    const r = evaluateRPN([op('neg')]);
    expect(r.kind === 'error' && r.error.code).toBe('INTERNAL');
  });

  it('reports leftover values', () => {
    const r = evaluateRPN([num('1'), num('2')]);
    expect(r.kind === 'error' && r.error.code).toBe('INTERNAL');
  });

  it('reports an empty program', () => {
    expect(evaluateRPN([]).kind).toBe('error');
  });
});
