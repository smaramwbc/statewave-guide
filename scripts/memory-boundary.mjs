/**
 * The line memory is not allowed to cross.
 *
 * Closed Loop #19's whole claim reduces to one sentence — *memory remembers
 * experience, not truth* — and a sentence is not a guarantee. These are the
 * checks that make it one.
 *
 * The interesting ones are not the attacks. A hostile record is easy to refuse.
 * What these gates watch for are the reasonable-sounding inferences: somebody
 * used invoices yesterday so these rows are invoices; somebody had permission
 * last week so show them the button; somebody pressed a control three times so
 * they *prefer* it. Each is a small, plausible step from a record of behaviour
 * to a claim about a product, and each is wrong in the same way.
 *
 * Aspects, run individually by the gate manifest:
 *
 *   authority     no adaptation touches a fact, an action or a step
 *   minimisation  nothing but identifiers and counters is ever written
 *   isolation     one subject's history stays out of another's
 *   workspace     and one tenant's stays out of another's
 *   version       a completion belongs to the build it happened on
 *   determinism   the same inputs produce the same plan, with no clock
 *   fallback      a store that cannot answer costs personalisation only
 *   productmodel  nothing memory does moves a claim
 *   instances     a within-snapshot handle never becomes durable identity
 *   secrets       no secret shape survives into anything persisted
 *   permission    what a user may do is a fact about now
 *   rv04          the invoice refusal survives every plausible memory
 *   reset         forgetting is real
 *   delta         an adaptation is only APPLIED when a person could see it
 *   noop          a proposal the presentation already satisfies changes nothing
 *   copy-restraint the guide adapts without narrating that it is adapting
 *   recoverability folding steps never loses one
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

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);
const bundle = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8'),
);
const engine = core.createGuideQueryEngine({ bundle });
const VERSION = bundle.applicationVersion;

let counter = 0;
const event = (overrides = {}) => {
  counter += 1;
  return {
    eventId: `e${counter}`,
    appId: 'demo',
    subjectId: 'u1',
    featureId: 'clients.create',
    kind: 'GUIDANCE_VIEWED',
    occurredAt: '2026-08-29T10:00:00Z',
    applicationVersion: VERSION,
    authority: 'OBSERVED_INTERACTION',
    ...overrides,
  };
};
const profileOf = (events, overrides = {}) =>
  core.projectMemoryProfile({
    events,
    subjectId: 'u1',
    appId: 'demo',
    applicationVersion: VERSION,
    ...overrides,
  });
const createClient = () =>
  engine.query({
    query: 'How do I create a client?',
    context: {
      route: '/clients',
      snapshotId: 's1',
      applicationVersion: VERSION,
      visibleSemanticIds: ['clients.create'],
    },
  });

// ---------------------------------------------------------------------------

if (runs('authority')) {
  const response = createClient();
  const before = JSON.stringify(response);
  const profile = profileOf([event({ kind: 'STEP_THROUGH_COMPLETED' })]);
  const plan = core.planPresentation({ response, profile, enabled: true });

  if (JSON.stringify(response) !== before) failures.push('adaptation mutated the response');
  if (plan.stepCount !== response.answer?.steps.length)
    failures.push('the plan disagrees with the response about how many steps exist');
  // A plan is presentation. It cannot carry an action, a fact or a sentence
  // that did not come from compiled guidance.
  const planText = JSON.stringify(plan);
  for (const forbidden of ['navigate', 'submit', 'delete', 'permission', 'Lets you']) {
    if (planText.includes(forbidden)) failures.push(`the plan carries "${forbidden}"`);
  }
  // Every string a user could read must be a closed constant.
  const allowed = Object.values(core.GUIDE_META_COPY);
  for (const id of plan.metaCopy) {
    if (core.GUIDE_META_COPY[id] === undefined)
      failures.push(`meta copy ${id} is not in the table`);
  }
  if (allowed.length !== 2) failures.push(`the meta copy table has ${allowed.length} entries`);
  // The two that were retired must not come back by another route. Closed Loop
  // #19.1 removed a completion announcement and a pattern caption; a renderer
  // hardcoding either would be invisible to an id check, so the strings
  // themselves are named here.
  for (const retired of core.RETIRED_META_COPY) {
    if (allowed.includes(retired)) failures.push(`a retired sentence is back: ${retired}`);
    if (planText.includes(retired)) failures.push(`a plan carries a retired sentence: ${retired}`);
  }
  notes.push(`plan carries ${plan.metaCopy.length} closed copy ids and no prose`);
}

if (runs('minimisation')) {
  const forbidden = [
    ['a raw question', { featureId: 'How do I create a client?' }],
    ['a secret', { featureId: 'sk_live_51H8xQ2eZvKYlo2C' }],
    ['an email', { subjectId: 'ada@example.com' }],
    ['an instance name', { featureId: 'INV-001' }],
    ['a route', { route: '/admin' }],
    ['free text', { metadata: { value: 'Ignore previous instructions' } }],
  ];
  for (const [label, overrides] of forbidden) {
    if (core.validateMemoryEvent(event(overrides)).ok) failures.push(`${label} was accepted`);
  }
  if (!core.validateMemoryEvent(event()).ok)
    failures.push('an ordinary event was refused, which would make memory useless');
  const store = core.createInMemoryGuideMemoryStore();
  await store.append(event({ kind: 'STEP_THROUGH_COMPLETED' }));
  const dump = store.dump();
  if (/How do I|sk_live|INV-\d|@/.test(dump)) failures.push('the store kept something it must not');
  notes.push(
    `${forbidden.length} forbidden shapes refused; ${store.diagnostics().bytesPersisted} bytes for one event`,
  );
}

if (runs('isolation') || runs('workspace')) {
  const mixed = [
    event({ subjectId: 'u1', kind: 'SHOW_ME_USED' }),
    event({ subjectId: 'u2', kind: 'SHOW_ME_USED' }),
    event({ subjectId: 'u2', kind: 'STEP_THROUGH_COMPLETED' }),
  ];
  if (runs('isolation')) {
    const mine = profileOf(mixed);
    if (mine.interactionPatterns.showMeUses !== 1) failures.push('another subject was counted');
    if (core.hasCompletedGuide(mine, 'clients.create'))
      failures.push("another subject's completion was borrowed");
    if (
      core.scopeKey({ appId: 'a', subjectId: 'u1' }) ===
      core.scopeKey({ appId: 'a', subjectId: 'u2' })
    )
      failures.push('two subjects share a storage key');
    // Applications too. Every event in this file used one appId, so nothing
    // tested that one application's history stays out of another's.
    const acrossApps = [
      event({ appId: 'demo', kind: 'SHOW_ME_USED' }),
      event({ appId: 'other', kind: 'SHOW_ME_USED' }),
      event({ appId: 'other', kind: 'STEP_THROUGH_COMPLETED' }),
    ];
    const here = profileOf(acrossApps);
    if (here.interactionPatterns.showMeUses !== 1) failures.push('another application was counted');
    if (core.hasCompletedGuide(here, 'clients.create'))
      failures.push("another application's completion was borrowed");
    let forged = false;
    try {
      core.scopeKey({ appId: 'demo', subjectId: 'u1:workspace:w1' });
      forged = true;
    } catch {
      forged = false;
    }
    if (forged) failures.push('a colon in a subject id forges another scope key');
    notes.push('subject, workspace and application scoping hold, and keys cannot be forged');
  }
  if (runs('workspace')) {
    const tenants = [
      event({ workspaceId: 'w1', kind: 'SHOW_ME_USED' }),
      event({ workspaceId: 'w2', kind: 'SHOW_ME_USED' }),
    ];
    if (profileOf(tenants, { workspaceId: 'w1' }).interactionPatterns.showMeUses !== 1)
      failures.push('another workspace was counted');
    // The subtle one: a profile asked for without a workspace is not "all of
    // them". Treating it that way is how one tenant reaches another.
    if (profileOf(tenants).interactionPatterns.totalEvents !== 0)
      failures.push('workspace-scoped history folded into an unscoped profile');
    notes.push('workspace scoping holds in both directions');
  }
}

if (runs('version')) {
  const old = profileOf([
    event({ kind: 'STEP_THROUGH_COMPLETED', applicationVersion: 'older-build-0000' }),
  ]);
  if (core.hasCompletedGuide(old, 'clients.create'))
    failures.push('a completion from another build was reused');
  const preference = profileOf([
    event({
      kind: 'EXPLICIT_PREFERENCE_SET',
      applicationVersion: 'older-build-0000',
      authority: 'EXPLICIT_USER_PREFERENCE',
      metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
    }),
  ]);
  if (preference.explicitPreferences.guidanceDetail !== 'CONCISE')
    failures.push('an explicit preference was discarded by a version change');
  notes.push('feature history is version-scoped; explicit preferences are not');
}

if (runs('determinism')) {
  const profile = profileOf([event({ kind: 'STEP_THROUGH_COMPLETED' })]);
  const runsOfPlan = Array.from({ length: 5 }, () =>
    JSON.stringify(core.planPresentation({ response: createClient(), profile, enabled: true })),
  );
  if (new Set(runsOfPlan).size !== 1) failures.push('the same inputs produced different plans');
  const early = profileOf([
    event({ kind: 'STEP_THROUGH_COMPLETED', occurredAt: '2000-01-01T00:00:00Z' }),
  ]);
  const late = profileOf([
    event({ kind: 'STEP_THROUGH_COMPLETED', occurredAt: '2099-01-01T00:00:00Z' }),
  ]);
  // A profile carries no timestamp, so comparing two of them proved nothing —
  // an audit showed the objects byte-identical before the planner saw them. The
  // real checks are that the profile drops the time, and that nothing the
  // planner imports reaches a clock.
  if (JSON.stringify(early) !== JSON.stringify(late))
    failures.push('a profile carries when an event happened, so adaptation could read it');
  for (const file of [
    'packages/core/src/memory/planner.ts',
    'packages/core/src/memory/profile.ts',
  ]) {
    const source = readFileSync(path.join(ROOT, file), 'utf8')
      .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '')
      .replace(new RegExp('//[^\\n]*', 'g'), '');
    for (const forbidden of ['Date.now', 'new Date', 'Math.random', 'performance.now']) {
      if (source.includes(forbidden)) failures.push(`${file} reaches for ${forbidden}`);
    }
  }
  // And the source itself must not reach for a clock.
  const plannerSource = readFileSync(path.join(ROOT, 'packages/core/src/memory/planner.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  for (const forbidden of ['Date.now', 'new Date', 'Math.random']) {
    if (plannerSource.includes(forbidden)) failures.push(`the planner calls ${forbidden}`);
  }
  notes.push('five identical plans, and no clock or randomness in the planner');
}

if (runs('fallback')) {
  for (const mode of ['throw', 'malformed', 'unknown-kind']) {
    const store = core.createFailingGuideMemoryStore(mode);
    let events = [];
    try {
      events = await store.read({ appId: 'demo', subjectId: 'u1' });
    } catch {
      events = [];
    }
    // Not filtered. An audit pointed out that filtering here tested a defence
    // the production path does not apply: the hook reads a store and projects
    // straight from what it returns. Whatever a broken store hands back has to
    // survive being projected and planned, or the fallback claim is about this
    // gate rather than about the product.
    const plan = core.planPresentation({
      response: createClient(),
      profile: profileOf(events),
      enabled: true,
    });
    if (!plan.neutral) failures.push(`a ${mode} store still adapted the presentation`);
    const neutral = core.neutralPresentationPlan(createClient());
    if (JSON.stringify(plan) !== JSON.stringify(neutral))
      failures.push(`a ${mode} store did not fall back to the memory-off shape`);
  }
  notes.push('three failure modes, each falling back to exactly the memory-off plan');
}

if (runs('productmodel')) {
  const { enrich, loadEverything } = await import('./lib/runtime-integration.mjs');
  const { enriched } = enrich(await loadEverything(ROOT));
  if (enriched.claims.length !== 113) failures.push(`ProductClaims is ${enriched.claims.length}`);
  const memoryClaims = enriched.claims.filter((claim) =>
    JSON.stringify(claim.evidence ?? [])
      .toLowerCase()
      .includes('memory'),
  );
  if (memoryClaims.length > 0) failures.push(`${memoryClaims.length} claims cite memory`);
  // And no memory word reached the compiled bundle.
  const bundleSource = readFileSync(
    path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'),
    'utf8',
  );
  for (const word of ['STEP_THROUGH_COMPLETED', 'subjectId', 'GuideMemory']) {
    if (bundleSource.includes(word)) failures.push(`the bundle mentions ${word}`);
  }
  notes.push(`ProductClaims ${enriched.claims.length}, none resting on anything remembered`);
}

if (runs('instances')) {
  // Uppercase and underscores fail the semantic-id charset long before the
  // instance rule is consulted, so probing only `INV-001` in `featureId` proved
  // nothing about it: an audit emptied INSTANCE_SHAPED entirely and this aspect
  // stayed green. The probes below are legal under every *other* rule, so the
  // instance rule is the only thing that can refuse them.
  for (const label of ['inv-001', 'acme-1234', 'row-12', 'item-007']) {
    if (core.validateMemoryEvent(event({ featureId: label })).ok)
      failures.push(`${label} was accepted as a feature id`);
  }
  // Opaque-id fields take a wider charset, so the rule has to hold there too.
  for (const field of ['appId', 'subjectId', 'workspaceId']) {
    if (core.validateMemoryEvent(event({ [field]: 'inv-001' })).ok)
      failures.push(`an instance label was accepted as ${field}`);
  }
  // And there is no exemption any more. Closed Loop #19.1 carved one out for
  // `eventId` because the generated ids collided with this shape; #20 removed it
  // after an audit pointed out it let a caller park `INV-001` in an event id.
  // What makes that safe is the generator, so the generator is what is asserted.
  if (core.validateMemoryEvent(event({ eventId: 'evab12341' })).ok)
    failures.push('an instance-shaped event id was accepted');
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const session = Math.random().toString(36).slice(2, 8);
    for (const eventId of [`ev-${session}-1`, `pf-${session}-42`]) {
      if (!core.validateMemoryEvent(event({ eventId })).ok)
        failures.push(`the hook's own id shape was refused: ${eventId}`);
    }
  }
  for (const label of ['INV-001', 'INV_002', 'ACME-1234']) {
    if (core.validateMemoryEvent(event({ featureId: label })).ok)
      failures.push(`${label} was accepted as a feature id`);
  }
  // The positive: an ordinary semantic id still works, or the rule is useless.
  if (!core.validateMemoryEvent(event({ featureId: 'invoices.list.open' })).ok)
    failures.push('a real semantic id was refused');
  notes.push('instance-shaped labels refused in every field that could hold one');

  // What is validated must be what is written. Returning the caller's object let
  // an inherited toJSON put a question, an email, a label and a secret into a
  // store that had just reported zero rejections.
  const valid = event({ featureId: 'clients.create' });
  const smuggler = Object.assign(
    Object.create({
      toJSON: () => ({ note: 'ada@example.com asked this', instance: 'INV-001', key: 'sk_live_x' }),
    }),
    valid,
  );
  const checked = core.validateMemoryEvent(smuggler);
  if (checked.event === smuggler) failures.push('the validator handed back the caller object');
  if (checked.ok && /sk_live|@|INV-\d/.test(JSON.stringify(checked.event)))
    failures.push('a prototype toJSON decided what would be written');
  let reads = 0;
  const flipping = { ...valid };
  Object.defineProperty(flipping, 'featureId', {
    enumerable: true,
    get() {
      reads += 1;
      return reads <= 6 ? 'clients.create' : 'sk_live_leak INV-001';
    },
  });
  const flipped = core.validateMemoryEvent(flipping);
  if (flipped.ok && flipped.event.featureId !== 'clients.create')
    failures.push('a field changed between being checked and being written');
  notes.push('what was validated is what is written, by value and not by reference');
}

if (runs('secrets')) {
  const shapes = [
    'sk_live_51H8xQ2eZvKYlo2C',
    'ghp_aBcDeFgHiJkLmNoPqRsTuV',
    'eyJhbGciOiJIUzI1NiJ9.payload',
    'ada@example.com',
  ];
  // Tried in `appId`, not only `featureId`.
  //
  // An audit pointed out that every one of these fails the semantic-id charset
  // before the secret rules are consulted, so probing `featureId` proved nothing
  // about those rules — the aspect still passed with SECRET_SHAPED emptied.
  // `appId` accepts an opaque id, so a secret there is refused by the secret
  // rule or not at all.
  for (const shape of [...shapes, 'AKIAIOSFODNN7EXAMPLE', 'AIzaSyC1234567890abcdefghijklmnop']) {
    if (core.validateMemoryEvent(event({ appId: shape })).ok)
      failures.push(`${shape.slice(0, 8)}… was accepted in appId`);
    if (core.validateMemoryEvent(event({ featureId: shape })).ok)
      failures.push(`${shape.slice(0, 8)}… was accepted in featureId`);
  }
  const store = core.createInMemoryGuideMemoryStore();
  for (const shape of shapes) await store.append(event({ featureId: shape }));
  if (store.dump() !== '[]') failures.push('a secret-shaped event reached the store');
  // The build identity is a long hex string and must still be storable.
  if (!core.validateMemoryEvent(event()).ok)
    failures.push('the application version was mistaken for a secret');
  notes.push(`${shapes.length} secret shapes refused; a 64-character build identity accepted`);
}

if (runs('permission')) {
  const context = {
    route: '/clients/c1',
    snapshotId: 's1',
    applicationVersion: VERSION,
    visibleSemanticIds: ['client-detail.rename'],
  };
  const question = "Why can't I see Delete?";
  const plain = engine.query({ query: question, context });
  const remembered = profileOf([
    event({ featureId: 'client-detail.delete', kind: 'STEP_THROUGH_COMPLETED' }),
    event({ featureId: 'client-detail.delete', kind: 'SHOW_ME_USED' }),
  ]);
  const plan = core.planPresentation({ response: plain, profile: remembered, enabled: true });
  if (plan.emphasisedAction !== undefined && plain.actions.length === 0)
    failures.push('memory emphasised an action the response does not have');
  const again = engine.query({ query: question, context });
  if (JSON.stringify(plain) !== JSON.stringify(again))
    failures.push('the permission answer is not stable');
  notes.push('a remembered permission changes neither the answer nor the actions');
}

if (runs('rv04')) {
  const clientDetail = {
    route: '/clients/c1',
    snapshotId: 's1',
    applicationVersion: VERSION,
    visibleSemanticIds: ['client-detail.rename', 'invoices.list.open'],
    runtimeInstances: [
      {
        semanticId: 'invoices.list.open',
        ref: 'i1',
        containerSemanticId: 'invoices.list.open',
        route: '/clients/c1',
        runtimeAccessibleName: 'INV-001',
      },
    ],
  };
  const response = engine.query({ query: 'How do I open an invoice?', context: clientDetail });
  if (response.answer?.purpose !== undefined) failures.push('the invoice refusal was answered');
  if ((response.runtimeChoices ?? []).length > 0) failures.push('instances were offered');

  // Every invoice memory a user could plausibly have.
  const history = [
    event({ featureId: 'invoices.create-form.submit', kind: 'STEP_THROUGH_COMPLETED' }),
    event({ featureId: 'invoices.create-form.submit', kind: 'GUIDANCE_VIEWED' }),
    event({ featureId: 'invoices.list.open', kind: 'SHOW_ME_USED' }),
    event({ featureId: 'invoices.list.open', kind: 'SHOW_ME_USED' }),
    event({ featureId: 'invoices.list.open', kind: 'SHOW_ME_USED' }),
    event({ featureId: 'invoices.list.clear', kind: 'GUIDANCE_VIEWED' }),
  ];
  // Tried against profiles that demonstrably adapt something else.
  //
  // A refusal has no steps and no actions, so any profile at all produced a
  // neutral plan — an audit showed the assertion passing for every shape it
  // tried, including nonsense. What makes it mean something is the second half:
  // the same profile must genuinely adapt a real response, or this proves only
  // that the profiles were empty.
  const shapes = [
    profileOf([...history, event({ kind: 'STEP_THROUGH_COMPLETED' })]),
    profileOf([
      ...history,
      event({
        kind: 'EXPLICIT_PREFERENCE_SET',
        authority: 'EXPLICIT_USER_PREFERENCE',
        metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
      }),
    ]),
  ];
  for (const [index, profile] of shapes.entries()) {
    const plan = core.planPresentation({ response, profile, enabled: true });
    if (!plan.neutral) failures.push(`memory adapted a refusal (profile ${index})`);
    if (plan.metaCopy.length > 0) failures.push(`memory spoke on a refusal (profile ${index})`);
    if (/invoice/i.test(JSON.stringify(plan)))
      failures.push(`the plan mentions the concept (profile ${index})`);
    if (core.planPresentation({ response: createClient(), profile, enabled: true }).neutral)
      failures.push(`profile ${index} adapts nothing at all, so this test is vacuous`);
  }
  notes.push('six invoice memories, and the client screen still has nothing verified to say');
}

if (runs('reset')) {
  const store = core.createInMemoryGuideMemoryStore();
  const scope = { appId: 'demo', subjectId: 'u1' };
  await store.append(event({ kind: 'STEP_THROUGH_COMPLETED' }));
  if ((await store.read(scope)).length !== 1) failures.push('nothing was stored to reset');
  await store.clear(scope);
  if ((await store.read(scope)).length !== 0) failures.push('reset left events behind');
  const after = profileOf(await store.read(scope));
  if (core.hasCompletedGuide(after, 'clients.create'))
    failures.push('a cleared subject is still remembered');
  const plan = core.planPresentation({ response: createClient(), profile: after, enabled: true });
  if (!plan.neutral) failures.push('a cleared subject still gets an adapted presentation');
  notes.push('after a reset the next question is a first question');
}

// ---------------------------------------------------------------------------
// An adaptation that changes nothing is not an adaptation
// ---------------------------------------------------------------------------

/** Three Show me presses: enough for a pattern, and a pattern that changes nothing. */
const showMePattern = () =>
  profileOf([
    event({ kind: 'SHOW_ME_USED' }),
    event({ kind: 'SHOW_ME_USED' }),
    event({ kind: 'SHOW_ME_USED' }),
  ]);
