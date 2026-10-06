import { mathError, type MathError, type Span } from './errors';
import type { RPNToken } from './parser';

export type RPNResult =
  | { kind: 'ok'; value: number }
  /** Division by zero: shown as "Undefined" on the canvas. */
  | { kind: 'undefined'; span: Span }
  | { kind: 'error'; error: MathError };

const overflow = (span: Span): RPNResult => ({ kind: 'error', error: mathError('OVERFLOW', span) });
const internal = (span: Span, detail: string): RPNResult => ({
  kind: 'error',
  error: mathError('INTERNAL', span, detail),
});

/** Stack-based RPN evaluation in IEEE-754 doubles. Never throws. */
export function evaluateRPN(rpn: readonly RPNToken[]): RPNResult {
  const stack: number[] = [];

  for (const tok of rpn) {
    if (tok.type === 'number') {
      const n = Number.parseFloat(tok.value);
      if (!Number.isFinite(n)) return overflow(tok.span);
      stack.push(n);
      continue;
    }

    if (tok.op === 'neg') {
      const a = stack.pop();
      if (a === undefined) return internal(tok.span, 'stack underflow');
      stack.push(-a);
      continue;
    }

    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return internal(tok.span, 'stack underflow');

    let r: number;
    switch (tok.op) {
      case '+':
        r = a + b;
        break;
      case '-':
        r = a - b;
        break;
      case '*':
        r = a * b;
        break;
      case '/':
        if (b === 0) return { kind: 'undefined', span: tok.span };
        r = a / b;
        break;
    }
    if (!Number.isFinite(r)) return overflow(tok.span);
    stack.push(r);
  }

  if (stack.length !== 1) return internal([0, 0], `expected 1 value, got ${stack.length}`);
  return { kind: 'ok', value: stack[0] };
}
