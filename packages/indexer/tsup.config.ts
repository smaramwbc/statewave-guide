import { defineConfig } from 'tsup';
import type { Options } from 'tsup';

const shared = {
  format: ['esm'],
  sourcemap: true,
  treeshake: true,
  target: 'es2022',
  platform: 'node',
  external: ['ts-morph', 'picocolors', '@statewavedev/guide-shared'],
  // `satisfies` rather than `as const`: a readonly tuple is not assignable to
  // tsup's mutable `Format[]`, and spreading it into an entry would not type.
} satisfies Options;

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts'],
    dts: true,
    clean: true,
  },
  {
    // Only the CLI gets a shebang; the library entry must stay importable.
    ...shared,
    entry: ['src/cli.ts'],
    dts: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
