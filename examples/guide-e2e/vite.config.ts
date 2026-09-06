/**
 * The interactive host.
 *
 * Mounts the *benchmark* application — the same `realistic-app` every claim in
 * the ProductModel was compiled from — rather than a demo written to flatter the
 * guide. Every semantic id, route and label the query contract knows about is
 * one this application actually renders, which is the only way an end-to-end
 * result means anything.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const fixture = path.join(repo, 'packages/indexer/test/fixtures/realistic-app/frontend/src');
const GUIDE_MEMORY_BACKEND = `http://127.0.0.1:${process.env['GUIDE_MEMORY_PORT'] ?? 4320}`;
console.log('[vite.config] guide-memory proxy ->', GUIDE_MEMORY_BACKEND);

export default defineConfig({
  resolve: {
    // One React. The workspace packages, the fixture application and this host
    // each resolve `react` independently, and three copies produce a null
    // dispatcher the moment a hook runs — the same failure Closed Loop #9 hit
    // when it first tried to execute this fixture.
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      react: path.join(here, 'node_modules/react'),
      'react-dom': path.join(here, 'node_modules/react-dom'),
      'react-router-dom': path.join(here, 'node_modules/react-router-dom'),
      'fixture-app': path.join(here, 'src/fixture-app.ts'),
      'fixture-src': fixture,
      'harness-backend': path.join(repo, 'packages/runtime/test/harness/fixture-backend.ts'),
    },
  },
  plugins: [react()],
  /**
   * The trusted tier sits behind this proxy.
   *
   * `/guide-memory/*` is a path on this origin, so the page never learns a
   * Statewave URL and never holds a credential — both live in the separate Node
   * process the harness starts beside this one. When that process is not
   * running the proxy fails and the guide behaves exactly as it does with no
   * memory at all, which is the fallback the scenarios exercise.
   */
  server: { port: 4318, strictPort: true, proxy: { '/guide-memory': GUIDE_MEMORY_BACKEND } },
  preview: { port: 4319, strictPort: true, proxy: { '/guide-memory': GUIDE_MEMORY_BACKEND } },
  build: { outDir: 'dist', emptyOutDir: true },
});
