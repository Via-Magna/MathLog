import { describe, it, expect } from 'vitest';
import { tokenize, toRPN, type MathErrorCode, type RPNToken, type Token } from '../../src/math';
import { sym } from './helpers';

function tokensOf(input: string, implicitMultiply = true): Token[] {
  const r = tokenize(sym(input), { implicitMultiply });
  if (!r.ok) throw new Error(r.error.code);
  return r.value.tokens;
}

function rpn(input: string): string {
  const r = toRPN(tokensOf(input));
  if (!r.ok) throw new Error(`unexpected ${r.error.code}`);
  return r.value.map((t: RPNToken) => (t.type === 'number' ? t.value : t.op)).join(' ');
}

function parseError(input: string, implicitMultiply = true) {
  const r = toRPN(tokensOf(input, implicitMultiply));
  if (r.ok) throw new Error(`expected an error for ${input}`);
  return r.error;
}

describe('toRPN: precedence and associativity', () => {
  it.each([
    ['18+4×3=', '18 4 3 * +'],
    ['2+3×4', '2 3 4 * +'],
    ['(2+3)×4', '2 3 + 4 *'],
    ['2−3−4', '2 3 - 4 -'],
    ['8÷2÷2', '8 2 / 2 /'],
    ['2×3+4', '2 3 * 4 +'],
    ['2÷4×8', '2 4 / 8 *'],
    ['−2×3', '2 neg 3 *'],
    ['2×−3', '2 3 neg *'],
    ['−−5', '5 neg neg'],
    ['−(2+3)', '2 3 + neg'],
    ['((1))', '1'],
    ['2×(3+(4−1))', '2 3 4 1 - + *'],
    ['1+2×3−4÷5', '1 2 3 * + 4 5 / -'],
  ])('%s → %s', (input, expected) => {
    expect(rpn(input)).toBe(expected);
  });
});

describe('toRPN: syntax errors', () => {
  it.each<[string, MathErrorCode]>([
    ['3+×4=', 'UNEXPECTED_OPERATOR'],
    ['3×÷4=', 'UNEXPECTED_OPERATOR'],
    ['3+=', 'MISSING_OPERAND'],
    ['×2=', 'MISSING_OPERAND'],
    ['−=', 'MISSING_OPERAND'],
    ['()=', 'MISSING_OPERAND'],
    ['(3+)=', 'MISSING_OPERAND'],
    ['(=', 'MISSING_OPERAND'],
    ['(2+3=', 'UNBALANCED_PARENS'],
    ['2+3)=', 'UNBALANCED_PARENS'],
    ['((2)=', 'UNBALANCED_PARENS'],
    ['=', 'EMPTY_EXPRESSION'],
    ['', 'EMPTY_EXPRESSION'],
  ])('%s → %s', (input, code) => {
    expect(parseError(input).code).toBe(code);
  });

  it('reports two numbers in a row as MISSING_OPERATOR', () => {
    // A dropped operator: tokens built by hand since the tokenizer merges digits.
    const tokens: Token[] = [
      { type: 'number', value: '3', span: [0, 1] },
      { type: 'number', value: '4', span: [1, 2] },
    ];
    const r = toRPN(tokens);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('MISSING_OPERATOR');
      expect(r.error.span).toEqual([0, 2]);
    }
  });

  it('reports a number followed by ( as MISSING_OPERATOR when implicit multiply is off', () => {
    expect(parseError('2(3)=', false).code).toBe('MISSING_OPERATOR');
  });

  it('points the error span at the offending operators', () => {
    expect(parseError('3+×4=').span).toEqual([1, 3]);
  });

  it('points an unclosed ( span at the bracket', () => {
    expect(parseError('1+(2=').span).toEqual([2, 3]);
  });

  it('ignores tokens after =', () => {
    const tokens = tokensOf('1+2=');
    tokens.push({ type: 'number', value: '9', span: [4, 5] });
    expect(toRPN(tokens).ok).toBe(true);
  });
});
