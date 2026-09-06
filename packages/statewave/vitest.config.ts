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
      '@statewavedev/guide-semantic': fileURLToPath(
        new URL('../semantic/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