const completed = () => profileOf([event({ kind: 'STEP_THROUGH_COMPLETED' })]);

if (runs('delta')) {
  // Every adaptation the planner can reach, accounted for against what a person
  // would have seen with no memory at all. The claim is not that memory does
  // little; it is that what it reports doing is what a screenshot would show.
  //
  // Printed as a table on purpose. Closed Loop #19.1 was asked for an accounting
  // of every adaptation candidate, and an accounting that lives in a report can
  // drift from the code the moment either changes.
  const response = createClient();
  const neutral = core.resolvePresentation(response, core.neutralPresentationPlan(response));
  const cases = [
    ['A completed guide', completed(), 'STEP_THROUGH_COMPLETED', 'fold the steps'],
    ['B repeated Show me', showMePattern(), 'three SHOW_ME_USED', 'make Show me primary'],
    [
      'C explicit FULL',
      profileOf([
        event({
          kind: 'EXPLICIT_PREFERENCE_SET',
          authority: 'EXPLICIT_USER_PREFERENCE',
          metadata: { preference: 'guidanceDetail', value: 'FULL' },
        }),
        event({ kind: 'STEP_THROUGH_COMPLETED' }),
      ]),
      'EXPLICIT_PREFERENCE_SET + completion',
      'fold the steps',
    ],
    // The branches that were missing, and the only ones in the system where
    // memory produces a visible change of emphasis: promoting Step through
    // demotes Show me. An audit found this accounting claiming to cover "every
    // adaptation the planner can reach" while omitting them.
    [
      'D explicit Step through',
      profileOf([
        event({
          kind: 'EXPLICIT_PREFERENCE_SET',
          authority: 'EXPLICIT_USER_PREFERENCE',
          metadata: { preference: 'assistanceMode', value: 'STEP_THROUGH' },
        }),
      ]),
      'EXPLICIT_PREFERENCE_SET mode',
      'make Step through primary',
    ],
    [
      'E derived Step through',
      profileOf([
        event({ kind: 'STEP_THROUGH_STARTED' }),
        event({ kind: 'STEP_THROUGH_STARTED' }),
        event({ kind: 'STEP_THROUGH_STARTED' }),
      ]),
      'three STEP_THROUGH_STARTED',
      'make Step through primary',
    ],
    [
      'F explicit Show me',
      profileOf([
        event({
          kind: 'EXPLICIT_PREFERENCE_SET',
          authority: 'EXPLICIT_USER_PREFERENCE',
          metadata: { preference: 'assistanceMode', value: 'SHOW_ME' },
        }),
      ]),
      'EXPLICIT_PREFERENCE_SET mode',
      'make Show me primary',
    ],
    [
      'G concise preference',
      profileOf([
        event({
          kind: 'EXPLICIT_PREFERENCE_SET',
          authority: 'EXPLICIT_USER_PREFERENCE',
          metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
        }),
      ]),
      'EXPLICIT_PREFERENCE_SET concise',
      'fold the steps',
    ],
    ['H after a reset', profileOf([]), 'nothing remembered', 'nothing'],
    [
      'I viewed once',
      profileOf([event({ kind: 'GUIDANCE_VIEWED' })]),
      'GUIDANCE_VIEWED',
      'nothing',
    ],
  ];
  const table = [];
  for (const [label, profile, source, requested] of cases) {
    const plan = core.planPresentation({ response, profile, enabled: true });
    const resolved = core.resolvePresentation(response, plan);
    const identical = JSON.stringify(resolved) === JSON.stringify(neutral);
    if (plan.adaptations.length === 0) {
      table.push([label, source, '—', requested, 'unchanged', 'unchanged', 'no', 'NONE']);
    }
    for (const record of plan.adaptations) {
      table.push([
        label,
        source,
        record.authority ?? '—',
        requested,
        record.base,
        record.result,
        record.base === record.result ? 'no' : 'yes',
        record.outcome,
      ]);
    }
    for (const record of plan.adaptations) {
      if (record.outcome === 'APPLIED' && record.base === record.result) {
        failures.push(`${label}: ${record.dimension} is APPLIED with an unchanged value`);
      }
      if (record.outcome === 'ALREADY_SATISFIED' && record.base !== record.result) {
        failures.push(`${label}: ${record.dimension} is ALREADY_SATISFIED with a changed value`);
      }
      if (!['APPLIED', 'ALREADY_SATISFIED', 'REFUSED'].includes(record.outcome)) {
        failures.push(`${label}: ${record.outcome} is not a closed outcome`);
      }
    }
    if (identical && core.hasVisibleAdaptation(plan.adaptations)) {
      failures.push(`${label}: reported an adaptation over an identical presentation`);
    }
    // The other direction, which the first version did not check: a plan that
    // moves the presentation and reports nothing is under-claiming, and that is
    // how an unaccounted-for change ships.
    if (!identical && !core.hasVisibleAdaptation(plan.adaptations)) {
      failures.push(`${label}: changed the presentation and reported no adaptation`);
    }
    // And every dimension that actually moved must have a record of its own. A
    // sentence or a fold with no accounting row is a change nobody is
    // answerable for.
    const dimensions = new Set(plan.adaptations.map((record) => record.dimension));
    if (resolved.stepsVisible !== neutral.stepsVisible && !dimensions.has('STEPS_COLLAPSED'))
      failures.push(`${label}: the steps moved with no STEPS_COLLAPSED record`);
    if (resolved.primaryAction !== neutral.primaryAction && !dimensions.has('ASSISTANCE_EMPHASIS'))
      failures.push(`${label}: the primary action moved with no ASSISTANCE_EMPHASIS record`);
    if (
      JSON.stringify(resolved.notes) !== JSON.stringify(neutral.notes) &&
      !dimensions.has('META_COPY')
    )
      failures.push(`${label}: a note appeared with no META_COPY record`);
  }

  // Memory off and memory broken, which are the same presentation by design.
  const off = core.resolvePresentation(response, core.neutralPresentationPlan(response));
  if (JSON.stringify(off) !== JSON.stringify(neutral))
    failures.push('the memory-off presentation is not the base presentation');
  table.push([
    'J memory off or failed',
    'no store, or a store that throws',
    '—',
    'nothing',
    'unchanged',
    'unchanged',
    'no',
    'NONE',
  ]);

  const widths = table[0].map((_, column) =>
    Math.max(...table.map((row) => String(row[column]).length)),
  );
  notes.push('adaptation accounting, featureId clients.create:');
  for (const row of table) {
    notes.push(`  ${row.map((cell, column) => String(cell).padEnd(widths[column])).join('  ')}`);
  }
}

