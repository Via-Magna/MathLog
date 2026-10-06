import { err, mathError, ok, type Result, type Span } from './errors';
import type { Operator, Token } from './tokenizer';

interface OperatorInfo {
  precedence: number;
  associativity: 'left' | 'right';
  arity: 1 | 2;
}

/**
 * Precedence table. Unary minus binds tighter than × and ÷, so `-2×3` is
 * `(-2)×3`. Adding `^` later is one row: precedence 4, right-associative.
 */
export const OPERATORS: Readonly<Record<Operator, OperatorInfo>> = {
  neg: { precedence: 3, associativity: 'right', arity: 1 },
  '*': { precedence: 2, associativity: 'left', arity: 2 },
  '/': { precedence: 2, associativity: 'left', arity: 2 },
  '+': { precedence: 1, associativity: 'left', arity: 2 },
  '-': { precedence: 1, associativity: 'left', arity: 2 },
};

export type RPNToken = Extract<Token, { type: 'number' } | { type: 'op' }>;

type StackEntry = Extract<Token, { type: 'op' } | { type: 'lparen' }>;

/**
 * Dijkstra's shunting-yard: infix tokens → Reverse Polish Notation.
 * Also validates syntax in the same pass by tracking whether the next token
 * should be an operand or an operator, so the evaluator only ever sees
 * well-formed RPN.
 */
export function toRPN(tokens: readonly Token[]): Result<RPNToken[]> {
  const output: RPNToken[] = [];
  const stack: StackEntry[] = [];
  let expectOperand = true;
  let prev: Token | undefined;
  let lastSpan: Span = [0, 0];
  let sawContent = false;

  for (const tok of tokens) {
    if (tok.type === 'equals') break;
    sawContent = true;

    switch (tok.type) {
      case 'number':
        if (!expectOperand) {
          return err(mathError('MISSING_OPERATOR', [prev!.span[0], tok.span[1]]));
        }
        output.push(tok);
        expectOperand = false;
        break;

      case 'lparen':
        if (!expectOperand) {
          // Only reachable with implicit multiplication turned off.
          return err(mathError('MISSING_OPERATOR', [prev!.span[0], tok.span[1]]));
        }
        stack.push(tok);
        break;

      case 'rparen': {
        if (expectOperand) {
          return err(mathError('MISSING_OPERAND', prev ? [prev.span[0], tok.span[1]] : tok.span));
        }
        let top = stack.pop();
        while (top && top.type === 'op') {
          output.push(top);
          top = stack.pop();
        }
        if (!top) return err(mathError('UNBALANCED_PARENS', tok.span, 'extra )'));
        break;
      }

      case 'op': {
        const info = OPERATORS[tok.op];
        if (info.arity === 1) {
          // Prefix operator: always in operand position, never pops.
          stack.push(tok);
          break;
        }
        if (expectOperand) {
          return err(
            prev
              ? mathError('UNEXPECTED_OPERATOR', [prev.span[0], tok.span[1]])
              : mathError('MISSING_OPERAND', tok.span),
          );
        }
        for (let top = stack.at(-1); top && top.type === 'op'; top = stack.at(-1)) {
          const topInfo = OPERATORS[top.op];
          const higher = topInfo.precedence > info.precedence;
          const equalLeft =
            topInfo.precedence === info.precedence && info.associativity === 'left';
          if (!higher && !equalLeft) break;
          output.push(top);
          stack.pop();
        }
        stack.push(tok);
        expectOperand = true;
        break;
      }
    }

    prev = tok;
    lastSpan = tok.span;
  }

  if (!sawContent) return err(mathError('EMPTY_EXPRESSION', [0, 0]));
  if (expectOperand) return err(mathError('MISSING_OPERAND', lastSpan));

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.type === 'lparen') return err(mathError('UNBALANCED_PARENS', top.span, 'missing )'));
    output.push(top);
  }
  return ok(output);
}
