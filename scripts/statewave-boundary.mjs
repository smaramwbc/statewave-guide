/**
 * What the Statewave adapter is allowed to be.
 *
 * Every check here runs with no network. The fake is a `fetch` and nothing above
 * it: the real SDK builds the request, the real adapter decides what goes in it,
 * and the real validator decides what the adapter will carry — so an assertion
 * about an outbound body is an assertion about the bytes production would send.
 * Closed Loop #19 shipped a gate that tested a different path than production
 * and an audit found it; faking at the socket is the answer to that.
 *
 * The scenarios that need a real server live in `capture:statewave`, which is
 * not a gate and never runs in CI. A gate that quietly needs a database is a
 * gate that will one day be disabled.
 *
 * Aspects, run individually by the gate manifest:
 *
 *   contract       one event becomes one episode under the scope subject
 *   minimisation   only the bounded event crosses the wire
 *   serialization  what was validated is what is sent, by value
 *   isolation      a record must belong to the scope it was found under
 *   fallback       a store that cannot answer costs personalisation only
 *   idempotency    a retry is not a second completion
 *   reset          forgetting deletes the guide subject and nothing else
 *   retention      only records a later answer can read are made durable
 *   bounded        durable state grows with distinct facts, not with repetitions
 *   authority      nothing read back can establish a product fact
 *   credentials    no key reaches anything the browser can hold
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'all' : (process.argv[aspectIndex + 1] ?? 'all');
const runs = (aspect) => ASPECT === 'all' || ASPECT === aspect;

const failures = [];
const notes = [];

const adapter = await import(
  pathToFileURL(path.join(ROOT, 'packages/statewave/dist/index.js')).href
);
// The retention aspect checks the adapter against core's durability table
// rather than against a list repeated here — two lists would drift, and the one
// in the gate would be the one nobody updated.
const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);
// Resolved from the adapter package, which is the only workspace member that
// depends on the SDK — the gate must not pretend it is available anywhere else.
const sdk = await import(
  pathToFileURL(path.join(ROOT, 'packages/statewave/node_modules/@statewavedev/sdk/dist/index.js'))
    .href
);

/** A fetch that records what it was asked to send and answers from a script. */
function fakeStatewave(options = {}) {
  const calls = [];
  const episodes = new Map();
  let nextId = 0;
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const fetchImpl = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({
      url,
      method,
      headers: Object.fromEntries(new Headers(init?.headers ?? {})),
      body,
    });
    if (url.includes('/v1/episodes') && method === 'POST') {
      const scripted = options.onCreate?.();
      if (scripted !== undefined) return scripted;
      const stored = episodes.get(body.subject_id) ?? [];
      const existing = stored.find((e) => e.__key === body.idempotency_key);
      if (body.idempotency_key !== undefined && existing !== undefined) return json(existing);
      nextId += 1;
      const episode = {
        id: `ep_${nextId}`,
        subject_id: body.subject_id,
        source: body.source,
        type: body.type,
        payload: body.payload,
        metadata: {},
        provenance: {},
        created_at: '2026-08-29T10:00:00Z',
        __key: body.idempotency_key,
      };
      stored.push(episode);
      episodes.set(body.subject_id, stored);
      return json(episode);
    }
    if (url.includes('/v1/timeline')) {
      const subject = decodeURIComponent(new URL(url).searchParams.get('subject_id') ?? '');
      const scripted = options.onTimeline?.(subject);
      if (scripted !== undefined) return scripted;
      // A modern server reports its window; the adapter treats a missing
      // has-more flag as a pre-pagination server and degrades, correctly.
      return json({
        subject_id: subject,
        episodes: episodes.get(subject) ?? [],
        memories: [],
        episodes_has_more: false,
        memories_has_more: false,
      });
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

function storeWith(fake, clientOptions = {}) {
  const client = new sdk.StatewaveClient({
    baseUrl: 'http://statewave.test',
    retry: false,
    ...clientOptions,
  });
  const previous = globalThis.fetch;
  globalThis.fetch = fake.fetchImpl;
  return {
    store: adapter.createStatewaveGuideMemoryStore({ client }),
    restore: () => {
      globalThis.fetch = previous;
    },
  };
}

let counter = 0;
const event = (over = {}) => {
  counter += 1;
  return {
    eventId: `ev-g-${counter}`,
    appId: 'demo',
    subjectId: 'u1',
    featureId: 'clients.create',
    kind: 'STEP_THROUGH_COMPLETED',
    occurredAt: '2026-08-29T10:00:00Z',
    applicationVersion: 'build-1',
    authority: 'OBSERVED_INTERACTION',
    ...over,
  };
};
const SCOPE = { appId: 'demo', subjectId: 'u1' };

if (runs('contract')) {
  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);
  await store.append(event({ eventId: 'ev-c-1' }));
  restore();
  const post = fake.calls.find((call) => call.method === 'POST');
  if (post?.url !== 'http://statewave.test/v1/episodes')
    failures.push(`an event went to ${post?.url}`);
  if (post?.body?.subject_id !== 'statewave-guide:demo:user:u1')
    failures.push(`the subject is ${post?.body?.subject_id}`);
  if (post?.body?.source !== adapter.GUIDE_EPISODE_SOURCE)
    failures.push(`the source is ${post?.body?.source}`);
  if (post?.body?.type !== adapter.GUIDE_EPISODE_TYPE)
    failures.push(`the type is ${post?.body?.type}`);
  // The idempotency key names the STATE, not the observation.
  //
  // It used to be the event id, which collapsed a retry but not a repeat:
  // finishing the same walkthrough on the same build fifty times wrote fifty
  // durable episodes, all asserting one fact. Statewave keeps the first write on
  // a collision, so a key that names the state makes the repeats no-ops.
  if (post?.body?.idempotency_key !== 'guide.state:completion:demo:clients.create:build-1')
    failures.push(`the idempotency key is ${post?.body?.idempotency_key}, not the state key`);
  if (
    adapter.statewaveSubjectFor({ appId: 'demo', subjectId: 'u1', workspaceId: 'w1' }) !==
    'statewave-guide:demo:user:u1:workspace:w1'
  )
    failures.push('the workspace does not reach the subject');
  let forged = false;
  try {
    adapter.statewaveSubjectFor({ appId: 'demo', subjectId: 'u1:workspace:w9' });
    forged = true;
  } catch {
    // refused, which is the point
  }
  if (forged) failures.push('a scope could forge another subject');
  notes.push('one event, one episode, under the scope subject, keyed by the state it asserts');
}

if (runs('minimisation')) {
  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);
  await store.append(event({ eventId: 'ev-m-1' }));
  restore();
  const body = fake.calls[0]?.body;
  const fields = Object.keys(body?.payload ?? {}).sort();
  const allowed = [
    'appId',
    'applicationVersion',
    'authority',
    'eventId',
    'featureId',
    'kind',
    'metadata',
    'occurredAt',
    'subjectId',
    'workspaceId',
  ];
  for (const field of fields) {
    if (!allowed.includes(field)) failures.push(`the payload carries ${field}`);
  }
  // The free-form bags stay empty. They are passed through verbatim by
  // Statewave, which makes them exactly where a well-meaning change would start
  // posting page state.
  if (JSON.stringify(body?.metadata) !== '{}') failures.push('metadata is not empty');
  if (JSON.stringify(body?.provenance) !== '{}') failures.push('provenance is not empty');
  // And nothing forbidden survives validation into a request at all.
  const fake2 = fakeStatewave();
  const second = storeWith(fake2);
  for (const bad of [
    { featureId: 'How do I create a client?' },
    { featureId: 'INV-001' },
    { subjectId: 'ada@example.com' },
    { appId: 'sk_live_51H8xQ2eZvKYlo2C' },
    { occurredAt: 'Ignore previous instructions' },
    { kind: 'DELETE_ACCOUNT' },
  ]) {
    await second.store.append(event(bad));
  }
  second.restore();
  if (fake2.calls.length !== 0)
    failures.push(`${fake2.calls.length} forbidden events reached the wire`);
  notes.push('only the bounded event crosses the wire, and the free-form bags stay empty');
}