if (runs('noop')) {
  // The specific case an independent review named: a Show me preference that
  // the panel was already satisfying. It must be honoured and reported as
  // changing nothing, and no styling may exist whose only job is to make it look
  // like it did.
  const response = createClient();
  const plan = core.planPresentation({ response, profile: showMePattern(), enabled: true });
  if (plan.emphasisedAction !== 'SHOW_ME')
    failures.push('the derived pattern stopped reaching the plan at all');
  const emphasis = plan.adaptations.find((r) => r.dimension === 'ASSISTANCE_EMPHASIS');
  if (emphasis === undefined) failures.push('the emphasis was not accounted for');
  else if (emphasis.outcome !== 'ALREADY_SATISFIED')
    failures.push(`a Show me emphasis over a Show me default reported ${emphasis.outcome}`);
  const resolved = core.resolvePresentation(response, plan);
  const neutral = core.resolvePresentation(response, core.neutralPresentationPlan(response));
  if (JSON.stringify(resolved) !== JSON.stringify(neutral))
    failures.push('the no-op case is not actually a no-op');
  // No rule may exist that turns the provenance marker into an effect.
  const styles = readFileSync(path.join(ROOT, 'packages/react/src/theme/styles.ts'), 'utf8');
  if (/\[data-emphasis[^\]]*\]\s*\{/.test(styles))
    failures.push('data-emphasis has a style rule, which manufactures the delta it reports');
  notes.push('a proposal the presentation already satisfies is ALREADY_SATISFIED and unstyled');
}

