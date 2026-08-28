/**
 * Whether anything claims a selection nobody declared.
 *
 * Selection and membership are different dimensions of state, and for one loop
 * they were the same fact: `select` required a collection's member count to
 * change, so a row appearing and a row being picked were indistinguishable. The
 * observer now reads selection only where an application *declares* it —
 * `aria-selected`, `aria-checked`, native checked state, `aria-activedescendant`
 * — and nowhere else.
 *
 * The benchmark fixture declares none of it. `InvoiceList` marks its chosen row
 * with `className="is-active"` and tells assistive technology nothing, so
 * selection there is genuinely unobservable and both selection capabilities are
 * refused. That refusal is the thing this checks: it would be trivial to read
 * the class, and reading it would mean treating an implementation detail as a
 * declaration.
 *
 * Usage:
 *   pnpm test:runtime-selection-semantics
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { SELECTABLE_MEMBER_ROLES, capabilityDefinition } from '../packages/shared/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';
import { parseEffect } from './lib/runtime-review-facts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');
const runtime = JSON.parse(readFileSync(path.join(BENCH, 'runtime-evidence-v1.json'), 'utf8'));
const loaded = await loadEverything(ROOT);
const { enriched } = enrich(loaded);

const failures = [];

// --- Selection must rest on declared selection state ----------------------
for (const kind of ['select', 'clear_selection']) {
  const definition = capabilityDefinition(kind);
  if (definition === undefined) {
    failures.push(`${kind} has no definition`);
    continue;
  }
  if (!definition.requires.includes('SELECTION_CHANGED')) {
    failures.push(`${kind} does not require declared selection state`);
  }
  if (definition.requires.includes('COLLECTION_MEMBERS_CHANGED')) {
    failures.push(`${kind} accepts a membership change as a selection`);
  }
  if (definition.requires.includes('ROUTE_CHANGED')) {
    failures.push(`${kind} accepts navigation as a selection`);
  }
  if (definition.requires.includes('ELEMENT_APPEARED')) {
    failures.push(`${kind} accepts something appearing as a selection`);
  }
}

// --- Nothing in the evidence claims a selection ---------------------------
const selectionEffects = [];
for (const record of runtime.records) {
  for (const raw of record.effects) {
    const { kind, fields } = parseEffect(raw);
    if (kind === 'SELECTION_CHANGED') selectionEffects.push({ trace: record.traceId, ...fields });
  }
  if (record.action === 'select' || record.action === 'clear_selection') {
    const declared = record.effects.some((e) => e.startsWith('SELECTION_CHANGED'));
    if (!declared) {
      failures.push(`${record.traceId} claims ${record.action} with no declared selection state`);
    }
  }
}

// --- And no ProductModel claim asserts one --------------------------------
const claimed = enriched.claims.filter(
  (claim) =>
    claim.status === 'behaviorally_verified' &&
    (claim.assertion?.action === 'select' || claim.assertion?.action === 'clear_selection'),
);
for (const claim of claimed) {
  const cited = claim.evidence.some((item) => item.ref.startsWith('SELECTION_CHANGED'));
  if (!cited) failures.push(`${claim.id} asserts a selection citing no selection state`);
}

// --- The refusals that prove the fixture was inspected, not assumed -------
const refusals = new Map(runtime.refusals.map((entry) => [entry.featureId, entry]));
for (const featureId of ['invoices.list.open', 'invoices.list.clear']) {
  const refusal = refusals.get(featureId);
  if (refusal === undefined) {
    failures.push(`${featureId} was not probed, so nothing established that it selects nothing`);
    continue;
  }
  if (refusal.status !== 'rejected') {
    failures.push(`${featureId} was not refused (${refusal.status})`);
  }
}

const say = (line = '') => console.log(line);
say('\nRuntime selection semantics\n');
say(`  roles whose selection is meaningful  ${SELECTABLE_MEMBER_ROLES.length}`);
say(`  declared selection changes observed  ${selectionEffects.length}`);
say(`  selection claims in the ProductModel ${claimed.length}`);
say('');
say('  the fixture, inspected rather than assumed:');
for (const [featureId, refusal] of refusals) {
  if (!featureId.startsWith('invoices.list')) continue;
  say(`    ${featureId.padEnd(22)} ${String(refusal.proposed).padEnd(16)} ${refusal.reason}`);
}
say('');
say('  `InvoiceList` marks its chosen row with a CSS class and declares nothing to');
say('  assistive technology, so there is no selection state to observe. Reading the');
say('  class would make an implementation detail into evidence.');

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — a selection is being claimed that nothing declared.\n');
  process.exit(1);
}
say('\nPASS — selection is claimed only where an application declares it.\n');