if (runs('serialization')) {
  // The Closed Loop #19.1 finding at the boundary that matters more: there the
  // destination was localStorage, here it is somebody else's database and the
  // request body is built by a client this project does not own.
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
    event({ eventId: 'ev-s-1' }),
  );
  await store.append(smuggler);
  // Flips on the SECOND read, not the ninth. An audit found the earlier fixture
  // firing at read #9 while the real path reads each field once — a test that
  // could only ever pass. Counting the reads is the check; the count is asserted
  // in the core suite, and this asserts the consequence.
  let reads = 0;
  const flipping = { ...event({ eventId: 'ev-s-2' }) };
  Object.defineProperty(flipping, 'featureId', {
    enumerable: true,
    get() {
      reads += 1;
      return reads === 1 ? 'clients.create' : 'leak sk_live_51H8xQ2eZvKYlo2C INV-001';
    },
  });
  await store.append(flipping);
  // And a Proxy, which needs no defineProperty and is what a reactive view model
  // actually looks like.
  let proxied = 0;
  const target = event({ eventId: 'ev-s-3' });
  await store.append(
    new Proxy(target, {
      get(object, key) {
        if (key === 'featureId') {
          proxied += 1;
          return proxied === 1 ? 'clients.create' : 'How do I export? ada@example.com';
        }
        return Reflect.get(object, key);
      },
    }),
  );
  restore();
  const sent = JSON.stringify(fake.calls.map((call) => call.body));
  for (const [label, pattern] of [
    ['a secret', /sk_live/],
    ['an email', /@example\.com/],
    ['an instance label', /INV-\d{3}/],
    ['a raw question', /How do I/i],
  ]) {
    if (pattern.test(sent)) failures.push(`${label} reached the wire`);
  }
  if (!sent.includes('clients.create')) failures.push('the validated value did not reach the wire');
  notes.push('what was validated is what is sent — not the caller object, by value');
}

