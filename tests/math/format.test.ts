import { describe, it, expect } from 'vitest';
import { formatNumber } from '../../src/math';

describe('formatNumber', () => {
  it.each<[number, string]>([
    [0.1 + 0.2, '0.3'],
    [0.3 - 0.1, '0.2'],
    [1.1 * 1.1, '1.21'],
    [1 / 3, '0.333333333333'],
    [2 / 3, '0.666666666667'],
    [-1 / 3, '-0.333333333333'],
    [42, '42'],
    [-7.5, '-7.5'],
    [0, '0'],
    [-0, '0'],
    [999999999990, '999999999990'],
    [1e12, '1e12'],
    [1.5e13, '1.5e13'],
    [-2.5e15, '-2.5e15'],
    [123456789012345, '1.23456789012e14'],
    [0.000001, '0.000001'],
    [1e-7, '1e-7'],
    [1.25e-9, '1.25e-9'],
    [-3e-8, '-3e-8'],
  ])('%s → %s', (input, expected) => {
    expect(formatNumber(input)).toBe(expected);
  });

  it('switches to exponent form when rounding reaches 1e12', () => {
    expect(formatNumber(999999999999.9)).toBe('1e12');
  });

  it('does not throw on non-finite input', () => {
    expect(formatNumber(Infinity)).toBe('Infinity');
    expect(formatNumber(Number.NaN)).toBe('NaN');
  });

  it('stays short enough to draw inline (at most 19 characters)', () => {
    for (const x of [1 / 7, -1 / 7, 123456789.123456, -9.87654321e-20, -1.7976931348623157e308]) {
      expect(formatNumber(x).length).toBeLessThanOrEqual(19);
    }
  });
});
