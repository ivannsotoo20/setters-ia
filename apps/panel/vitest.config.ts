import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  css: {
    postcss: { plugins: [] },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 10000,
  },
});
