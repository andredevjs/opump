import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.mts'],
    setupFiles: ['__tests__/setup.ts'],
    testTimeout: 10_000,
    globals: false,
  },
});