if (runs('copy-restraint')) {
  // The guide adapts without announcing that it is adapting.
  const response = createClient();
  const panel = readFileSync(
    path.join(ROOT, 'packages/react/src/panel/StatewaveGuide.tsx'),
    'utf8',
  );
  // The CONCISE path is the only one that still renders a sentence, and it was
  // the one profile this aspect never planned.
  const conciseProfile = () =>
    profileOf([
      event({
        kind: 'EXPLICIT_PREFERENCE_SET',
        authority: 'EXPLICIT_USER_PREFERENCE',
        metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
      }),
    ]);
  for (const profile of [completed(), showMePattern(), conciseProfile()]) {
    const plan = core.planPresentation({ response, profile, enabled: true });
    for (const id of plan.metaCopy) {
      const text = core.GUIDE_META_COPY[id];
      if (text === undefined) failures.push(`meta copy ${id} has no text`);
      else if (core.RETIRED_META_COPY.includes(text))
        failures.push(`a retired sentence is being emitted: ${text}`);
    }
  }
  for (const retired of core.RETIRED_META_COPY) {
    if (panel.includes(retired)) failures.push(`the panel still contains: ${retired}`);
  }

  // Banning two exact strings in one file is not banning narration. An audit
  // wrote a brand-new self-narrating line straight into the panel — "Because you
  // finished this before, the steps start folded." — and every check here, and
  // in the unit suites, stayed green.
  //
  // So the rule is structural instead: memory copy renders through one class,
  // that class may be produced from exactly one place, and every string it can
  // carry comes from the closed table.
  const noteClass = [...panel.matchAll(/sw-guide__memory-note/g)].length;
  if (noteClass !== 1)
    failures.push(`memory copy is rendered from ${noteClass} places in the panel`);
  const copyRefs = [...panel.matchAll(/GUIDE_META_COPY\.([A-Z_]+)/g)].map((match) => match[1]);
  for (const id of copyRefs) {
    if (core.GUIDE_META_COPY[id] === undefined)
      failures.push(`the panel renders GUIDE_META_COPY.${id}, which is not in the table`);
  }
  // Any literal sentence inside the memory-note element would bypass the table.
  const noteBlocks = [...panel.matchAll(/sw-guide__memory-note[\s\S]{0,400}?<\/p>/g)].map(
    (match) => match[0],
  );
  for (const block of noteBlocks) {
    for (const literal of block.matchAll(/>\s*([A-Za-z][^<>{}]{12,})\s*</g)) {
      failures.push(`the panel hardcodes memory copy: ${literal[1].trim().slice(0, 60)}`);
    }
  }

  // The forbidden replacements, named in the brief rather than inferred — and
  // applied to the panel source as well as the table, because a line hardcoded
  // in a renderer is exactly what the brief was warning about.
  for (const phrase of [
    'I remember',
    'I know you',
    'Welcome back',
    'You usually',
    "You've done this",
    'you finished this',
    'Based on how you',
    'because you have',
  ]) {
    if (Object.values(core.GUIDE_META_COPY).some((text) => text.includes(phrase)))
      failures.push(`the copy table says "${phrase}"`);
    if (panel.toLowerCase().includes(phrase.toLowerCase()))
      failures.push(`the panel says "${phrase}"`);
  }
  const completedPlan = core.planPresentation({ response, profile: completed(), enabled: true });
  if (!completedPlan.stepsCollapsed) failures.push('the fold went with the sentence');
  // The one line that may still render, and only for something the user chose.
  const concisePlan = core.planPresentation({ response, profile: conciseProfile(), enabled: true });
  const rendered = core
    .resolvePresentation(response, concisePlan)
    .notes.map((id) => core.GUIDE_META_COPY[id]);
  if (rendered.length !== 1 || rendered[0] !== core.GUIDE_META_COPY.PREFERENCE_APPLIED)
    failures.push(`the concise path renders ${JSON.stringify(rendered)}`);
  if (!concisePlan.adaptations.some((record) => record.dimension === 'META_COPY'))
    failures.push('a line rendered with no accounting row');
  notes.push('a returning user gets the fold and no announcement of it');
}

