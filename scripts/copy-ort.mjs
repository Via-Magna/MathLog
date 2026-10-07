// Copies the onnxruntime-web WebAssembly runtime the app actually uses into
// public/ort/, so it is served from our own origin (no CDN; works offline and
// under COEP). Runs automatically before `npm run dev` and `npm run build`.
//
// Only the "jsep" build is copied: it is the one ort.bundle.min.mjs loads for
// the WASM execution provider (checked in the browser's network log). The other
// variants (plain, asyncify, jspi) would add ~57 MB that is never fetched.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORT_FILES = ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'public', 'ort');

if (!existsSync(src)) {
  console.error('[copy-ort] onnxruntime-web is not installed. Run "npm install" first.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
// Remove variants copied by older versions of this script.
for (const f of readdirSync(dest)) {
  if (!ORT_FILES.includes(f)) rmSync(join(dest, f));
}
for (const f of ORT_FILES) {
  if (!existsSync(join(src, f))) {
    console.error(`[copy-ort] ${f} not found in onnxruntime-web/dist. Has the package layout changed?`);
    process.exit(1);
  }
  copyFileSync(join(src, f), join(dest, f));
}
console.log(`[copy-ort] copied ${ORT_FILES.length} files to public/ort/`);
