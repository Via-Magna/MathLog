// Generates dist/sw.js after `vite build` (runs as `postbuild`).
// No dependencies: it lists every file in dist/, removes the one Vite emits but
// the app never loads, and writes a service worker that precaches the rest.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.argv[2] ?? join(root, 'dist');

// ort.bundle.min.mjs references its .wasm with `new URL(..., import.meta.url)`, so
// Vite copies a 28 MB duplicate into assets/. The app always sets
// `ort.env.wasm.wasmPaths` to /ort/ (see src/recognition/inkOnEngine.ts), so the
// duplicate is never fetched. Removing it keeps the deploy and the cache small.
for (const f of readdirSync(join(dist, 'assets'))) {
  if (/^ort-wasm.*\.wasm$/.test(f)) {
    rmSync(join(dist, 'assets', f));
    console.log(`[build-sw] removed unused duplicate assets/${f}`);
  }
}

const SKIP = [/\.map$/, /^sw\.js$/, /^icons\.svg$/, /^_headers$/, /^vercel\.json$/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(dist)
  .map((path) => ({ path, url: relative(dist, path).split(sep).join('/') }))
  .filter(({ url }) => !SKIP.some((re) => re.test(url)))
  .sort((a, b) => a.url.localeCompare(b.url));

const hash = createHash('sha256');
let bytes = 0;
for (const { path, url } of files) {
  const data = readFileSync(path);
  bytes += data.length;
  hash.update(url).update(data);
}
const version = hash.digest('hex').slice(0, 12);
const urls = files.map(({ url }) => url);
if (!urls.includes('index.html')) throw new Error('[build-sw] dist/index.html is missing');

const template = readFileSync(join(root, 'scripts', 'sw-template.js'), 'utf8');
const sw = template
  .replace('__PRECACHE__', JSON.stringify(urls, null, 2))
  .replace('__VERSION__', version);
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`[build-sw] dist/sw.js: ${urls.length} files, ${(bytes / 1e6).toFixed(1)} MB precached, version ${version}`);
