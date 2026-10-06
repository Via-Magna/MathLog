import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      // `npm run test:coverage` needs @vitest/coverage-v8 (see README).
      provider: 'v8',
      include: ['src/math/**', 'src/recognition/**'],
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
