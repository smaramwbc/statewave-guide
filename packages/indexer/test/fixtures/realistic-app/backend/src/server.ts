/**
 * The HTTP server.
 *
 * `API_PREFIX` is the backend half of the path-normalisation contract: it has
 * to equal `API_BASE_URL` in `frontend/src/lib/http.ts` for the two sides to
 * meet on the same `api:` nodes.
 */
import express from 'express';
import { clientsRouter } from './routes/clients';
import { invoicesRouter } from './routes/invoices';
import { settingsRouter } from './routes/settings';
import { legacyRouter } from './routes/legacy';
import { errorHandler, requestLogger } from './middleware/errorHandler';

/** Where the API is mounted. Must match `API_BASE_URL` in the frontend. */
export const API_PREFIX = '/api';

/** Port the server listens on unless the environment says otherwise. */
export const DEFAULT_PORT = 8787;

/**
 * The v0 mount point.
 *
 * Read from the environment, so its value is a deployment decision rather than
 * a source fact. Everything hanging off it is unknowable here.
 */
function legacyMountPoint(): string {
  return process.env.LEGACY_API_PREFIX ?? '/api/v0';
}

/** Builds the application. */
export function createServer() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // Liveness probe. Deliberately outside the API prefix: it is an endpoint, but
  // it is not one any frontend service can reach through the axios client.
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(API_PREFIX, clientsRouter);
  app.use(`${API_PREFIX}/invoices`, invoicesRouter);
  app.use(API_PREFIX, settingsRouter);
  app.use(legacyMountPoint(), legacyRouter);

  app.use(errorHandler);
  return app;
}

/** Starts the server. */
export function start(port: number = Number(process.env.PORT ?? DEFAULT_PORT)): void {
  createServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.info(`API listening on http://localhost:${port}${API_PREFIX}`);
  });
}
