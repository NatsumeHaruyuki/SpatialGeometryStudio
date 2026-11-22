import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
  },
  test: { include: ['src/**/*.test.ts', 'electron/**/*.test.ts'] },
});
