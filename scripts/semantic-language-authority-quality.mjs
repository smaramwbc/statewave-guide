/**
 * Whether user-facing language still says more than it can prove.
 *
 * Round 5 passed the usefulness gate with **17 of 18 assessable items scored
 * correctness 1** — nothing untrue, and imprecise or overreaching throughout. An
 * audit of every user-facing proposition in that round found 194 of them across
 * twenty-one features and could support 97. The split by surface is the whole
 * argument:
 *
 *   summary   14/17  82%   compiled from propositions since Closed Loop #4
 *   question  34/56  61%   passed through from the model
 *   purpose   42/111 38%   passed through from the model
 *
 * The surface this project compiles was already twice as well-supported as the
 * surfaces it quoted. So the quoting stopped.
 *
 * This checks four things:
 *
 *  1. Every emitted proposition carries support, and the support names something
 *     the feature owns or an assertion that was actually verified.
 *  2. No proposition is emitted of a kind nothing in this graph can establish —
 *     a role, a motive, a navigation guarantee, a plan tier, a temporal state, a
 *     status classification. These are the six the audit found and they are
 *     refused by construction rather than by review.
 *  3. The specific phrases the audit caught never reappear, in any surface, for
 *     any feature. A permanent regression: `enterprise`, `an admin`, `without
 *     leaving`, `freshly generated`, `legacy`, `compromised`.
 *  4. Provenance is total. A user-facing sentence with nothing behind it is the
 *     defect this loop exists to end, and a count of zero is the only passing
 *     value.
 *
 * Usage:
 *   pnpm test:semantic-language-authority-quality
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import {
  buildEvidencePack,
  compileGuidance,
  computeFeatureScope,
  discoverFeatureCandidates,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

/**
 * Proposition kinds nothing in an ApplicationGraph can establish.
 *
 * Each is here because the Round 5 audit found a real sentence asserting one.
 * `actor` because a permission is not a job title — `clients:update` does not
 * make anybody an account manager. `location` because it was always used for a
 * *negative*, and no static graph proves that no navigation happens. `motive`
 * because a button labelled `Rotate API key` says nothing about compromise.
 * `target_state` because `changePlan('enterprise')` is a call argument and this
 * graph records no call arguments. `temporal_state` because a `<code>` element
 * carries no history of when its contents were made. `status_classification`
 * because `legacy` and `current` are architectural opinions, and the only thing
 * carrying either word is a module path.
 */
const UNESTABLISHABLE = new Set([
  'actor',
  'location',
  'motive',
  'target_state',
  'temporal_state',
  'status_classification',
]);

/**
 * Phrases the audit caught, which may never come back.
 *
 * Not a filter — nothing consults this list at compile time, and a design that
 * needed one would be the wrong design. It is a regression test: if a later
 * change reopens a path from model prose to the page, one of these is what comes
 * through first, because these are what came through last time.
 */
const BANNED = [
  'enterprise',
  'an admin',
  'account manager',
  'without leaving',
  'anywhere in the app',
  'freshly',
  'legacy',
  'compromised',
  'no longer need',
  'for use elsewhere',
  'in one place',
  'main view',
];

const model = JSON.parse(
  readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'),
).model;
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();
const candidates = discoverFeatureCandidates(graph);

const metrics = {
  features: 0,
  propositions: 0,
  supported: 0,
  unsupported: 0,
  presentational: 0,
  purposesEmitted: 0,
  questionsEmitted: 0,
  summariesEmitted: 0,
  withheld: 0,
  languageClaimsNotRendered: 0,
  languageEvidenceNotOwned: 0,
};
const byType = {};
const withheldByReason = {};
const failures = [];

