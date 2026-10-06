import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The brief forbids eval(); make sure no form of dynamic code execution sneaks into src/. */
const SRC = fileURLToPath(new URL('../../src', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [path] : [];
  });
}

const FORBIDDEN: [string, RegExp][] = [
  ['eval(', /\beval\s*\(/],
  ['new Function(', /\bnew\s+Function\s*\(/],
  ['Function(', /(^|[^.\w])Function\s*\(/],
  ['setTimeout with a string', /setTimeout\s*\(\s*['"`]/],
];

describe('safety: no dynamic code execution', () => {
  const files = sourceFiles(SRC);

  it('finds source files to scan', () => {
    expect(files.some((f) => f.includes(join('src', 'math')))).toBe(true);
  });

  it.each(FORBIDDEN)('src/ contains no %s', (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
