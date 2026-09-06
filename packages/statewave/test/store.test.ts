/**
 * The Statewave adapter, exercised through the real SDK.
 *
 * The fake here is a `fetch`, and nothing above it. The real
 * `StatewaveClient` builds the request, the real adapter decides what goes in
 * it, and the real validator decides what the adapter will carry — so what these
 * tests assert about an outbound body is an assertion about the bytes the
 * production path would send. Closed Loop #19 shipped a gate that tested a
 * different code path than production and an audit found it; faking at the
 * socket is the answer to that.
 *
 * No network is touched. `pnpm verify` must run with no Statewave anywhere.
 */

import { describe, expect, it } from 'vitest';
import { StatewaveClient } from '@statewavedev/sdk';
import type { GuideMemoryEvent } from '@statewavedev/guide-core';
import {
  STATEWAVE_READ_LIMIT,
  createStatewaveGuideMemoryStore,
  statewaveSubjectFor,
  GUIDE_EPISODE_SOURCE,
  GUIDE_EPISODE_TYPE,
} from '../src/index.js';

/** One captured HTTP call, exactly as the SDK made it. */
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * A `fetch` that records what it was asked to send and answers from a script.
 *
 * Episodes are kept so a read can return what a write stored, which is what
 * makes a round trip testable without a server.
 */
function fakeStatewave(
  options: {
    onCreate?: (call: Call) => Response | undefined;
    onTimeline?: (subject: string) => Response | undefined;
  } = {},
) {
  const calls: Call[] = [];
  const episodes = new Map<string, Record<string, unknown>[]>();
  let nextId = 0;

  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const call: Call = {
      url,
      method,
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
      body: raw === undefined ? undefined : JSON.parse(raw),
    };
    calls.push(call);

    if (url.includes('/v1/episodes') && method === 'POST') {
      const scripted = options.onCreate?.(call);
      if (scripted !== undefined) return scripted;
      const body = call.body as { subject_id: string; payload: Record<string, unknown> };
      nextId += 1;
      const stored = episodes.get(body.subject_id) ?? [];
      // The server's idempotency: a repeat of a key returns the existing row.
      const key = (call.body as { idempotency_key?: string }).idempotency_key;
      const existing = stored.find((e) => (e['__key'] as string | undefined) === key);
      if (key !== undefined && existing !== undefined) return json(existing);
      const episode = {
        id: `ep_${nextId}`,
        subject_id: body.subject_id,
        source: (call.body as { source: string }).source,
        type: (call.body as { type: string }).type,
        payload: body.payload,
        metadata: {},
        provenance: {},
        created_at: '2026-08-29T10:00:00Z',
        __key: key,
      };
      stored.push(episode);
      episodes.set(body.subject_id, stored);
      return json(episode);
    }

    if (url.includes('/v1/timeline')) {
      const subject = decodeURIComponent(new URL(url).searchParams.get('subject_id') ?? '');
      const scripted = options.onTimeline?.(subject);
      if (scripted !== undefined) return scripted;
      return json({ subject_id: subject, episodes: episodes.get(subject) ?? [], memories: [] });
    }

    if (url.includes('/v1/subjects/') && method === 'DELETE') {
      const subject = decodeURIComponent(url.split('/v1/subjects/')[1] ?? '');
      const count = episodes.get(subject)?.length ?? 0;
      episodes.delete(subject);
      return json({ subject_id: subject, episodes_deleted: count, memories_deleted: 0 });
    }

    return json({ detail: 'not found' }, 404);
  };

  return { calls, episodes, fetchImpl };
}

function storeWith(fake: ReturnType<typeof fakeStatewave>) {
  const client = new StatewaveClient({ baseUrl: 'http://statewave.test', retry: false });
  // The SDK reads the global. Swapping it is how the real client gets a fake
  // socket without the adapter knowing anything has changed.
  const previous = globalThis.fetch;
  globalThis.fetch = fake.fetchImpl as typeof globalThis.fetch;
  const store = createStatewaveGuideMemoryStore({ client });
  return { store, restore: () => (globalThis.fetch = previous) };
}