if (runs('recoverability')) {
  // Folding is not losing. Every folded case must carry the true count and an
  // offer to show them.
  const response = createClient();
  const steps = response.answer?.steps.length ?? 0;
  const profiles = [
    ['completion', completed()],
    [
      'concise preference',
      profileOf([
        event({
          kind: 'EXPLICIT_PREFERENCE_SET',
          authority: 'EXPLICIT_USER_PREFERENCE',
          metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
        }),
      ]),
    ],
  ];
  for (const [label, profile] of profiles) {
    const plan = core.planPresentation({ response, profile, enabled: true });
    if (!plan.stepsCollapsed) {
      failures.push(`${label}: expected the steps to fold`);
      continue;
    }
    if (plan.stepCount !== steps)
      failures.push(`${label}: a folded plan counts ${plan.stepCount} of ${steps} steps`);
    if (!plan.metaCopy.includes('SHOW_FULL_STEPS'))
      failures.push(`${label}: folded with no way offered to unfold`);
    const resolved = core.resolvePresentation(response, plan);
    if (!resolved.expandControlVisible)
      failures.push(`${label}: the expand control is not in the resolved presentation`);
    if (resolved.stepsVisible) failures.push(`${label}: folded and listed at the same time`);
    // Unfolding restores exactly what the response holds — no plan can subtract.
    const expanded = core.resolvePresentation(response, {
      ...plan,
      stepsCollapsed: false,
    });
    if (!expanded.stepsVisible) failures.push(`${label}: unfolding did not restore the steps`);
    if (plan.stepCount !== steps) failures.push(`${label}: the count moved`);
  }
  notes.push(`every folded plan carries all ${steps} steps and the control that shows them`);
}

const say = (line = '') => console.log(line);
say(`\nMemory boundary — ${ASPECT}\n`);
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — memory got further than remembering.\n');
  process.exit(1);
}
say('\nPASS — experience remembered, truth untouched.\n');
