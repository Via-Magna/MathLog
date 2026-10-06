import { describe, it, expect, vi } from 'vitest';
import {
  errorResult,
  evaluate,
  evaluateString,
  mathError,
  type MathErrorCode,
  type RecognizedExpression,
} from '../../src/math';
import { sym } from './helpers';

const BOUNDS = { x: 0, y: 0, w: 0, h: 0 };

/** End-to-end golden table: handwritten input → text drawn next to `=`. */
const GOLDEN: [string, string][] = [
  ['18+4×3=', '30'],
  ['2+3×4=', '14'],
  ['(2+3)×4=', '20'],
  ['8÷2÷2=', '2'],
  ['10−2−3=', '5'],
  ['2−3−4=', '-5'],
  ['2÷4×8=', '4'],
  ['9÷3+2×4−1=', '10'],
  ['1+2+3+4+5=', '15'],
  ['−2×3=', '-6'],
  ['2×−3=', '-6'],
  ['−3−5=', '-8'],
  ['3−5=', '-2'],
  ['−−5=', '5'],
  ['−(2+3)=', '-5'],
  ['−(−3)=', '3'],
  ['2×−(3+1)=', '-8'],
  ['3+−4=', '-1'],
  ['3−−4=', '7'],
  ['+5=', '5'],
  ['3++4=', '7'],
  ['−0×5=', '0'],
  ['5−5=', '0'],
  ['0=', '0'],
  ['5=', '5'],
  ['007+1=', '8'],
  ['0÷5=', '0'],
  ['.5+1=', '1.5'],
  ['5.+1=', '6'],
  ['12.5+3=', '15.5'],
  ['0.1+0.2=', '0.3'],
  ['0.3−0.1=', '0.2'],
  ['1.1×1.1=', '1.21'],
  ['100−0.01=', '99.99'],
  ['1.25×4=', '5'],
  ['1.5×4=', '6'],
  ['3.14×2=', '6.28'],
  ['4÷0.5=', '8'],
  ['7÷2=', '3.5'],
  ['10÷4=', '2.5'],
  ['1÷3=', '0.333333333333'],
  ['2÷3=', '0.666666666667'],
  ['6÷(1+2)=', '2'],
  ['((1+2))×3=', '9'],
  ['2×(3+(4−1))=', '12'],
  ['2(3+1)=', '8'],
  ['(2)(3)=', '6'],
  ['(2)3=', '6'],
  ['123456789×1000=', '123456789000'],
  ['99999999999×10=', '999999999990'],
  ['1000000×1000000=', '1e12'],
  ['0.0000001×1=', '1e-7'],
];

describe('evaluate: golden table', () => {
  it.each(GOLDEN)('%s → %s', (input, display) => {
    const r = evaluateString(input);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.display).toBe(display);
      expect(r.pending).toBe(false);
    }
  });
});

describe('evaluate: division by zero', () => {
  it.each(['5÷0=', '0÷0=', '1÷(3−3)=', '2+8÷0×4='])('%s → Undefined', (input) => {
    const r = evaluateString(input);
    expect(r.kind).toBe('undefined');
    if (r.kind === 'undefined') expect(r.display).toBe('Undefined');
  });
});

describe('evaluate: errors once = is written', () => {
  it.each<[string, MathErrorCode]>([
    ['1.2.3=', 'MULTIPLE_DECIMAL_POINTS'],
    ['3+×4=', 'UNEXPECTED_OPERATOR'],
    ['3+=', 'MISSING_OPERAND'],
    ['×2=', 'MISSING_OPERAND'],
    ['(2+3=', 'UNBALANCED_PARENS'],
    ['2+3)=', 'UNBALANCED_PARENS'],
    ['=', 'EMPTY_EXPRESSION'],
    [`${'9'.repeat(200)}×${'9'.repeat(200)}=`, 'OVERFLOW'],
  ])('%s → %s', (input, code) => {
    // The overflow case is longer than the default 256-symbol guard.
    const r = evaluateString(input, { maxSymbols: 1000 });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.code).toBe(code);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});

describe('evaluate: pending (no = yet)', () => {
  it('returns a provisional value for a valid expression', () => {
    const r = evaluateString('2+3');
    expect(r).toMatchObject({ kind: 'ok', display: '5', pending: true });
  });

  it.each(['3+', '(2+3', '1.2.3', '5÷0', '×', ''])(
    'hides errors while the user is still writing: %s',
    (input) => {
      expect(evaluateString(input).kind).toBe('pending');
    },
  );
});

describe('evaluate: result metadata', () => {
  it('carries rawTokens on every kind of result', () => {
    for (const input of ['1+1=', '1÷0=', '1+=', '1+']) {
      const r = evaluateString(input);
      expect(r.rawTokens.join('')).toBe(input);
    }
  });

  it('returns symbols after the first = as trailing', () => {
    const r = evaluateString('1+1=2+2=');
    expect(r).toMatchObject({ kind: 'ok', display: '2', trailing: ['2', '+', '2', '='] });
  });

  it('passes implicitMultiply through', () => {
    expect(evaluateString('2(3)=', { implicitMultiply: false })).toMatchObject({
      kind: 'error',
      code: 'MISSING_OPERATOR',
    });
  });
});

describe('evaluate: input guards', () => {
  it('rejects inputs longer than maxSymbols', () => {
    expect(evaluateString('1+1+1=', { maxSymbols: 5 })).toMatchObject({
      kind: 'error',
      code: 'INPUT_TOO_LONG',
    });
    expect(evaluateString(`${'1+'.repeat(200)}1=`)).toMatchObject({ code: 'INPUT_TOO_LONG' });
  });

  it('rejects symbols outside the canonical set with their index', () => {
    const r = evaluateString('2^3=');
    expect(r).toMatchObject({ kind: 'error', code: 'UNKNOWN_SYMBOL', span: [1, 2] });
  });

  it('accepts a RecognizedExpression without rawTokens', () => {
    const expr = { symbols: sym('1+1='), bounds: BOUNDS } as unknown as RecognizedExpression;
    expect(evaluate(expr)).toMatchObject({ kind: 'ok', display: '2', rawTokens: ['1', '+', '1', '='] });
  });

  it('accepts ×, x, ÷ and − in evaluateString', () => {
    expect(evaluateString('6 x 2 ÷ 3 − 1 =')).toMatchObject({ display: '3' });
  });

  it('never throws, even on garbage input', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = evaluate(null as unknown as RecognizedExpression);
    expect(r).toMatchObject({ kind: 'error', code: 'INTERNAL', rawTokens: [] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('errorResult', () => {
  it('wraps a MathError as a renderable result', () => {
    const r = errorResult(mathError('UNKNOWN_SYMBOL', [0, 1], '\\frac'), ['\\frac']);
    expect(r).toEqual({
      kind: 'error',
      code: 'UNKNOWN_SYMBOL',
      span: [0, 1],
      message: 'Unrecognized symbol: \\frac',
      rawTokens: ['\\frac'],
    });
  });
});