const EVENT = (over: Partial<GuideMemoryEvent> = {}): GuideMemoryEvent =>
  ({
    eventId: 'ev-a-1',
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

describe('what the adapter sends', () => {
  it('maps one event onto one episode under the scope subject', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    restore();

    const post = fake.calls.find((call) => call.method === 'POST');
    expect(post?.url).toBe('http://statewave.test/v1/episodes');
    const body = post?.body as Record<string, unknown>;
    expect(body['subject_id']).toBe('statewave-guide:demo:user:u1');
    expect(body['source']).toBe(GUIDE_EPISODE_SOURCE);
    expect(body['type']).toBe(GUIDE_EPISODE_TYPE);
    // The logical state key, not the event id. Finishing one walkthrough on one
    // build is a single fact however many times it is observed, and Statewave
    // resolves an idempotency collision by keeping the first write — so the key
    // is what turns a repeat into a no-op instead of another durable episode.
    expect(body['idempotency_key']).toBe('guide.state:completion:demo:clients.create:build-1');
  });

  it('sends the bounded event and nothing else', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    restore();
    const payload = (fake.calls[0]?.body as { payload: Record<string, unknown> }).payload;
    expect(Object.keys(payload).sort()).toEqual([
      'appId',
      'applicationVersion',
      'authority',
      'eventId',
      'featureId',
      'kind',
      'occurredAt',
      'subjectId',
    ]);
  });

  it('carries no credential of its own', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    restore();
    const headers = fake.calls[0]?.headers ?? {};
    expect(headers['x-api-key']).toBeUndefined();
    expect(headers['x-tenant-id']).toBeUndefined();
  });
});

describe('what is validated is what is sent', () => {
  /**
   * The Closed Loop #19.1 finding, moved to the boundary that matters more.
   * There the destination was `localStorage`; here it is somebody else's
   * database, and the request body is built by a client this package does not
   * own.
   */
  it('refuses to let an inherited toJSON write the request body', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    const smuggler = Object.assign(
      Object.create({
        toJSON: () => ({
          note: 'How do I export the client list? — asked by ada@example.com',
          instance: 'INV-001',
          key: 'sk_live_51H8xQ2eZvKYlo2C',
        }),
      }),
      EVENT(),
    ) as GuideMemoryEvent;
    await store.append(smuggler);
    restore();
    const sent = JSON.stringify(fake.calls[0]?.body);
    expect(sent).not.toMatch(/sk_live/);
    expect(sent).not.toMatch(/@/);
    expect(sent).not.toMatch(/INV-\d/);
    expect(sent).toContain('clients.create');
  });

  it('reads each field once, so a value cannot change after it is checked', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    let reads = 0;
    const flipping = { ...EVENT() } as Record<string, unknown>;
    Object.defineProperty(flipping, 'featureId', {
      enumerable: true,
      get() {
        reads += 1;
        return reads <= 8 ? 'clients.create' : 'leak sk_live_51H8xQ2eZvKYlo2C INV-001';
      },
    });
    await store.append(flipping as unknown as GuideMemoryEvent);
    restore();
    const sent = JSON.stringify(fake.calls[0]?.body);
    expect(sent).not.toMatch(/sk_live/);
    expect(sent).toContain('clients.create');
  });

  it('sends nothing at all for an event that does not validate', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ featureId: 'How do I create a client?' }));
    await store.append(EVENT({ kind: 'DELETE_ACCOUNT' as GuideMemoryEvent['kind'] }));
    restore();
    expect(fake.calls).toHaveLength(0);
    expect(store.diagnostics().rejectedOnWrite).toBe(2);
  });
});

