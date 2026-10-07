/* log(Math) service worker — generated into dist/sw.js by scripts/build-sw.mjs.
 *
 * 1. Precaches the whole app at install: HTML, JS, CSS, fonts, the ONNX Runtime
 *    WebAssembly files and the CoMER model (~40 MB), so after one online visit
 *    the app loads, recognizes and calculates with no network at all.
 * 2. Serves same-origin requests cache-first (navigations network-first, with
 *    the cached app shell as the offline fallback).
 * 3. Adds Cross-Origin-Opener-Policy / -Embedder-Policy headers to every
 *    response it serves, so the page is cross-origin isolated (multi-threaded
 *    WASM) even on hosts that can't set headers, such as GitHub Pages.
 */

/* global self, caches, fetch, Response, URL, Request */
const PRECACHE = __PRECACHE__; // [relative URL, ...]
const VERSION = '__VERSION__';
const CACHE = `logmath-precache-${VERSION}`;
const RUNTIME = 'logmath-runtime';
const SCOPE = self.registration.scope;
const APP_SHELL = new URL('index.html', SCOPE).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `cache: 'reload'` bypasses the HTTP cache so a new version never stores stale files.
      await cache.addAll(PRECACHE.map((url) => new Request(new URL(url, SCOPE), { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('logmath-') && k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Copies a response and adds the cross-origin isolation headers. */
function isolate(response) {
  if (!response || response.status === 0 || response.type === 'opaque') return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function fromCache(request) {
  return (await caches.match(request, { ignoreSearch: true })) ?? undefined;
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(APP_SHELL, response.clone());
    }
    return isolate(response);
  } catch {
    // Offline: serve the precached app shell.
    return isolate((await caches.match(APP_SHELL)) ?? Response.error());
  }
}

async function handleAsset(request) {
  const cached = await fromCache(request);
  if (cached) return isolate(cached);
  const response = await fetch(request);
  if (response.ok && request.method === 'GET') {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, response.clone());
  }
  return isolate(response);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('range')) return; // let the browser handle partial requests
  event.respondWith(request.mode === 'navigate' ? handleNavigation(request) : handleAsset(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
});
