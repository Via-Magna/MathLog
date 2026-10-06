import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Cross-origin isolation lets ONNX Runtime use SharedArrayBuffer for
// multi-threaded WASM. Without it, recognition still works on one thread.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  // onnxruntime-web loads its own .wasm/.mjs at runtime; don't pre-bundle it.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})
