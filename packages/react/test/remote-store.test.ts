/**
 * The browser half of remote memory.
 *
 * An audit of Closed Loop #20 called this "the least-tested new code on the
 * most-used path", and it was right: every scenario a user actually walks goes
 * through this file, and the only thing exercising it was a browser capture that
 * needs a Statewave server to run at all.
 *
 * The fake here is a `fetch`. Everything above it — validation on the way out,
 * validation on the way in, the scope check, the failure handling — is the code
 * the page runs.
 */

import { describe, expect, it, vi } from 'vitest';
import type { GuideMemoryEvent } from '@statewavedev/guide-core';
import { createRemoteGuideMemoryStore } from '../src/memory/remote-store.js';

const EVENT = (over: Partial<GuideMemoryEvent> = {}): GuideMemoryEvent =>
  ({
    eventId: 'ev-r-1',
    appId: 'demo',
    subjectId: 'u1',
    featureId: 'clients.create',
    kind: 'STEP_THROUGH_COMPLETED',
    occurredAt: '2026-08-29T10:00:00Z',
    applicationVersion: 'build-1',
    authority: 'OBSERVED_INTERACTION',
    ...over,
  }) as GuideMemoryEvent;

const SCOPE = { appId: 'demo', subjectId: 'u1' };

/** A `fetch` that records requests and answers from a script. */
function fakeEndpoint(
  handler: (url: string, init: RequestInit) => Response = () =>
    new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return handler(url, init ?? {});
  });
  return { calls, impl: impl as unknown as typeof globalThis.fetch };
}

describe('what the browser sends', () => {
  it('posts the validated event to the host endpoint and nothing else', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.append(EVENT());
    expect(fake.calls[0]?.url).toBe('/guide-memory/events');
    expect(fake.calls[0]?.method).toBe('POST');
    expect((fake.calls[0]?.body as { event: GuideMemoryEvent }).event).toEqual(EVENT());
  });

  it('does not send an event that fails validation', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.append(EVENT({ featureId: 'How do I create a client?' }));
    await store.append(EVENT({ kind: 'DELETE_ACCOUNT' as GuideMemoryEvent['kind'] }));
    expect(fake.calls).toHaveLength(0);
    expect(store.diagnostics().rejectedOnWrite).toBe(2);
  });

  it('sends what was validated, not the caller object', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    const smuggler = Object.assign(
      Object.create({
        toJSON: () => ({ note: 'ada@example.com asked', key: 'sk_live_51H8xQ2eZvKYlo2C' }),
      }),
      EVENT(),
    ) as GuideMemoryEvent;
    await store.append(smuggler);
    const sent = JSON.stringify(fake.calls[0]?.body);
    expect(sent).not.toMatch(/sk_live|@example/);
    expect(sent).toContain('clients.create');
  });

  it('asks for one scope and no other', async () => {
    const fake = fakeEndpoint(
      () =>
        new Response('{"events":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.read({ appId: 'demo', subjectId: 'u1', workspaceId: 'w1' });
    expect(fake.calls[0]?.url).toBe(
      '/guide-memory/events?scope=statewave-guide%3Ademo%3Auser%3Au1%3Aworkspace%3Aw1',
    );
  });
});