if (runs('endpoints')) {
  // What the adapter is allowed to call, and nothing else.
  //
  // An audit pointed out that no gate bounded the endpoint surface: the adapter
  // could start calling `/v1/context` or `/v1/memories/compile` — a ranked
  // assembly and an LLM compiler — and every other gate would still pass. Those
  // are a retrieval system, and this project has one knowledge base.
  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);
  await store.append(event({ eventId: 'ev-e-1' }));
  await store.read(SCOPE);
  await store.clear(SCOPE);
  restore();
  const allowed = [/\/v1\/episodes$/, /\/v1\/timeline\?/, /\/v1\/subjects\//];
  for (const call of fake.calls) {
    const path = call.url.replace('http://statewave.test', '');
    if (!allowed.some((pattern) => pattern.test(path)))
      failures.push(`the adapter called ${call.method} ${path}`);
  }
  for (const forbidden of ['/v1/context', '/v1/memories', '/v1/receipts', '/v1/handoff']) {
    if (fake.calls.some((call) => call.url.includes(forbidden)))
      failures.push(`the adapter called ${forbidden}`);
  }
  // And the source is checked in the same place: a read that stopped filtering
  // by source would accept another product's episodes.
  const source = readFileSync(path.join(ROOT, 'packages/statewave/src/store.ts'), 'utf8');
  for (const banned of ['searchMemories', 'getContext', 'compileMemories']) {
    if (source.includes(banned)) failures.push(`the adapter references ${banned}`);
  }
  notes.push('three endpoints, no retrieval, no compilation');
}

