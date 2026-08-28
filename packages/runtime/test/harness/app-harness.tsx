/**
 * The benchmark application, mounted and driveable.
 *
 * `realistic-app` is the source all twenty-one benchmark features are indexed
 * from. Until Closed Loop #9 nobody ran it. This harness mounts it in a DOM,
 * answers its HTTP from memory, and gives a test four verbs — navigate,
 * snapshot, act, reset.
 *
 * **The backend is in memory and there is no network.** §36's isolation is a
 * property of the transport rather than a rule somebody has to remember: the
 * axios adapter is replaced, so a `SAFE_PROBE` interaction physically cannot
 * reach anything real, and a mistake in a test is a failed assertion rather than
 * a mutated account.
 *
 * **Everything is deterministic.** Fixed seed data, no clock, no random ids. Two
 * runs of the same script produce the same evidence, which is what makes an
 * evidence hash meaningful.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App, SessionProvider, api } from 'fixture-app';
import { observe, recordNetwork } from '../../src/index.js';
import { CLIENTS, backend } from './fixture-backend.js';
import type {
  NetworkRecorder,
  ObservedRequest,
  RuntimeContext,
  RuntimeEvidenceSnapshot,
} from '../../src/index.js';

/** Publishes the router's current path so a snapshot can record it. */
function RouteProbe({ onRoute }: { onRoute: (path: string) => void }) {
  const location = useLocation();
  onRoute(location.pathname);
  return null;
}

/** A mounted application a test can drive. */
export interface Harness {
  snapshot(id: string): RuntimeEvidenceSnapshot;
  /** Requests recorded since the last `beginWindow`. */
  requestsInWindow(): readonly ObservedRequest[];
  beginWindow(id: string): void;
  endWindow(): void;
  find(semanticId: string): HTMLElement | null;
  all(semanticId: string): HTMLElement[];
  route(): string;
  settle(): Promise<void>;
  advance(ms: number): Promise<void>;
  destroy(): void;
}

export interface MountOptions {
  route: string;
  permissions?: readonly string[];
  fixtureState?: string;
}

const DEFAULT_PERMISSIONS = [
  'clients:read',
  'clients:create',
  'clients:update',
  'clients:delete',
  'invoices:read',
  'invoices:create',
  'settings:update',
];

/** Mounts the fixture and returns the handle. */
export async function mountApp(options: MountOptions): Promise<Harness> {
  const permissions = options.permissions ?? DEFAULT_PERMISSIONS;
  const state = {
    clients: [...CLIENTS],
    settings: { organisationName: 'Fixture Ltd', notificationsEnabled: true, defaultPlan: 'team' },
  };
  const recorder: NetworkRecorder = recordNetwork(
    api as unknown as Parameters<typeof recordNetwork>[0],
    backend(state),
  );
  let windowStart = 0;

  const container = document.createElement('div');
  document.body.append(container);
  let currentRoute = options.route;
  const root: Root = createRoot(container);

  await act(async () => {
    root.render(
      <SessionProvider
        value={{
          userId: 'usr_fixture',
          displayName: 'Fixture User',
          permissions: [...permissions],
        }}
      >
        <MemoryRouter initialEntries={[options.route]}>
          <RouteProbe onRoute={(path) => (currentRoute = path)} />
          <App />
        </MemoryRouter>
      </SessionProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  /** Answers anything still in flight after the tree is gone, and records it nowhere. */
  const quieten = (): void => {
    (api as unknown as { defaults: { adapter: unknown } }).defaults.adapter = async () => ({
      data: null,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
  };

  const context: Omit<RuntimeContext, 'route'> = {
    fixtureState: options.fixtureState ?? 'seeded',
    permissions: [...permissions],
    featureFlags: {},
  };

  return {
    snapshot: (id) => observe({ root: container, route: currentRoute, snapshotId: id, context }),
    requestsInWindow: () => recorder.requests.slice(windowStart),
    beginWindow: (id) => {
      windowStart = recorder.requests.length;
      recorder.beginInteraction(id);
    },
    endWindow: () => recorder.endInteraction(),
    find: (semanticId) =>
      container.querySelector<HTMLElement>(
        `[data-guide="${semanticId}"], [data-ai-id="${semanticId}"]`,
      ),
    all: (semanticId) => [
      ...container.querySelectorAll<HTMLElement>(
        `[data-guide="${semanticId}"], [data-ai-id="${semanticId}"]`,
      ),
    ],
    route: () => currentRoute,
    settle: async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    advance: async (ms) => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      });
    },
    destroy: () => {
      act(() => root.unmount());
      container.remove();
      // Deliberately not `recorder.restore()`.
      //
      // `api` is a module singleton the whole fixture shares, and a debounced
      // request can resolve after the tree is gone. Handing the transport back
      // to axios at that moment sends it to a real XHR, which fails in jsdom and
      // surfaces as an unhandled rejection with no connection to the test that
      // caused it. A quiet adapter answers the stragglers and records nothing.
      quieten();
    },
  };
}