describe('what the adapter accepts back', () => {
  it('round-trips an event through a write and a read', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    const read = await store.read(SCOPE);
    restore();
    expect(read).toHaveLength(1);
    expect(read[0]).toEqual(EVENT());
  });

  it('ignores episodes it did not write', async () => {
    const fake = fakeStatewave({
      onTimeline: (subject) =>
        new Response(
          JSON.stringify({
            subject_id: subject,
            episodes: [
              {
                id: 'ep_x',
                subject_id: subject,
                source: 'some-other-product',
                type: 'chat.message',
                payload: { ...EVENT(), eventId: 'ev-foreign' },
                metadata: {},
                provenance: {},
                created_at: '2026-08-29T10:00:00Z',
              },
            ],
            memories: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const { store, restore } = storeWith(fake);
    const read = await store.read(SCOPE);
    restore();
    expect(read).toEqual([]);
  });

  it('ignores a record that belongs to a different scope', async () => {
    const fake = fakeStatewave({
      onTimeline: (subject) =>
        new Response(
          JSON.stringify({
            subject_id: subject,
            episodes: [
              {
                id: 'ep_y',
                subject_id: subject,
                source: GUIDE_EPISODE_SOURCE,
                type: GUIDE_EPISODE_TYPE,
                // Well-formed in every respect except whose it is.
                payload: { ...EVENT(), subjectId: 'u2' },
                metadata: {},
                provenance: {},
                created_at: '2026-08-29T10:00:00Z',
              },
            ],
            memories: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    const { store, restore } = storeWith(fake);
    const read = await store.read(SCOPE);
    restore();
    expect(read).toEqual([]);
    expect(store.diagnostics().ignoredOnRead).toBe(1);
  });

  it('ignores a malformed record without losing the good ones', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    fake.episodes.get(statewaveSubjectFor(SCOPE))?.push({
      id: 'ep_bad',
      subject_id: statewaveSubjectFor(SCOPE),
      source: GUIDE_EPISODE_SOURCE,
      type: GUIDE_EPISODE_TYPE,
      payload: { nonsense: true },
      metadata: {},
      provenance: {},
      created_at: '2026-08-29T10:00:00Z',
    });
    const read = await store.read(SCOPE);
    restore();
    expect(read).toHaveLength(1);
    expect(store.diagnostics().ignoredOnRead).toBe(1);
  });
});

describe('failure costs personalisation and nothing else', () => {
  it('returns no memory when the read fails', async () => {
    const fake = fakeStatewave({
      onTimeline: () => new Response('upstream exploded', { status: 500 }),
    });
    const { store, restore } = storeWith(fake);
    const read = await store.read(SCOPE);
    restore();
    expect(read).toEqual([]);
    expect(store.diagnostics().readFailures).toBe(1);
    expect(store.diagnostics().mode).toBe('REMOTE_DEGRADED');
  });

  it('does not throw when the write fails', async () => {
    const fake = fakeStatewave({
      onCreate: () => new Response('nope', { status: 503 }),
    });
    const { store, restore } = storeWith(fake);
    await expect(store.append(EVENT())).resolves.toBeUndefined();
    restore();
    expect(store.diagnostics().writeFailures).toBe(1);
    expect(store.diagnostics().written).toBe(0);
  });

  it('survives a response that is not the shape it expected', async () => {
    const fake = fakeStatewave({
      onTimeline: () =>
        new Response('{"subject_id":"x","episodes":"not-an-array"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const { store, restore } = storeWith(fake);
    const read = await store.read(SCOPE);
    restore();
    expect(read).toEqual([]);
  });

  it('reports a truncated read rather than pretending it was complete', async () => {
    const many = Array.from({ length: STATEWAVE_READ_LIMIT }, (_, index) => ({
      id: `ep_${index}`,
      subject_id: statewaveSubjectFor(SCOPE),
      source: GUIDE_EPISODE_SOURCE,
      type: GUIDE_EPISODE_TYPE,
      payload: { ...EVENT({ eventId: `ev-a-${index}` }) },
      metadata: {},
      provenance: {},
      created_at: '2026-08-29T10:00:00Z',
    }));
    const fake = fakeStatewave({
      onTimeline: (subject) =>
        new Response(JSON.stringify({ subject_id: subject, episodes: many, memories: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    const { store, restore } = storeWith(fake);
    await store.read(SCOPE);
    restore();
    expect(store.diagnostics().truncatedReads).toBe(1);
    expect(store.diagnostics().mode).toBe('REMOTE_DEGRADED');
  });
});

describe('a retry is not a second completion', () => {
  it('sends the same idempotency key and gets one episode', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    await store.append(EVENT());
    const read = await store.read(SCOPE);
    restore();
    expect(fake.episodes.get(statewaveSubjectFor(SCOPE))).toHaveLength(1);
    expect(read).toHaveLength(1);
  });
});

describe('forgetting', () => {
  it('deletes exactly the scope subject', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT());
    await store.append(EVENT({ eventId: 'ev-b-1', subjectId: 'u2' }));
    await store.clear(SCOPE);
    const mine = await store.read(SCOPE);
    const theirs = await store.read({ appId: 'demo', subjectId: 'u2' });
    restore();
    expect(mine).toEqual([]);
    expect(theirs).toHaveLength(1);
  });

  it('reports a reset that did not happen', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    globalThis.fetch = (async () => new Response('no', { status: 500 })) as typeof globalThis.fetch;
    await expect(store.clear(SCOPE)).rejects.toThrow();
    restore();
  });
});

describe('the subject is the guide scope', () => {
  it('separates users and workspaces the way the scope key does', () => {
    expect(statewaveSubjectFor({ appId: 'demo', subjectId: 'u1' })).toBe(
      'statewave-guide:demo:user:u1',
    );
    expect(statewaveSubjectFor({ appId: 'demo', subjectId: 'u1', workspaceId: 'w1' })).toBe(
      'statewave-guide:demo:user:u1:workspace:w1',
    );
  });

  it('refuses a scope that could forge another subject', () => {
    expect(() => statewaveSubjectFor({ appId: 'demo', subjectId: 'u1:workspace:w9' })).toThrow();
  });
});

describe('what forgetting does not reach', () => {
  /**
   * Pinned because the natural reading of "Reset Guide memory" is wider than
   * what one `DELETE /v1/subjects/{id}` can do. An audit found this and called
   * it "forget me does not forget"; the behaviour is defensible and the silence
   * was not, so it is asserted here rather than left to be discovered.
   */
  it('forgets one scope, and a person in two workspaces is two scopes', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-w-0' }));
    await store.append(EVENT({ eventId: 'ev-w-1', workspaceId: 'w1' } as never));
    await store.clear(SCOPE);
    const withoutWorkspace = await store.read(SCOPE);
    const inWorkspace = await store.read({ appId: 'demo', subjectId: 'u1', workspaceId: 'w1' });
    restore();
    expect(withoutWorkspace).toEqual([]);
    // Still there. A host offering a workspace-wide reset must call clear once
    // per workspace, because nothing here can enumerate them.
    expect(inWorkspace).toHaveLength(1);
  });

  it('deletes exactly one subject per call', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-w-2' }));
    await store.clear(SCOPE);
    restore();
    const deletes = fake.calls.filter((call) => call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]?.url).toContain(encodeURIComponent('statewave-guide:demo:user:u1'));
  });
});

describe('a read is absence, never an exception', () => {
  it('does not throw when the scope cannot make a key', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    // `statewaveSubjectFor` throws on this. An audit found the throw escaping to
    // the caller, which turns a memory failure into an error in a path that was
    // promised absence.
    const read = await store.read({ appId: 'demo', subjectId: 'u1:workspace:w9' });
    restore();
    expect(read).toEqual([]);
    expect(store.diagnostics().readFailures).toBe(1);
  });

  it('recovers its mode when a later read succeeds', async () => {
    let fail = true;
    const fake = fakeStatewave({
      onTimeline: () => (fail ? new Response('no', { status: 500 }) : undefined),
    });
    const { store, restore } = storeWith(fake);
    await store.read(SCOPE);
    expect(store.diagnostics().mode).toBe('REMOTE_DEGRADED');
    fail = false;
    // A degradation that latches forever makes one blip look like a broken
    // system for the life of the process.
    await store.append(EVENT({ eventId: 'ev-h-1' }));
    await store.read(SCOPE);
    restore();
    expect(store.diagnostics().mode).toBe('REMOTE');
    // The history is still there, in the counters where it belongs.
    expect(store.diagnostics().readFailures).toBe(1);
  });
});

describe('what the retention policy withholds', () => {
  it('sends nothing for a kind that cannot change a later presentation', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-v-1', kind: 'GUIDANCE_VIEWED' }));
    await store.append(EVENT({ eventId: 'ev-x-1', kind: 'FULL_STEPS_EXPANDED' }));
    restore();

    expect(fake.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    expect(store.diagnostics().withheldByPolicy).toBe(2);
    expect(store.diagnostics().written).toBe(0);
  });

  it('withholding is not a rejection and not a failure', async () => {
    // The distinction is the whole point of the separate counter: an inspector
    // that showed rejections climbing through ordinary use would be training
    // whoever reads it to ignore the number.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-v-2', kind: 'GUIDANCE_VIEWED' }));
    restore();

    const diagnostics = store.diagnostics();
    expect(diagnostics.rejectedOnWrite).toBe(0);
    expect(diagnostics.writeFailures).toBe(0);
    expect(diagnostics.writeErrors).toBe(0);
    expect(diagnostics.mode).toBe('REMOTE');
    expect(diagnostics.lastFailure).toBeUndefined();
  });

  it('does not count withheld records against the persisted byte total', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-v-3', kind: 'GUIDANCE_VIEWED' }));
    restore();

    expect(store.diagnostics().bytesPersisted).toBe(0);
  });

  it('still sends the kinds a later answer reads', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-c-1', kind: 'STEP_THROUGH_COMPLETED' }));
    await store.append(
      EVENT({
        eventId: 'ev-p-1',
        kind: 'EXPLICIT_PREFERENCE_SET',
        featureId: undefined,
        authority: 'EXPLICIT_USER_PREFERENCE',
        metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
      }),
    );
    restore();

    expect(fake.calls.filter((call) => call.method === 'POST')).toHaveLength(2);
    expect(store.diagnostics().written).toBe(2);
    expect(store.diagnostics().withheldByPolicy).toBe(0);
  });

  it('rejects a malformed record before it ever reaches the policy', async () => {
    // Order matters. A record whose kind the caller made up must be counted as a
    // rejection, not quietly filed as "not durable" — the two mean different
    // things and only one of them warrants a look.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(
      EVENT({ eventId: 'ev-bad-1', kind: 'DELETE_ACCOUNT' as GuideMemoryEvent['kind'] }),
    );
    restore();

    expect(store.diagnostics().rejectedOnWrite).toBe(1);
    expect(store.diagnostics().withheldByPolicy).toBe(0);
  });

  it('a session of mixed traffic writes only what will be read back', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    const session: GuideMemoryEvent[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        EVENT({ eventId: `ev-view-${i}`, kind: 'GUIDANCE_VIEWED', featureId: `f${i}` }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        EVENT({ eventId: `ev-show-${i}`, kind: 'SHOW_ME_USED', featureId: `f${i}` }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        EVENT({ eventId: `ev-start-${i}`, kind: 'STEP_THROUGH_STARTED', featureId: `f${i}` }),
      ),
      EVENT({ eventId: 'ev-done-0', kind: 'STEP_THROUGH_COMPLETED', featureId: 'f0' }),
    ];
    for (const event of session) await store.append(event);
    restore();

    expect(session).toHaveLength(14);
    expect(store.diagnostics().written).toBe(1);
    expect(store.diagnostics().withheldByPolicy).toBe(13);
  });

  it('a withheld event leaves nothing behind for a later read', async () => {
    // The end-to-end shape of the policy: what was not written is not there, and
    // the read says so rather than inventing an absence.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-v-4', kind: 'GUIDANCE_VIEWED' }));
    await store.append(EVENT({ eventId: 'ev-c-2', kind: 'STEP_THROUGH_COMPLETED' }));
    const read = await store.read(SCOPE);
    restore();

    expect(read.map((event) => event.eventId)).toEqual(['ev-c-2']);
  });
});

describe('bounded durable state', () => {
  it('fifty observations of one completion are one episode', async () => {
    // The whole point of Closed Loop #20.2. Statewave resolves an idempotency
    // collision by keeping the first write, so a key that names the *state*
    // turns every repeat into a no-op instead of another durable record.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    for (let i = 0; i < 50; i += 1) {
      await store.append(
        EVENT({ eventId: `ev-rep-${i}`, occurredAt: `2026-08-29T10:00:0${i % 10}Z` }),
      );
    }
    const stored = await store.read(SCOPE);
    restore();

    expect(fake.calls.filter((c) => c.method === 'POST')).toHaveLength(50);
    expect(fake.episodes.get(statewaveSubjectFor(SCOPE))).toHaveLength(1);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe('STEP_THROUGH_COMPLETED');
  });

  it('the same guide on a different build is a different fact', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-b1', applicationVersion: 'build-1' }));
    await store.append(EVENT({ eventId: 'ev-b2', applicationVersion: 'build-2' }));
    restore();

    expect(fake.episodes.get(statewaveSubjectFor(SCOPE))).toHaveLength(2);
  });

  it('a preference is never collapsed into its first answer', async () => {
    // The failure this exists to prevent: keyed at ingest, four alternating
    // choices become one episode holding the FIRST value, and the person is
    // pinned to a setting they changed three times.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    for (const [i, value] of (['FULL', 'CONCISE', 'FULL', 'CONCISE'] as const).entries()) {
      await store.append(
        EVENT({
          eventId: `ev-p-${i}`,
          kind: 'EXPLICIT_PREFERENCE_SET',
          featureId: undefined,
          authority: 'EXPLICIT_USER_PREFERENCE',
          occurredAt: `2026-08-29T10:0${i}:00Z`,
          metadata: { preference: 'guidanceDetail', value },
        }),
      );
    }
    const stored = await store.read(SCOPE);
    restore();

    expect(fake.episodes.get(statewaveSubjectFor(SCOPE))).toHaveLength(4);
    expect(stored.map((e) => e.metadata?.value)).toEqual(['FULL', 'CONCISE', 'FULL', 'CONCISE']);
  });

  it('a retried write is still one episode', async () => {
    // Deduplication by state key must not have cost what the event id bought.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    const event = EVENT({ eventId: 'ev-retry' });
    await store.append(event);
    await store.append(event);
    restore();

    expect(fake.episodes.get(statewaveSubjectFor(SCOPE))).toHaveLength(1);
  });
});

describe('what the adapter asks the timeline for', () => {
  it('asks for the most recent page, not the oldest', async () => {
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    await store.read(SCOPE);
    restore();

    const get = fake.calls.find((c) => c.method === 'GET' && c.url.includes('/v1/timeline'));
    const url = new URL(get?.url ?? 'http://x/');
    // Before server v1.5.0 the route took no parameters and answered with the
    // oldest hundred, so a subject past the ceiling lost its recent history —
    // the half a memory system exists to have.
    expect(url.searchParams.get('newest_first')).toBe('true');
    expect(url.searchParams.get('limit')).toBe(String(STATEWAVE_READ_LIMIT));
  });
});

describe('a preference resolved from an active claim', () => {
  const PREF = (i: number, value: string, at: string): GuideMemoryEvent =>
    EVENT({
      eventId: `ev-cp-${i}`,
      kind: 'EXPLICIT_PREFERENCE_SET',
      featureId: undefined,
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: at,
      metadata: { preference: 'guidanceDetail', value },
    } as Partial<GuideMemoryEvent>);

  const claimMemory = (value: string, at: string, status = 'active') => ({
    id: '7f3c1a2e-9b41-4d55-8e07-2c6f5a1b9d33',
    subject_id: statewaveSubjectFor(SCOPE),
    kind: 'profile_fact',
    content: `guidanceDetail ${value}`,
    status,
    valid_from: '2026-01-01T00:00:00.123456Z',
    metadata: {
      claim: { key: 'guide.preference.guidancedetail', value: value.toLowerCase(), valid_from: at },
    },
  });

  // The timeline must answer with the episodes actually written as well as the
  // memories, because the adapter scopes a synthesised preference from an event
  // that already proved it belongs to this subject.
  const withMemories = (memories: unknown[]) => {
    const fake: ReturnType<typeof fakeStatewave> = fakeStatewave({
      onTimeline: (subject) =>
        new Response(
          JSON.stringify({
            subject_id: subject,
            episodes: fake.episodes.get(subject) ?? [],
            memories,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });
    return fake;
  };

  it('replaces the change history with the one value that is current', async () => {
    // The point of the keyed half: four choices are four episodes, and the
    // answer to "what is it now" is one record, not a replay.
    const fake = withMemories([claimMemory('CONCISE', '2026-01-04T10:00:00Z')]);
    const { store, restore } = storeWith(fake);
    for (const [i, value] of (['FULL', 'CONCISE', 'FULL', 'CONCISE'] as const).entries()) {
      await store.append(PREF(i, value, `2026-01-0${i + 1}T10:00:00Z`));
    }
    restore();

    const posts = fake.calls.filter((c) => c.method === 'POST');
    // Every change is still written — a preference is superseded, not deduped.
    expect(posts).toHaveLength(4);
    // And every one carries the claim that lets Statewave supersede it.
    const claim = (posts[0]?.body as { payload: Record<string, unknown> }).payload['statewave'];
    expect(claim).toMatchObject({
      memory_candidates: [{ claim: { key: 'guide.preference.guidancedetail', value: 'full' } }],
    });
  });

  it('reads the active claim as the current preference', async () => {
    const fake = withMemories([claimMemory('CONCISE', '2026-01-04T10:00:00Z')]);
    const { store, restore } = storeWith(fake);
    await store.append(PREF(0, 'FULL', '2026-01-01T10:00:00Z'));
    const read = await store.read(SCOPE);
    restore();

    expect(read).toHaveLength(1);
    expect(read[0]?.kind).toBe('EXPLICIT_PREFERENCE_SET');
    expect(read[0]?.metadata?.value).toBe('CONCISE');
    expect(store.diagnostics().activeClaims).toBe(1);
  });

  it('ignores a superseded claim', async () => {
    const fake = withMemories([claimMemory('FULL', '2026-01-01T10:00:00Z', 'superseded')]);
    const { store, restore } = storeWith(fake);
    await store.append(PREF(0, 'CONCISE', '2026-01-02T10:00:00Z'));
    const read = await store.read(SCOPE);
    restore();

    // No active claim, so the episodes answer — which is the pre-#20.2 path.
    expect(store.diagnostics().activeClaims).toBe(0);
    expect(read.map((e) => e.metadata?.value)).toEqual(['CONCISE']);
  });

  it("refuses a value outside this product's vocabulary", async () => {
    // A memory an operator edited, or one another producer wrote under a key
    // that happens to look like Guide's. Upper-casing whatever came back would
    // have turned it into a preference this product appears to understand.
    const fake = withMemories([claimMemory('SUDO', '2026-01-04T10:00:00Z')]);
    const { store, restore } = storeWith(fake);
    await store.append(PREF(0, 'FULL', '2026-01-01T10:00:00Z'));
    const read = await store.read(SCOPE);
    restore();

    expect(store.diagnostics().activeClaims).toBe(0);
    expect(read.map((e) => e.metadata?.value)).toEqual(['FULL']);
  });

  it('falls back to the episodes when nothing registered the key', async () => {
    // An unregistered key means Statewave stores no claim at all, so a host
    // that never ran the PATCH gets the old behaviour rather than a broken one.
    const fake = fakeStatewave();
    const { store, restore } = storeWith(fake);
    for (const [i, value] of (['FULL', 'CONCISE'] as const).entries()) {
      await store.append(PREF(i, value, `2026-01-0${i + 1}T10:00:00Z`));
    }
    const read = await store.read(SCOPE);
    restore();

    expect(store.diagnostics().activeClaims).toBe(0);
    expect(read).toHaveLength(2);
  });

  it('keeps the completion history while resolving the preference', async () => {
    const fake = withMemories([claimMemory('CONCISE', '2026-01-04T10:00:00Z')]);
    const { store, restore } = storeWith(fake);
    await store.append(EVENT({ eventId: 'ev-cp-done' }));
    await store.append(PREF(1, 'FULL', '2026-01-01T10:00:00Z'));
    const read = await store.read(SCOPE);
    restore();

    // Only the preference episodes are superseded by the claim. A completion is
    // a different fact and must survive.
    expect(read.map((e) => e.kind).sort()).toEqual([
      'EXPLICIT_PREFERENCE_SET',
      'STEP_THROUGH_COMPLETED',
    ]);
  });
});
