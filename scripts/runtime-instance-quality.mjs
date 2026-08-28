/**
 * Whether a runtime instance can help without becoming product truth.
 *
 * The line this guards: **a concept is compiled from evidence and lives in the
 * ProductModel; an instance is observed and belongs to one snapshot.** Every
 * check below is a way the second could turn into the first, or a way a name
 * that must not be shown could reach a screen.
 *
 * `--aspect` selects which gate name reports, over one traversal.
 *
 * Usage:
 *   pnpm test:runtime-instance-grounding
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  conceptNounsOnRoute,
  createGuideQueryEngine,
  isDisplayableInstanceName,
  redactContextForDiagnostics,
  supportedConceptNouns,
} from '../packages/core/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'grounding' : (process.argv[aspectIndex + 1] ?? 'grounding');
const failures = [];

const bundle = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8'),
);
const engine = createGuideQueryEngine({ bundle });
const V = bundle.applicationVersion;

const row = (name, ref, route = '/invoices') => ({
  semanticId: 'invoices.list.open',
  ref,
  containerSemanticId: 'invoices.list.row',
  runtimeAccessibleName: name,
  ownerFeatureId: 'invoices.list.open',
  route,
});
const ask = (instances, extra = {}) =>
  engine.query({
    query: 'How do I open an invoice?',
    context: {
      route: '/invoices',
      applicationVersion: V,
      visibleSemanticIds: ['invoices.list.open'],
      runtimeInstances: instances,
      ...extra,
    },
    developer: true,
  });

// --- 1. Concepts are earned, and route-scoped ------------------------------
const concepts = supportedConceptNouns(bundle);
if (!concepts.has('invoice')) failures.push('"invoice" is not a supported concept');
if (conceptNounsOnRoute(bundle, '/clients/c1').has('invoice')) {
  failures.push('"invoice" is treated as established on a screen where nothing establishes it');
}
// Every concept traces to a language proposition, which carries evidence.
for (const noun of concepts) {
  const owner = bundle.features.find((feature) => feature.conceptNouns.includes(noun));
  const supported = (owner?.guidance.languagePropositions ?? []).some(
    (entry) => entry.type === 'object' && entry.value === noun && entry.support !== undefined,
  );
  if (!supported) failures.push(`the concept "${noun}" rests on no supported proposition`);
}

// --- 2. Instances never become product truth --------------------------------
const bundleText = JSON.stringify(bundle);
for (const name of ['INV-001', 'INV-002', 'INV-999']) {
  if (bundleText.includes(name)) failures.push(`the instance name ${name} is in the bundle`);
}
const before = bundleText;
ask([row('INV-001', 'a'), row('INV-002', 'b')]);
ask([row('INV-001', 'a'), row('INV-002', 'b')], { selectedInstanceRef: 'b' });
if (JSON.stringify(bundle) !== before) failures.push('an interaction changed the bundle');

// --- 3. Privacy, in both directions -----------------------------------------
const SECRETS = [
  'sk_live_9f2a71b3c4d5',
  'Bearer abc123def456',
  'a3f5c9d1e7b2048fa3f5c9d1e7b2048f',
  'eyJhbGciOi.eyJzdWIi',
  'hunter2password',
  'tok_abc123456',
];
const LABELS = ['INV-001', 'Reset password', 'Change password settings', 'Acme Corp'];
for (const secret of SECRETS) {
  if (isDisplayableInstanceName(secret)) failures.push(`"${secret}" is treated as displayable`);
  const response = ask([row(secret, 'a'), row('INV-002', 'b')]);
  if (JSON.stringify(response).includes(secret)) failures.push(`"${secret}" reached a response`);
}
for (const label of LABELS) {
  // Over-redaction is a failure too: a control somebody labelled must stay sayable.
  if (!isDisplayableInstanceName(label)) failures.push(`"${label}" is redacted and should not be`);
}
const redacted = redactContextForDiagnostics({
  route: '/invoices',
  runtimeInstances: [row('sk_live_9f2a71b3c4d5', 'a')],
});
if (redacted.runtimeInstances[0].ref !== 'a') failures.push('redaction destroyed addressability');

// --- 4. Identity, staleness and invention -----------------------------------
const duplicate = ask([row('INV-001', 'a'), row('INV-001', 'b')]);
if ((duplicate.runtimeChoices ?? []).length > 0)
  failures.push('duplicate names were offered as choices');

const stale = ask([{ ...row('INV-001', 'a'), snapshotId: 's1' }], { snapshotId: 's2' });
if ((stale.runtimeChoices ?? []).length > 0) failures.push('a stale snapshot produced choices');

const moved = engine.query({
  query: 'How do I open an invoice?',
  context: {
    route: '/settings',
    applicationVersion: V,
    runtimeInstances: [row('INV-001', 'a')],
    selectedInstanceRef: 'a',
  },
});
if (moved.actions.length > 0) failures.push('an instance survived a route change');

const invented = createGuideQueryEngine({
  bundle,
  provider: { chooseCandidate: () => 'INV-999' },
}).query({
  query: 'How do I open an invoice?',
  context: {
    route: '/invoices',
    applicationVersion: V,
    runtimeInstances: [row('INV-001', 'a'), row('INV-002', 'b')],
  },
});
if (JSON.stringify(invented).includes('INV-999'))
  failures.push('a provider introduced an instance');

// --- 5. Actions stay inert and instance-addressed ---------------------------
const chosen = ask([row('INV-001', 'a'), row('INV-002', 'b')], { selectedInstanceRef: 'b' });
for (const action of chosen.actions) {
  if (!['navigate', 'highlight', 'scroll', 'focus', 'open_guide_step'].includes(action.kind)) {
    failures.push(`action "${action.kind}" is outside the closed union`);
  }
  if ('semanticId' in action && action.instanceRef !== 'b') {
    failures.push('an action for a chosen instance does not carry its handle');
  }
}
if (chosen.answer !== undefined) failures.push('a sentence was written about an instance');

const say = (line = '') => console.log(line);
const TITLES = {
  grounding: 'Runtime instance grounding',
  privacy: 'Runtime instance privacy',
  query: 'Query contract — runtime instances',
  staleness: 'Runtime instance staleness',
};
say(`\n${TITLES[ASPECT] ?? TITLES.grounding}\n`);
say(`  supported concepts                   ${[...concepts].sort().join(', ')}`);
say(
  `  established on /invoices             ${[...conceptNounsOnRoute(bundle, '/invoices')].sort().join(', ')}`,
);
say(
  `  established on /clients/:clientId    ${[...conceptNounsOnRoute(bundle, '/clients/c1')].sort().join(', ')}`,
);
say('');
say(`  instance names in the bundle         0 required`);
say(`  secret shapes refused                ${SECRETS.length}/${SECRETS.length}`);
say(`  labels kept displayable              ${LABELS.length}/${LABELS.length}`);
say(
  `  choices for two instances            ${JSON.stringify((ask([row('INV-001', 'a'), row('INV-002', 'b')]).runtimeChoices ?? []).map((c) => c.label))}`,
);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — an instance reached somewhere it may not.\n');
  process.exit(1);
}
say('\nPASS — instances help, and stay instances.\n');