if (runs('isolation')) {
  // A positive control first. An audit pointed out that `read() { return [] }`
  // satisfied both this aspect and `authority`, so a store that had stopped
  // working entirely would have passed them.
  const working = fakeStatewave();
  const live = storeWith(working);
  await live.store.append(event({ eventId: 'ev-p-1' }));
  const mine = await live.store.read(SCOPE);
  live.restore();
  if (mine.length !== 1)
    failures.push('the positive control failed: a written event did not read back');

  const foreign = (subject) =>
    new Response(
      JSON.stringify({
        subject_id: subject,
        episodes: [
          {
            id: 'ep_x',
            subject_id: subject,
            source: adapter.GUIDE_EPISODE_SOURCE,
            type: adapter.GUIDE_EPISODE_TYPE,
            // Well-formed in every respect except whose it is.
            payload: { ...event({ eventId: 'ev-i-1', subjectId: 'u2' }) },
            metadata: {},
            provenance: {},
            created_at: '2026-08-29T10:00:00Z',
          },
          {
            id: 'ep_y',
            subject_id: subject,
            source: 'some-other-product',
            type: 'chat.message',
            payload: { ...event({ eventId: 'ev-i-2' }) },
            metadata: {},
            provenance: {},
            created_at: '2026-08-29T10:00:00Z',
          },
        ],
        memories: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  const fake = fakeStatewave({ onTimeline: foreign });
  const { store, restore } = storeWith(fake);
  const read = await store.read(SCOPE);
  restore();
  if (read.length !== 0) failures.push(`${read.length} foreign records were accepted`);
  notes.push('a record must belong to the scope it was found under, and to this product');
}

if (runs('fallback')) {
  for (const [label, options] of [
    ['a 500', { onTimeline: () => new Response('no', { status: 500 }) }],
    [
      'a malformed body',
      { onTimeline: () => new Response('{"episodes":"nope"}', { status: 200 }) },
    ],
    [
      'an auth failure',
      { onTimeline: () => new Response('{"detail":"unauthorized"}', { status: 401 }) },
    ],
  ]) {
    const fake = fakeStatewave(options);
    const { store, restore } = storeWith(fake);
    const read = await store.read(SCOPE);
    restore();
    if (read.length !== 0) failures.push(`${label} produced memory out of nothing`);
    if (store.diagnostics().mode !== 'REMOTE_DEGRADED')
      failures.push(`${label} was not reported as degraded`);
  }
  // A write that fails must not throw at the caller: guidance is already correct
  // and the interaction already happened.
  const fake = fakeStatewave({ onCreate: () => new Response('no', { status: 503 }) });
  const { store, restore } = storeWith(fake);
  let threw = false;
  try {
    await store.append(event());
  } catch {
    threw = true;
  }
  restore();
  if (threw) failures.push('a failed write threw at the caller');
  if (store.diagnostics().writeFailures !== 1) failures.push('a failed write was not counted');
  notes.push(
    'read failure is absence, write failure is silent, and both are reported to a developer',
  );
}

if (runs('idempotency')) {
  // With the SDK's retry ON. An audit pointed out that every gate here disabled
  // it — testing the dedup while switching off the thing the key exists to
  // defend against. This makes the transport fail once and lets the SDK retry.
  let firstAttempt = true;
  const retried = fakeStatewave({
    onCreate: () => {
      if (!firstAttempt) return undefined;
      firstAttempt = false;
      return new Response('upstream blip', { status: 503 });
    },
  });
  const retryClient = storeWith(retried, {
    retry: { maxRetries: 2, backoffBase: 1, jitter: false },
  });
  await retryClient.store.append(event({ eventId: 'ev-retry-1' }));
  const afterRetry = await retryClient.store.read(SCOPE);
  retryClient.restore();
  const posts = retried.calls.filter((call) => call.method === 'POST');
  if (posts.length < 2) failures.push('the SDK did not retry, so this proved nothing');
  if (new Set(posts.map((call) => call.body?.idempotency_key)).size !== 1)
    failures.push('a retry used a different idempotency key');
  if (afterRetry.length !== 1)
    failures.push(`a retried write became ${afterRetry.length} logical events`);

  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);
  const one = event({ eventId: 'ev-d-1' });
  await store.append(one);
  await store.append(one);
  await store.append({ ...one });
  const read = await store.read(SCOPE);
  restore();
  const stored = fake.episodes.get('statewave-guide:demo:user:u1') ?? [];
  if (stored.length !== 1) failures.push(`a retried event became ${stored.length} episodes`);
  if (read.length !== 1) failures.push(`a retried event became ${read.length} logical events`);
  notes.push('a retry is one episode and one completion, keyed by the event id');
}

if (runs('reset')) {
  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);
  await store.append(event({ eventId: 'ev-r-1' }));
  await store.append(event({ eventId: 'ev-r-2', subjectId: 'u2' }));
  await store.clear(SCOPE);
  const mine = await store.read(SCOPE);
  const theirs = await store.read({ appId: 'demo', subjectId: 'u2' });
  restore();
  if (mine.length !== 0) failures.push('reset left the subject remembered');
  if (theirs.length !== 1) failures.push('reset reached another subject');
  const deletes = fake.calls.filter((call) => call.method === 'DELETE');
  if (deletes.length !== 1) failures.push(`${deletes.length} delete calls`);
  // A delete that deleted nothing was indistinguishable from one that worked. It
  // still is at the API — Statewave answers 200 with `episodes_deleted: 0` — so
  // what this asserts is that the adapter *asked about the right subject*, which
  // is the part it controls.
  const deleted = deletes[0]?.url ?? '';
  if (!deleted.endsWith(encodeURIComponent('statewave-guide:demo:user:u1')))
    failures.push(`reset asked to delete ${deleted}`);
  if (!deletes[0]?.url.includes(encodeURIComponent('statewave-guide:demo:user:u1')))
    failures.push(`reset deleted ${deletes[0]?.url}`);
  notes.push(
    'reset deletes exactly the guide subject, which is why the subject is the guide scope',
  );
}

if (runs('bounded')) {
  // Closed Loop #20.1 shrank the write policy and said plainly that it had not
  // bounded the store: a repeated completion still wrote a durable episode
  // every time. This is that claim, closed.
  //
  // The mechanism is not Guide-side compaction — nothing here counts, dedupes
  // or forgets. The idempotency key names the state, and Statewave resolves a
  // collision by keeping the first write.
  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);
  for (let i = 0; i < 40; i += 1) {
    await store.append(
      event({
        eventId: `ev-b-${i}`,
        occurredAt: `2026-08-29T10:00:${String(i % 60).padStart(2, '0')}Z`,
      }),
    );
  }
  const afterRepeats = fake.episodes.get('statewave-guide:demo:user:u1')?.length ?? 0;
  if (afterRepeats !== 1)
    failures.push(`40 observations of one completion produced ${afterRepeats} durable episodes`);

  // A different build is a different fact — the version rule #19 froze. If the
  // key dropped the version, finishing a guide once would mark it finished for
  // every future build of steps that have since changed.
  await store.append(event({ eventId: 'ev-b-v2', applicationVersion: 'build-2' }));
  const afterVersion = fake.episodes.get('statewave-guide:demo:user:u1')?.length ?? 0;
  if (afterVersion !== 2)
    failures.push(`a second build did not create a second fact (${afterVersion} episodes)`);

  // And the failure this must never introduce: a preference is a value that
  // changes. Keyed at ingest it would collapse to whatever was chosen first,
  // and the person would be pinned to a setting they changed three times.
  const prefs = fakeStatewave();
  const pref = storeWith(prefs);
  for (const [i, value] of ['FULL', 'CONCISE', 'FULL', 'CONCISE'].entries()) {
    await pref.store.append(
      event({
        eventId: `ev-b-p${i}`,
        kind: 'EXPLICIT_PREFERENCE_SET',
        featureId: undefined,
        authority: 'EXPLICIT_USER_PREFERENCE',
        occurredAt: `2026-08-29T10:0${i}:00Z`,
        metadata: { preference: 'guidanceDetail', value },
      }),
    );
  }
  const stored = await pref.store.read(SCOPE);
  pref.restore();
  restore();
  if (stored.length !== 4)
    failures.push(`a changing preference collapsed to ${stored.length} records`);
  const profile = core.projectMemoryProfile({
    events: stored,
    subjectId: 'u1',
    appId: 'demo',
    applicationVersion: 'build-1',
  });
  if (profile.explicitPreferences.guidanceDetail !== 'CONCISE')
    failures.push(`the latest preference is ${profile.explicitPreferences.guidanceDetail}`);

  notes.push(
    '40 observations of one completion => 1 durable episode; a second build => a second fact',
  );
  notes.push('a preference that changes keeps every change, and resolves to the latest');
}

