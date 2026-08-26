import { defineConfig } from '@statewavedev/guide-indexer';

/**
 * The demo is indexed as ONE application, frontend and backend together.
 *
 * That is the point: `src/services/clientService.ts` calls `POST /api/clients`
 * and `backend/src/routes/clients.ts` registers it, and both must land on the
 * same canonical endpoint node for the Inspector to reconstruct the full path.
 */
export default defineConfig({
  include: ['src/**/*.{ts,tsx}', 'backend/src/**/*.ts'],
  exclude: ['**/*.test.*', '**/node_modules/**'],
});
