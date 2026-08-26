import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Resolve workspace siblings to source so tests run without a build step. */
export default defineConfig({
  resolve: {
    alias: {
      '@statewavedev/guide-shared': fileURLToPath(
        new URL('../shared/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-indexer': fileURLToPath(
        new URL('../indexer/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
