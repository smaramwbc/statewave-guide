import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The demo consumes the workspace packages from source so that editing a
 * package is instantly visible in the running app — no build step in the loop.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@statewavedev/guide-shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-actions': fileURLToPath(
        new URL('../../packages/actions/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
      '@statewavedev/guide-react': fileURLToPath(
        new URL('../../packages/react/src/index.ts', import.meta.url),
      ),
      // The graph model and its traversal are pure and dependency-free, so the
      // Inspector can use them in the browser. Aliasing the module directly is
      // what keeps ts-morph — which the rest of the indexer needs — out of the
      // bundle entirely.
      '@statewavedev/guide-graph': fileURLToPath(
        new URL('../../packages/indexer/src/traversal.ts', import.meta.url),
      ),
    },
  },
  server: { port: 5173 },
});
