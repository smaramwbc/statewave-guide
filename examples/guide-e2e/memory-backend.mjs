/**
 * The host application's trusted backend.
 *
 * A separate process on purpose. Statewave has no browser-safe credential —
 * authentication is a server-wide `X-API-Key`, and `X-Tenant-ID` is asserted by
 * the caller rather than verified — so a key in frontend code is a key handed to
 * every visitor. The guide in the page talks to this, and only this talks to
 * Statewave:
 *
 * ```
 *   browser  ->  /guide-memory/*  (proxied here)  ->  Statewave
 * ```
 *
 * It is a process rather than a Vite plugin because that is what a host actually
 * has, and because Vite installs the preview server's own middlewares before it
 * calls a plugin's hook — a middleware registered there is never reached, and
 * the symptom is a route that reports itself mounted and answers 404.
 *
 * ## The part a real host must do differently, stated at full strength
 *
 * This endpoint takes the memory scope **from the browser**, and it has no
 * authentication and no rate limiting. Said plainly, rather than softly: any page
 * that can reach it can **read** any subject's guide memory, **write** records
 * into any subject's history, and **delete** any subject's memory entirely — and
 * it can do all of that as fast as it likes, against a credential the browser
 * never sees but which this process will happily spend on its behalf.
 *
 * That is acceptable in a fixture with no accounts, on a loopback port, started
 * by a test harness. It is not a pattern to copy. A real host derives the subject
 * from its own session — the same place it gets the user id it already trusts —
 * ignores whatever the page sends, and puts the same authentication and rate
 * limiting on this route as on any other write endpoint it owns.
 *
 * The status route says `CLIENT_ASSERTED_DEMO_ONLY` so this cannot be mistaken
 * for the recommended shape.
 *
 * Usage:
 *   STATEWAVE_GUIDE_URL=http://127.0.0.1:8110 node examples/guide-e2e/memory-backend.mjs
 *
 * @packageDocumentation
 */

import { createServer } from 'node:http';
import process from 'node:process';
import { StatewaveClient } from '@statewavedev/sdk';
import { createStatewaveGuideMemoryStore } from '@statewavedev/guide-statewave';
import { scopeKey } from '@statewavedev/guide-core';

const ROUTE = '/guide-memory/events';
const PORT = Number(process.env['GUIDE_MEMORY_PORT'] ?? 4320);
const baseUrl = process.env['STATEWAVE_GUIDE_URL'] ?? '';
const apiKey = process.env['STATEWAVE_GUIDE_API_KEY'] ?? '';
const tenantId = process.env['STATEWAVE_GUIDE_TENANT_ID'] ?? '';

const store =
  baseUrl.length === 0
    ? undefined
    : createStatewaveGuideMemoryStore({
        client: new StatewaveClient({
          baseUrl,
          // Present only if the operator set one. A local Statewave with no key
          // configured needs none, which is what the documented quickstart
          // produces.
          ...(apiKey.length === 0 ? {} : { apiKey }),
          ...(tenantId.length === 0 ? {} : { tenantId }),
        }),
      });

/**
 * Turn a scope key back into the scope it came from, refusing anything else.
 *
 * Parsed strictly and then re-derived: if rebuilding the key from the parsed
 * parts does not reproduce the input byte for byte, the input was not a key this
 * system produced.
 */
function scopeFromKey(key) {
  const withWorkspace = /^statewave-guide:([^:]+):user:([^:]+):workspace:([^:]+)$/.exec(key);
  const withoutWorkspace = /^statewave-guide:([^:]+):user:([^:]+)$/.exec(key);
  const parts = withWorkspace ?? withoutWorkspace;
  if (parts === null) return undefined;
  const scope =
    withWorkspace === null
      ? { appId: parts[1], subjectId: parts[2] }
      : { appId: parts[1], subjectId: parts[2], workspaceId: parts[3] };
  try {
    return scopeKey(scope) === key ? scope : undefined;
  } catch {
    return undefined;
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    // A memory event is a few hundred bytes. Anything larger is not one.
    if (size > 16_384) throw new Error('body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const say = (status, body) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json');
      // The demo host serves the page and this backend from two ports, so the
      // browser's call is cross-origin. A real host would mount this on its own
      // origin and need none of this; it is here because the alternative was a
      // dev-server proxy that silently did not route, and an integration proof
      // should not rest on a dev server's middleware ordering.
      response.setHeader('Access-Control-Allow-Origin', '*');
      response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (request.method === 'OPTIONS') {
      say(204, undefined);
      return;
    }

    if (url.pathname === '/guide-memory/status') {
      // Deliberately says nothing about *where* Statewave is or whether a key is
      // set. An audit pointed out that the earlier version handed a browser the
      // upstream base URL, in the same file that claims the page never learns
      // one. A capture that needs the configuration reads it from the process it
      // started, not over HTTP.
      say(200, { configured: store !== undefined, subjectTrust: 'CLIENT_ASSERTED_DEMO_ONLY' });
      return;
    }
    if (!url.pathname.startsWith(ROUTE)) {
      say(404, { error: 'not found' });
      return;
    }
    if (store === undefined) {
      // Not configured. The guide treats this exactly as it treats a store that
      // throws: no personalisation, unchanged guidance.
      say(503, { error: 'statewave not configured' });
      return;
    }

    try {
      if (request.method === 'POST') {
        const body = await readJson(request);
        if (body?.event === undefined) {
          say(400, { error: 'no event' });
          return;
        }
        // The store validates. This layer does not second-guess the shape; it
        // refuses to forward anything else, which is the same thing said once.
        await store.append(body.event);
        say(202, { accepted: true });
        return;
      }

      const scope = scopeFromKey(url.searchParams.get('scope') ?? '');
      if (scope === undefined) {
        say(400, { error: 'not a guide memory scope' });
        return;
      }
      if (request.method === 'GET') {
        // Events only. An earlier version returned the store's diagnostics here,
        // which carry `lastFailure` — the upstream error message — so the file
        // that promises "never the upstream body" was republishing it on the
        // success path. An audit caught the contradiction.
        say(200, { events: await store.read(scope) });
        return;
      }
      if (request.method === 'DELETE') {
        await store.clear(scope);
        say(200, { cleared: true });
        return;
      }
      say(405, { error: 'method not allowed' });
    } catch (error) {
      // Never a stack, and never the upstream body: this response reaches a
      // browser, and an upstream error message is not this application's to
      // republish.
      say(502, { error: error instanceof Error ? error.name : 'memory backend failed' });
    }
  })();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[guide-memory] backend on 127.0.0.1:${PORT}; statewave ${
      store === undefined ? 'NOT configured' : `at ${baseUrl}`
    }`,
  );
});
