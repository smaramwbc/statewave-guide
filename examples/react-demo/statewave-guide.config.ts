import { defineConfig } from '@statewavedev/guide-indexer';

export default defineConfig({
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['**/*.test.*', '**/node_modules/**'],
});