describe('what the browser accepts back', () => {
  const respondWith = (events: unknown[]) =>
    fakeEndpoint(
      () =>
        new Response(JSON.stringify({ events }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

  it('accepts a well-formed event for the scope it asked about', async () => {
    const fake = respondWith([EVENT()]);
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    expect(await store.read(SCOPE)).toEqual([EVENT()]);
  });

  it('refuses a record belonging to somebody else', async () => {
    // The backend is untrusted in exactly the sense a browser store is: it is a
    // place records come from, and shape decides whether they are guide memory.
    const fake = respondWith([EVENT({ subjectId: 'u2' })]);
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    expect(await store.read(SCOPE)).toEqual([]);
    expect(store.diagnostics().ignoredOnRead).toBe(1);
  });

  it('refuses a malformed record without losing a good one', async () => {
    const fake = respondWith([{ nonsense: true }, EVENT()]);
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    expect(await store.read(SCOPE)).toHaveLength(1);
  });

  it('survives a body that is not the shape it expected', async () => {
    const fake = fakeEndpoint(
      () =>
        new Response('{"events":"nope"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    expect(await store.read(SCOPE)).toEqual([]);
  });
});

describe('failure costs personalisation and nothing else', () => {
  it('returns absence when the endpoint is down', async () => {
    const fake = fakeEndpoint(() => new Response('no', { status: 503 }));
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    expect(await store.read(SCOPE)).toEqual([]);
    expect(store.diagnostics().readFailures).toBe(1);
    expect(store.diagnostics().mode).toBe('REMOTE_DEGRADED');
  });

  it('does not throw when a write fails', async () => {
    const fake = fakeEndpoint(() => new Response('no', { status: 500 }));
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await expect(store.append(EVENT())).resolves.toBeUndefined();
    expect(store.diagnostics().writeFailures).toBe(1);
    expect(store.diagnostics().written).toBe(0);
  });

  it('rethrows a reset that did not happen', async () => {
    // A reset that silently failed leaves somebody believing they were forgotten.
    const fake = fakeEndpoint(() => new Response('no', { status: 500 }));
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await expect(store.clear(SCOPE)).rejects.toThrow();
  });

  it('gives up rather than hanging', async () => {
    const store = createRemoteGuideMemoryStore({
      endpoint: '/guide-memory',
      timeoutMs: 10,
      fetch: (async (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof globalThis.fetch,
    });
    expect(await store.read(SCOPE)).toEqual([]);
    expect(store.diagnostics().readFailures).toBe(1);
  });
});

describe('what the browser keeps to itself', () => {
  it('never puts a kind with no future presentation effect on the network', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.append(EVENT({ eventId: 'ev-r-v1', kind: 'GUIDANCE_VIEWED' }));
    await store.append(EVENT({ eventId: 'ev-r-x1', kind: 'FULL_STEPS_EXPANDED' }));

    expect(fake.calls).toHaveLength(0);
    expect(store.diagnostics().withheldByPolicy).toBe(2);
    expect(store.diagnostics().written).toBe(0);
  });

  it('reports withholding as policy, not as a rejection or a failure', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.append(EVENT({ eventId: 'ev-r-v2', kind: 'GUIDANCE_VIEWED' }));

    const diagnostics = store.diagnostics();
    expect(diagnostics.rejectedOnWrite).toBe(0);
    expect(diagnostics.writeFailures).toBe(0);
    expect(diagnostics.bytesPersisted).toBe(0);
    expect(diagnostics.lastFailure).toBeUndefined();
  });

  it('still validates first, so a bad record is a rejection rather than a withholding', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.append(
      EVENT({ eventId: 'ev-r-bad', kind: 'DELETE_ACCOUNT' as GuideMemoryEvent['kind'] }),
    );

    expect(store.diagnostics().rejectedOnWrite).toBe(1);
    expect(store.diagnostics().withheldByPolicy).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('still sends a preference and a completion', async () => {
    const fake = fakeEndpoint();
    const store = createRemoteGuideMemoryStore({ endpoint: '/guide-memory', fetch: fake.impl });
    await store.append(EVENT({ eventId: 'ev-r-c1', kind: 'STEP_THROUGH_COMPLETED' }));
    await store.append(
      EVENT({
        eventId: 'ev-r-p1',
        kind: 'EXPLICIT_PREFERENCE_SET',
        featureId: undefined,
        authority: 'EXPLICIT_USER_PREFERENCE',
        metadata: { preference: 'assistanceMode', value: 'STEP_THROUGH' },
      }),
    );

    expect(fake.calls.map((call) => call.method)).toEqual(['POST', 'POST']);
    expect(store.diagnostics().written).toBe(2);
  });
});
