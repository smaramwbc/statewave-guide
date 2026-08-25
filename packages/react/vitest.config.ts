import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Resolve workspace siblings to source so tests run without a build step. */
export default defineConfig({
  resolve: {
    alias: {
      '@statewavedev/guide-shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-actions': fileURLToPath(
        new URL('../actions/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
  },
});
