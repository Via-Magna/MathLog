// Copies onnxruntime-web's WebAssembly runtime into public/ort/ so it is
// served from our own origin (no CDN; works offline and under COEP).
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, 'public', 'ort');

if (!existsSync(src)) {
  console.error('[copy-ort] onnxruntime-web is not installed. Run "npm install" first.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => /^ort-wasm.*\.(wasm|mjs)$/.test(f));
for (const f of files) copyFileSync(join(src, f), join(dest, f));
console.log(`[copy-ort] copied ${files.length} files to public/ort/`);