if (runs('retention')) {
  // The rule: no future presentation effect, no durable guide memory.
  //
  // What this gate is really watching is the direction of a future mistake.
  // Nobody deletes the policy; somebody adds a kind, or makes an existing one
  // matter, and the write path silently stops carrying the thing a later answer
  // now depends on — or starts carrying the thing it does not. So it checks the
  // adapter against the core table rather than against a list written here.
  const fake = fakeStatewave();
  const { store, restore } = storeWith(fake);

  for (const kind of core.GUIDE_MEMORY_EVENT_KINDS) {
    const isPreference = kind === 'EXPLICIT_PREFERENCE_SET';
    await store.append(
      event({
        eventId: `ev-ret-${kind}`,
        kind,
        ...(isPreference
          ? {
              featureId: undefined,
              authority: 'EXPLICIT_USER_PREFERENCE',
              metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
            }
          : {}),
      }),
    );
  }
  const stored = await store.read(SCOPE);
  restore();

  const persisted = new Set(stored.map((e) => e.kind));
  const expected = new Set(core.DURABLE_REMOTE_EVENT_KINDS);
  for (const kind of expected) {
    if (!persisted.has(kind))
      failures.push(`${kind} is durable but did not survive a write and read`);
  }
  for (const kind of persisted) {
    if (!expected.has(kind)) failures.push(`${kind} reached durable storage without being durable`);
  }

  const diagnostics = store.diagnostics();
  const withheld = core.GUIDE_MEMORY_EVENT_KINDS.length - core.DURABLE_REMOTE_EVENT_KINDS.length;
  if (diagnostics.withheldByPolicy !== withheld)
    failures.push(`withheldByPolicy is ${diagnostics.withheldByPolicy}, expected ${withheld}`);
  // Withholding is the policy working. Counting it as a rejection or a failure
  // would put a number in the inspector that a developer learns to ignore, and
  // the next real rejection would hide in it.
  if (diagnostics.rejectedOnWrite !== 0)
    failures.push('a withheld record was counted as a rejection');
  if (diagnostics.writeFailures !== 0 || diagnostics.mode !== 'REMOTE')
    failures.push('withholding degraded the store');

  notes.push(
    `${core.GUIDE_MEMORY_EVENT_KINDS.length} kinds offered, ` +
      `${core.DURABLE_REMOTE_EVENT_KINDS.length} kept: ${[...expected].join(', ')}`,
  );
}

