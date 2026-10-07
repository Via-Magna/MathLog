import { describe, it, expect } from 'vitest';
import { answerText, hasEquals, hintDetail, readingText, spokenText } from '../../src/answers/answerText';
import { TOKENS_18, bad, line, ok, undef } from './helpers';

describe('answerText', () => {
  it('shows the value once "=" is written', () => {
    expect(answerText(line({ result: ok('30', TOKENS_18) }))).toEqual({ kind: 'value', text: '30' });
  });

  it('uses a typographic minus for negative answers', () => {
    expect(answerText(line({ result: ok('-5') }))?.text).toBe('−5');
  });

  it('shows nothing before "=" is written', () => {
    expect(answerText(line({ result: ok('30', [], true) }))).toBeNull();
    expect(answerText(line({ result: { kind: 'pending', rawTokens: [] } }))).toBeNull();
  });

  it('shows Undefined for division by zero', () => {
    expect(answerText(line({ result: undef() }))).toEqual({ kind: 'undefined', text: 'Undefined' });
  });

  it('shows ? for unreadable lines with an "=", nothing without one', () => {
    expect(answerText(line({ result: bad() }))).toEqual({ kind: 'unknown', text: '?' });
    expect(answerText(line({ equals: null, result: bad(['1', '+', '=']) }))?.text).toBe('?');
    expect(answerText(line({ equals: null, result: bad(['1', '+']) }))).toBeNull();
  });

  it('shows ? when recognition failed on a line with "="', () => {
    expect(answerText(line({ status: 'failed' }))?.text).toBe('?');
    expect(answerText(line({ status: 'failed', equals: null }))).toBeNull();
  });

  it('shows nothing while reading', () => {
    expect(answerText(line({ status: 'queued' }))).toBeNull();
    expect(answerText(line({ status: 'recognizing', result: ok('30') }))).toBeNull();
    expect(answerText(line({ status: 'done' }))).toBeNull();
  });

  it('hasEquals uses geometry or the model reading', () => {
    expect(hasEquals({ equals: null, result: undefined })).toBe(false);
    expect(hasEquals({ equals: null, result: ok('1', ['1', '=']) })).toBe(true);
  });
});

describe('reading and spoken text', () => {
  it('pretty-prints the model tokens', () => {
    expect(readingText(TOKENS_18)).toBe('18+4×3=');
    expect(readingText(['1', '2', '\\div', '0', '-', '1', '\\alpha'])).toBe('12÷0−1alpha');
  });

  it('reads the equation and answer aloud', () => {
    expect(spokenText(TOKENS_18, { kind: 'value', text: '30' })).toBe('18 plus 4 times 3 equals 30');
    expect(spokenText(['5', '-', '9', '='], { kind: 'value', text: '−4' })).toBe('5 minus 9 equals minus 4');
    expect(spokenText(['1', '2', '\\div', '0', '='], { kind: 'undefined', text: 'Undefined' })).toBe(
      '12 divided by 0 equals undefined',
    );
    expect(spokenText(['1', '+'], { kind: 'unknown', text: '?' })).toBe('1 plus, not readable');
    expect(spokenText([], { kind: 'unknown', text: '?' })).toBe('Answer not readable');
  });

  it('explains errors and division by zero', () => {
    expect(hintDetail(bad([], 'Brackets do not match'))).toBe('Brackets do not match');
    expect(hintDetail(undef())).toBe('Division by zero');
    expect(hintDetail(ok('1'))).toBeNull();
    expect(hintDetail(undefined)).toBeNull();
  });
});
