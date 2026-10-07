import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Cross-origin isolation lets ONNX Runtime use SharedArrayBuffer for
// multi-threaded WASM. Without it, recognition still works on one thread.
// Production hosts set the same headers (vercel.json, public/_headers), and the
// service worker adds them where a host can't (GitHub Pages).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  // onnxruntime-web loads its own .wasm/.mjs at runtime; don't pre-bundle it.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})
