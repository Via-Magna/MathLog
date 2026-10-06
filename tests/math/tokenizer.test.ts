import { describe, it, expect } from 'vitest';
import { tokenize, type Token } from '../../src/math';
import { sym } from './helpers';

/** Compact view of tokens: numbers as values, ops as symbols. */
function view(tokens: Token[]): string[] {
  return tokens.map((t) => {
    switch (t.type) {
      case 'number':
        return t.value;
      case 'op':
        return t.op;
      case 'lparen':
        return '(';
      case 'rparen':
        return ')';
      case 'equals':
        return '=';
    }
  });
}

function tok(input: string, implicitMultiply = true) {
  const r = tokenize(sym(input), { implicitMultiply });
  if (!r.ok) throw new Error(`unexpected error ${r.error.code}`);
  return r.value;
}

describe('tokenize: numbers', () => {
  it('merges digits and a decimal point into one number', () => {
    expect(view(tok('12.5+3=').tokens)).toEqual(['12.5', '+', '3', '=']);
  });

  it('turns a leading decimal point into 0.x', () => {
    expect(view(tok('.5+1=').tokens)).toEqual(['0.5', '+', '1', '=']);
  });

  it('drops a trailing decimal point', () => {
    expect(view(tok('5.=').tokens)).toEqual(['5', '=']);
  });

  it('keeps leading zeros for parseFloat to handle', () => {
    expect(view(tok('007').tokens)).toEqual(['007']);
  });

  it('records spans as indices into the symbol array', () => {
    const { tokens } = tok('12+345=');
    expect(tokens.map((t) => t.span)).toEqual([
      [0, 2],
      [2, 3],
      [3, 6],
      [6, 7],
    ]);
  });

  it('rejects a second decimal point in one number', () => {
    const r = tokenize(sym('1.2.3='));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('MULTIPLE_DECIMAL_POINTS');
      expect(r.error.span).toEqual([0, 4]);
    }
  });

  it('allows decimal points in separate numbers', () => {
    expect(view(tok('1.2+3.4=').tokens)).toEqual(['1.2', '+', '3.4', '=']);
  });
});

describe('tokenize: unary operators', () => {
  it('treats a leading minus as negation', () => {
    expect(view(tok('-4=').tokens)).toEqual(['neg', '4', '=']);
  });

  it('treats minus after an operator as negation', () => {
    expect(view(tok('-4×-2=').tokens)).toEqual(['neg', '4', '*', 'neg', '2', '=']);
  });

  it('treats minus after ( as negation', () => {
    expect(view(tok('(-3)').tokens)).toEqual(['(', 'neg', '3', ')']);
  });

  it('treats minus after a number or ) as subtraction', () => {
    expect(view(tok('5-3').tokens)).toEqual(['5', '-', '3']);
    expect(view(tok('(5)-3').tokens)).toEqual(['(', '5', ')', '-', '3']);
  });

  it('chains double negation', () => {
    expect(view(tok('--5').tokens)).toEqual(['neg', 'neg', '5']);
  });

  it('drops unary plus', () => {
    expect(view(tok('+5').tokens)).toEqual(['5']);
    expect(view(tok('3++4').tokens)).toEqual(['3', '+', '4']);
  });

  it('keeps × and ÷ in operand position for the parser to reject', () => {
    expect(view(tok('×2').tokens)).toEqual(['*', '2']);
  });
});

describe('tokenize: implicit multiplication', () => {
  it('inserts * between a number and (', () => {
    expect(view(tok('2(3+1)=').tokens)).toEqual(['2', '*', '(', '3', '+', '1', ')', '=']);
  });

  it('inserts * between ) and (', () => {
    expect(view(tok('(2)(3)').tokens)).toEqual(['(', '2', ')', '*', '(', '3', ')']);
  });

  it('inserts * between ) and a number', () => {
    expect(view(tok('(2)3').tokens)).toEqual(['(', '2', ')', '*', '3']);
  });

  it('gives the inserted * a zero-width span', () => {
    expect(tok('2(3)').tokens[1].span).toEqual([1, 1]);
  });

  it('can be turned off', () => {
    expect(view(tok('2(3)', false).tokens)).toEqual(['2', '(', '3', ')']);
  });
});

describe('tokenize: equals and trailing symbols', () => {
  it('stops at the first = and reports trailing symbols', () => {
    const out = tok('1+1=2+2=');
    expect(view(out.tokens)).toEqual(['1', '+', '1', '=']);
    expect(out.hasEquals).toBe(true);
    expect(out.trailing).toEqual(['2', '+', '2', '=']);
  });

  it('flags a missing = so the result can be pending', () => {
    const out = tok('1+1');
    expect(out.hasEquals).toBe(false);
    expect(out.trailing).toEqual([]);
  });

  it('handles empty input', () => {
    expect(tok('').tokens).toEqual([]);
  });
});