for (const feature of model.features) {
  const candidate = candidates.find((entry) => entry.id === feature.id);
  if (candidate === undefined) continue;
  const pack = buildEvidencePack(graph, candidate);
  const scope = computeFeatureScope({
    featureId: feature.id,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const document = compileGuidance({ model, feature, graph, candidate, scope });
  metrics.features += 1;
  if (document.purpose !== undefined) metrics.purposesEmitted += 1;
  if (document.summary !== undefined) metrics.summariesEmitted += 1;
  metrics.questionsEmitted += document.questions.length;
  metrics.withheld += document.withheldLanguage.length;

  for (const entry of document.withheldLanguage) {
    withheldByReason[entry.refusal] = (withheldByReason[entry.refusal] ?? 0) + 1;
  }
  for (const entry of document.diagnostics) {
    if (entry.code === 'LANGUAGE_CLAIM_NOT_RENDERED') metrics.languageClaimsNotRendered += 1;
    if (entry.code === 'LANGUAGE_EVIDENCE_NOT_OWNED') metrics.languageEvidenceNotOwned += 1;
  }

  for (const proposition of document.languagePropositions) {
    metrics.propositions += 1;
    byType[proposition.type] = (byType[proposition.type] ?? 0) + 1;

    if (UNESTABLISHABLE.has(proposition.type)) {
      failures.push(
        `${feature.id}: emitted a ${proposition.type} proposition ("${proposition.value}") — nothing in an ApplicationGraph establishes that kind of claim`,
      );
    }

    const support = proposition.support;
    if (support === undefined) {
      metrics.unsupported += 1;
      failures.push(`${feature.id}: ${proposition.type}="${proposition.value}" carries no support`);
      continue;
    }
    if (support.kind === 'presentational') {
      metrics.presentational += 1;
      metrics.supported += 1;
      continue;
    }
    if (support.kind === 'owned-node' && scope.classify(support.nodeId) !== 'OWNED') {
      metrics.unsupported += 1;
      failures.push(
        `${feature.id}: ${proposition.type}="${proposition.value}" rests on ${support.nodeId}, which this feature does not own`,
      );
      continue;
    }
    if (support.kind === 'claim-assertion') {
      const claim = model.claims.find((entry) => entry.id === support.claimId);
      if (claim !== undefined && claim.status !== 'structurally_verified') {
        metrics.unsupported += 1;
        failures.push(
          `${feature.id}: ${proposition.type}="${proposition.value}" rests on a ${claim.status} claim`,
        );
        continue;
      }
    }
    metrics.supported += 1;
  }

  // The regression. Every user-facing surface, every feature.
  const copy = [
    document.purpose?.text ?? '',
    document.summary?.text ?? '',
    ...document.questions.map((entry) => entry.text),
    document.title?.text ?? '',
  ]
    .join(' ')
    .toLowerCase();
  for (const phrase of BANNED) {
    if (copy.includes(phrase)) {
      failures.push(
        `${feature.id}: user-facing copy contains "${phrase}", which nothing establishes`,
      );
    }
  }
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

console.log('\nSemantic language authority\n');
console.log(`  features compiled                      ${metrics.features}`);
console.log('');
console.log(`  emitted language propositions          ${metrics.propositions}`);
console.log(`    supported                            ${metrics.supported}`);
console.log(`    unsupported                          ${metrics.unsupported}`);
console.log(`    of which presentational              ${metrics.presentational}`);
console.log(
  `    support rate                         ${pct(metrics.supported, metrics.propositions)}`,
);
console.log('');
console.log('  By proposition type\n');
for (const [type, count] of Object.entries(byType).sort()) {
  console.log(`    ${type.padEnd(22)} ${count}`);
}
console.log('\n  Surfaces\n');
console.log(
  `    purposes emitted                     ${metrics.purposesEmitted}/${metrics.features}`,
);
console.log(
  `    summaries emitted                    ${metrics.summariesEmitted}/${metrics.features}`,
);
console.log(`    questions emitted                    ${metrics.questionsEmitted}`);
console.log('\n  Model prose, and what became of it\n');
console.log(`    language claims not rendered         ${metrics.languageClaimsNotRendered}`);
console.log(`    of which cited unowned evidence      ${metrics.languageEvidenceNotOwned}`);
console.log(`    propositions withheld                ${metrics.withheld}`);
for (const [reason, count] of Object.entries(withheldByReason).sort()) {
  console.log(`      ${reason.padEnd(24)} ${count}`);
}
console.log('\n  Kinds refused by construction\n');
console.log(`    ${[...UNESTABLISHABLE].sort().join(', ')}`);
console.log(
  `    emitted anyway                       ${metrics.propositions === 0 ? 0 : [...UNESTABLISHABLE].filter((t) => byType[t]).length}`,
);

console.log('');
if (failures.length > 0) {
  for (const failure of failures.slice(0, 30)) console.log(`    ✗ ${failure}`);
  console.log('\nFAIL — a sentence says more than anything establishes.\n');
  process.exit(1);
}
console.log('PASS — every emitted proposition is supported, owned, and of a kind that can be.\n');
