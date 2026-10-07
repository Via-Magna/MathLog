import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Runs scripts/build-sw.mjs against a fake dist/ folder. */
const SCRIPT = fileURLToPath(new URL('../../scripts/build-sw.mjs', import.meta.url));

let dist: string;

function file(path: string, content = 'x') {
  const full = join(dist, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function build() {
  execFileSync(process.execPath, [SCRIPT, dist], { stdio: 'pipe' });
  return readFileSync(join(dist, 'sw.js'), 'utf8');
}

function precacheOf(sw: string): string[] {
  return JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)![1]);
}

const versionOf = (sw: string) => sw.match(/const VERSION = '([0-9a-f]+)'/)![1];

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'logmath-dist-'));
  file('index.html', '<!doctype html>');
  file('assets/main-abc.js', 'console.log(1)');
  file('assets/main-abc.js.map', '{}');
  file('assets/ort-wasm-simd-threaded.jsep-123.wasm', 'duplicate');
  file('ort/ort-wasm-simd-threaded.jsep.mjs', 'mjs');
  file('ort/ort-wasm-simd-threaded.jsep.wasm', 'wasm');
  file('models/comer/encoder_int8.onnx', 'enc');
  file('_headers', '/*');
});

afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe('build-sw', () => {
  it('precaches the app shell, runtime and model, sorted', () => {
    expect(precacheOf(build())).toEqual([
      'assets/main-abc.js',
      'index.html',
      'models/comer/encoder_int8.onnx',
      'ort/ort-wasm-simd-threaded.jsep.mjs',
      'ort/ort-wasm-simd-threaded.jsep.wasm',
    ]);
  });

  it('removes the unused duplicate ONNX Runtime wasm from assets/', () => {
    build();
    expect(existsSync(join(dist, 'assets/ort-wasm-simd-threaded.jsep-123.wasm'))).toBe(false);
    expect(existsSync(join(dist, 'ort/ort-wasm-simd-threaded.jsep.wasm'))).toBe(true);
  });

  it('skips source maps, host config and itself', () => {
    const urls = precacheOf(build());
    expect(urls.some((u) => u.endsWith('.map') || u === '_headers' || u === 'sw.js')).toBe(false);
    // Running twice must not precache the previous sw.js.
    expect(precacheOf(build())).toEqual(urls);
  });

  it('keeps the version stable for identical files and changes it when a file changes', () => {
    const v1 = versionOf(build());
    expect(versionOf(build())).toBe(v1);
    file('assets/main-abc.js', 'console.log(2)');
    expect(versionOf(build())).not.toBe(v1);
  });

  it('fills in the template and adds isolation headers', () => {
    const sw = build();
    expect(sw).not.toContain('__PRECACHE__');
    expect(sw).not.toContain('__VERSION__');
    expect(sw).toContain("'Cross-Origin-Embedder-Policy', 'require-corp'");
  });

  it('fails when index.html is missing', () => {
    rmSync(join(dist, 'index.html'));
    expect(() => build()).toThrow();
  });
});