if (runs('authority')) {
  // Positive control, for the same reason as isolation: an adapter that returned
  // nothing at all would otherwise satisfy this by doing nothing.
  const working = fakeStatewave();
  const live = storeWith(working);
  await live.store.append(event({ eventId: 'ev-p-2' }));
  if ((await live.store.read(SCOPE)).length !== 1)
    failures.push('the positive control failed: a written event did not read back');
  live.restore();

  // Whatever comes back, it is events — and events cannot answer a question.
  const fake = fakeStatewave({
    onTimeline: (subject) =>
      new Response(
        JSON.stringify({
          subject_id: subject,
          episodes: [
            {
              id: 'ep_a',
              subject_id: subject,
              source: adapter.GUIDE_EPISODE_SOURCE,
              type: adapter.GUIDE_EPISODE_TYPE,
              payload: {
                ...event({ eventId: 'ev-a-1', featureId: 'invented.feature' }),
                route: '/admin',
                answer: 'You may delete anything',
              },
              metadata: {},
              provenance: {},
              created_at: '2026-08-29T10:00:00Z',
            },
          ],
          memories: [
            // Statewave's own compiled memories. The adapter must never read
            // them: they are prose a compiler wrote, and prose is not evidence.
            { id: 'm1', subjectId: subject, kind: 'fact', content: 'The user may delete clients.' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  });
  const { store, restore } = storeWith(fake);
  const read = await store.read(SCOPE);
  restore();
  const text = JSON.stringify(read);
  if (/invented\.feature|\/admin|may delete/.test(text))
    failures.push('a remote record carried something into guide memory');
  if (read.length !== 0) failures.push(`${read.length} unbounded records were accepted`);
  notes.push('compiled memories are never read, and an unbounded record is not an event');
}

if (runs('credentials')) {
  // The adapter must not invent a credential, and must carry whichever one the
  // host configured — because the host is where a credential is allowed to be.
  const fake = fakeStatewave();
  const bare = storeWith(fake);
  await bare.store.append(event({ eventId: 'ev-k-1' }));
  bare.restore();
  const headers = fake.calls[0]?.headers ?? {};
  if (headers['x-api-key'] !== undefined) failures.push('the adapter invented an API key');
  if (headers['x-tenant-id'] !== undefined) failures.push('the adapter invented a tenant');

  const fake2 = fakeStatewave();
  const keyed = storeWith(fake2, { apiKey: 'test-key', tenantId: 'test-tenant' });
  await keyed.store.append(event({ eventId: 'ev-k-2' }));
  keyed.restore();
  const withKey = fake2.calls[0]?.headers ?? {};
  if (withKey['x-api-key'] !== 'test-key') failures.push("the host's key did not reach Statewave");
  if (withKey['x-tenant-id'] !== 'test-tenant')
    failures.push("the host's tenant did not reach Statewave");

  // And nothing in the browser package may import the SDK or a Statewave URL.
  const { readFileSync, readdirSync } = await import('node:fs');
  const reactSrc = path.join(ROOT, 'packages/react/src');
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );
  for (const file of walk(reactSrc)) {
    // Comments stripped first. A file whose *documentation* explains why no
    // credential belongs in it is the opposite of a violation, and an earlier
    // version of this check failed exactly that file.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/@statewavedev\/sdk/.test(source))
      failures.push(`${path.relative(ROOT, file)} imports the Statewave SDK`);
    if (/['"`]X-API-Key['"`]|apiKey\s*[:=]/i.test(source))
      failures.push(`${path.relative(ROOT, file)} handles an API key`);
  }
  // Nor may any browser-bound package depend on the SDK or the adapter.
  //
  // The earlier version checked one package.json with a substring test that
  // could not match the thing it was excluding — `@statewavedev/guide-statewave`
  // does not contain "statewave-" as written, and core was the only manifest
  // read. An audit pointed both out.
  const forbidden = ['@statewavedev/sdk', '@statewavedev/guide-statewave'];
  for (const name of ['core', 'react', 'shared', 'actions', 'runtime', 'semantic']) {
    const manifest = JSON.parse(
      readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8'),
    );
    for (const section of ['dependencies', 'peerDependencies']) {
      for (const dependency of Object.keys(manifest[section] ?? {})) {
        if (forbidden.includes(dependency))
          failures.push(`packages/${name} depends on ${dependency}`);
      }
    }
  }
  // And the adapter is the one place that may.
  const adapterManifest = JSON.parse(
    readFileSync(path.join(ROOT, 'packages/statewave/package.json'), 'utf8'),
  );
  if (adapterManifest.dependencies?.['@statewavedev/sdk'] === undefined)
    failures.push('the adapter package does not depend on the SDK, so this check proves nothing');
  notes.push('the credential lives where the host put it, and never in a browser package');
}

const say = (line = '') => console.log(line);
say(`\nStatewave adapter — ${ASPECT}\n`);
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — the adapter got further than persisting.\n');
  process.exit(1);
}
say('\nPASS — experience persisted, authority unchanged.\n');
