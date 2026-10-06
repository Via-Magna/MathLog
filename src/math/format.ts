/** Significant digits shown on the canvas. Hides IEEE-754 noise like 0.30000000000000004. */
export const DISPLAY_PRECISION = 12;

const EXP_UPPER = 1e12;
const EXP_LOWER = 1e-6;

function stripMantissaZeros(mantissa: string): string {
  return mantissa.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Formats a result for inline display:
 * - rounds to 12 significant digits (`0.1 + 0.2` → "0.3")
 * - normalizes -0 to "0"
 * - uses compact exponent form (`1.5e13`, `1e-7`) outside [1e-6, 1e12)
 */
export function formatNumber(x: number): string {
  if (!Number.isFinite(x)) return String(x);

  const rounded = Number(x.toPrecision(DISPLAY_PRECISION));
  if (rounded === 0) return '0';

  const abs = Math.abs(rounded);
  if (abs >= EXP_UPPER || abs < EXP_LOWER) {
    const [mantissa, exponent] = rounded.toExponential(DISPLAY_PRECISION - 1).split('e');
    return `${stripMantissaZeros(mantissa)}e${Number(exponent)}`;
  }
  return String(rounded);
}
