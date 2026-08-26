import { defineConfig, type Options } from 'tsup';

const shared = {
  format: ['esm'],
  sourcemap: true,
  treeshake: true,
  target: 'es2022',
  platform: 'node',
  external: ['zod', 'picocolors', '@statewavedev/guide-shared', '@statewavedev/guide-indexer'],
} satisfies Options;

export default defineConfig([
  { ...shared, entry: ['src/index.ts'], dts: true, clean: true },
  {
    // Only the CLI gets a shebang; the library entry must stay importable.
    ...shared,
    entry: ['src/cli.ts'],
    dts: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
