import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const own = (relative: string): string =>
  fileURLToPath(new URL(`./node_modules/${relative}`, import.meta.url));

/**
 * The benchmark fixture, rendered.
 *
 * `realistic-app` is the application all twenty-one benchmark features are
 * indexed from, and until Closed Loop #9 it was source the indexer read and
 * nobody ran. Its own dependencies are now installed beside it, so the same
 * source can be mounted in a DOM and observed.
 *
 * **One React, exactly, and it is this package's.** The fixture has its own copy
 * for the sake of being a self-contained application; letting a component
 * resolve one and the renderer resolve the other produces a null dispatcher and
 * an unreadable stack. Pinning React alone is not enough — `react-router` reads
 * React through its *own* dependency edge, so the router, the form library and
 * the HTTP client are pinned here too and every one of them resolves the same
 * React the renderer holds.
 */
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: own('react'),
      'react-dom': own('react-dom'),
      'react-router-dom': own('react-router-dom'),
      'react-hook-form': own('react-hook-form'),
      axios: own('axios'),
      // The application under observation, behind one named specifier. See
      // `test/fixture-app.d.ts` for why it is not a relative import.
      'fixture-app': fileURLToPath(new URL('./test/harness/fixture-app.ts', import.meta.url)),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // Vitest externalises node_modules by default, and an externalised
        // module is loaded by Node's resolver — which does not see the aliases
        // above. `react-router` would then import the fixture's React while the
        // renderer holds this package's, and the dispatcher is null.
        inline: [/react-router/, /react-hook-form/, /axios/],
      },
    },
  },
});
