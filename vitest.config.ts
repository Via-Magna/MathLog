import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      // `npm run test:coverage` needs @vitest/coverage-v8 (see README).
      provider: 'v8',
      include: ['src/math/**', 'src/recognition/**'],
      // Browser-only glue (Worker, OffscreenCanvas, ONNX Runtime); covered by the
      // in-browser accuracy run instead of unit tests.
      exclude: [
        'src/recognition/recognition.worker.ts',
        'src/recognition/inkOnEngine.ts',
        'src/recognition/preprocessCanvas.ts',
        'src/recognition/timers.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 95,
      },
    },
  },
});
