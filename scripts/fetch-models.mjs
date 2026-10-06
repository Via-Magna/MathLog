// Downloads ink-on's CoMER model files (Apache-2.0) into public/models/comer/.
// Run once with `npm run models`, then commit the files so the app and the
// deployment work fully offline. Source: https://github.com/kimseungdae/ink-on
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://github.com/kimseungdae/ink-on/raw/main/public/models/comer/';
const FILES = [
  { name: 'encoder_int8.onnx', minBytes: 1_000_000 },
  { name: 'decoder_int8.onnx', minBytes: 1_000_000 },
  { name: 'vocab.json', minBytes: 1_000 },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'models', 'comer');
mkdirSync(dest, { recursive: true });

for (const { name, minBytes } of FILES) {
  const path = join(dest, name);
  if (existsSync(path) && statSync(path).size >= minBytes) {
    console.log(`[models] ${name} already present`);
    continue;
  }
  process.stdout.write(`[models] downloading ${name}… `);
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < minBytes || buf.subarray(0, 40).toString().startsWith('version https://git-lfs')) {
    throw new Error(`${name}: got ${buf.byteLength} bytes (a Git LFS pointer?). Download it manually from ${BASE}${name}`);
  }
  writeFileSync(path, buf);
  console.log(`${(buf.byteLength / 1e6).toFixed(1)} MB`);
}
console.log('[models] done');
