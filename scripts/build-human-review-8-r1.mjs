/**
 * Round 8 revision 1 — the same experiment, with the evidence stated correctly.
 *
 * The issued Round 8 package carries a review-fact attribution defect: the
 * renderer hard-coded *"Typing into"* onto every collection change and
 * *"reduced"* onto every count, so three facts described interactions that never
 * happened — including a **click** on `Rotate API key` rendered as typing, and a
 * page section's child count rendered as a collection.
 *
 * That is a defect in the *instrument*, not in the product. The Product Model,
 * the capability rules, the compiled language and all twenty-one product
 * outputs are unchanged and unchangeable here.
 *
 * So this does not rebuild the package. It **reads the issued one** and
 * substitutes only the runtime-derived sentences, which makes the identity of
 * everything else structural rather than something to hope for and check
 * afterwards: review ids, feature ids, ordering, user context, product output,
 * gate version and seed are copied through, and the run fails if any of them
 * moves.
 *
 * The original stays on disk, byte-for-byte, as the defective artefact that was
 * actually issued. History is not corrected by overwriting it.
 *
 * Usage:
 *   node scripts/build-human-review-8-r1.mjs [--check]
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { renderReviewItem } from './lib/review-markdown.mjs';
import { describeRuntimeFacts, isRuntimeFact } from './lib/runtime-review-facts.mjs';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');
const CHECK = process.argv.includes('--check');

const issued = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-8.json'), 'utf8'));
const issuedKey = JSON.parse(
  readFileSync(path.join(BENCH, 'human-review-round-8.key.json'), 'utf8'),
);

const loaded = await loadEverything(ROOT);
const { accepted } = enrich(loaded);
const nodeById = new Map(loaded.graph.nodes.map((node) => [node.id, node]));

const runtimeByFeature = new Map();
for (const entry of accepted) {
  const list = runtimeByFeature.get(entry.record.featureId) ?? [];
  list.push(entry.record);
  runtimeByFeature.set(entry.record.featureId, list);
}

const failures = [];
const changes = [];

const items = issued.items.map((item) => {
  // Static facts survive untouched and in order. They were never in question.
  const staticFacts = item.knownSupportedFacts.filter((fact) => !isRuntimeFact(fact));
  const removed = item.knownSupportedFacts.filter(isRuntimeFact);

  const observed = [];
  for (const record of runtimeByFeature.get(item.featureId) ?? []) {
    for (const sentence of describeRuntimeFacts(record, nodeById)) {
      if (!observed.includes(sentence)) observed.push(sentence);
    }
  }

  // A feature with no accepted record must not have had runtime facts, and a
  // feature with one must still have them. Either way round is a bug.
  if (removed.length > 0 && observed.length === 0) {
    failures.push(`${item.featureId}: had runtime facts and now has none`);
  }
  if (removed.length === 0 && observed.length > 0) {
    failures.push(`${item.featureId}: gained runtime facts it was not issued with`);
  }

  const facts = [...staticFacts, ...observed];
  for (const sentence of removed) {
    if (!observed.includes(sentence)) changes.push({ item: item.reviewId, was: sentence });
  }
  for (const sentence of observed) {
    if (!removed.includes(sentence)) changes.push({ item: item.reviewId, now: sentence });
  }

  return { ...item, knownSupportedFacts: facts };
});

// --- Identity, asserted rather than assumed ------------------------------
for (const [index, item] of items.entries()) {
  const before = issued.items[index];
  for (const field of ['reviewId', 'featureId', 'factsNote']) {
    if (JSON.stringify(item[field]) !== JSON.stringify(before[field])) {
      failures.push(`${before.reviewId}: ${field} changed`);
    }
  }
  for (const field of ['userContext', 'productOutput']) {
    if (JSON.stringify(item[field]) !== JSON.stringify(before[field])) {
      failures.push(`${before.reviewId}: ${field} changed — this revision may not touch it`);
    }
  }
}
if (items.length !== issued.items.length) failures.push('item count changed');

const revision = {
  ...issued,
  package: 'human-review-round-8-r1',
  supersedes: 'human-review-round-8',
  supersededReason: 'RUNTIME_REVIEW_FACT_ATTRIBUTION_DEFECT',
  revisionNote:
    'Identical experiment. Only the runtime-derived entries in knownSupportedFacts changed: the issued package rendered every collection change as "Typing into" regardless of the interaction, every count as "reduced" regardless of direction, and a page section gaining a child as a collection. Product outputs, review ids, ordering, gate version and seed are unchanged.',
  items,
};

const key = {
  ...issuedKey,
  package: 'human-review-round-8-r1',
  supersedes: 'human-review-round-8',
};

const md = [
  '# Human review — Round 8 (revision 1)',
  '',
  `Supersedes \`human-review-round-8\` — RUNTIME_REVIEW_FACT_ATTRIBUTION_DEFECT.`,
  'The twenty-one product outputs are identical to the issued package. Only the observed-behaviour',
  'entries under "What the application actually does" changed, and only because the issued ones',
  'misattributed the interaction that produced them.',
  '',
];
for (const item of items) md.push(...renderReviewItem(item));

if (failures.length > 0) {
  console.log('\nFAIL — the revision is not the same experiment:\n');
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  console.log('');
  process.exit(1);
}

const json = `${JSON.stringify(revision, null, 2)}\n`;
const keyJson = `${JSON.stringify(key, null, 2)}\n`;
const markdown = `${md.join('\n')}\n`;

if (CHECK) {
  let drift = 0;
  for (const [name, produced] of [
    ['human-review-round-8-r1.json', json],
    ['human-review-round-8-r1.key.json', keyJson],
    ['human-review-round-8-r1.md', markdown],
  ]) {
    let committed = '';
    try {
      committed = readFileSync(path.join(BENCH, name), 'utf8');
    } catch {
      console.log(`  ✗ ${name} has not been written yet`);
      drift += 1;
      continue;
    }
    if (committed !== produced) {
      console.log(`  ✗ ${name} differs from what this script produces`);
      drift += 1;
    }
  }
  console.log(
    drift === 0
      ? '\nPASS — the corrected revision on disk is what this script produces.\n'
      : '\nFAIL — the corrected revision drifted.\n',
  );
  process.exit(drift === 0 ? 0 : 1);
}

writeFileSync(path.join(BENCH, 'human-review-round-8-r1.json'), json);
writeFileSync(path.join(BENCH, 'human-review-round-8-r1.key.json'), keyJson);
writeFileSync(path.join(BENCH, 'human-review-round-8-r1.md'), markdown);

console.log('\nRound 8 revision 1\n');
console.log(`  items                 ${items.length} (product outputs unchanged)`);
console.log(`  facts withdrawn       ${changes.filter((c) => c.was !== undefined).length}`);
console.log(`  facts added           ${changes.filter((c) => c.now !== undefined).length}`);
console.log('');
for (const change of changes) {
  console.log(
    `    ${change.was !== undefined ? '−' : '+'} ${change.item}  ${change.was ?? change.now}`,
  );
}
console.log('');
