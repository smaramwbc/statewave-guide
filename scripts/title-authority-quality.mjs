/**
 * Whether any user-facing name is still an identifier in disguise.
 *
 * Round 6 split the corpus on this one variable:
 *
 *   title is a real visible label   n=12   mean usefulness 2.25   correctness 1.92
 *   title derived from the id       n= 9   mean usefulness 0.67   correctness 1.25
 *
 * Six of the seven items still scoring correctness 1 were the title. The nine
 * were `Search`, `Table`, `Danger zone`, `New key`, `Error`, `Partial clients`
 * and three more — every one produced by spacing out a semantic id and
 * capitalising it until it looked like something a person wrote.
 *
 * That disguise is the reason this gate exists rather than a style note. A
 * reader cannot tell a manufactured name from a real one, so a manufactured one
 * spends credibility the real ones earned.
 *
 * Three invariants, and the third is the one that keeps the first two honest:
 * every emitted title traces to a node the feature **owns**, and a feature the
 * interface does not name has no title at all.
 *
 * Usage:
 *   pnpm test:title-authority-quality
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

/** Words a title may never be, because none of them was written for a reader. */
const SHELL_WORDS = ['untitled', 'unknown', 'feature', 'control', 'element', 'n/a'];

const model = JSON.parse(
  readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'),
).model;
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();
const candidates = discoverFeatureCandidates(graph);

const byOrigin = {};
const rows = [];
const failures = [];
let emitted = 0;
let withheld = 0;
let provenanced = 0;

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

  if (document.title === undefined) {
    withheld += 1;
    rows.push({ featureId: feature.id, title: null, origin: 'WITHHELD', evidence: null });
    if (document.titleEvidence !== undefined) {
      failures.push(`${feature.id}: no title, yet title evidence was recorded`);
    }
    continue;
  }

  emitted += 1;
  const origin = document.titleEvidence?.origin ?? document.title.origin;
  byOrigin[origin] = (byOrigin[origin] ?? 0) + 1;
  rows.push({
    featureId: feature.id,
    title: document.title.text,
    origin,
    evidence: document.titleEvidence?.evidence ?? null,
  });

  if (origin === 'normalised-identifier') {
    failures.push(`${feature.id}: title "${document.title.text}" was built from the identifier`);
  }
  if (origin === 'route-title' || origin === 'component-name') {
    failures.push(
      `${feature.id}: title "${document.title.text}" came from a ${origin}, which is a code identifier with its punctuation changed`,
    );
  }
  if (SHELL_WORDS.includes(document.title.text.trim().toLowerCase())) {
    failures.push(`${feature.id}: title "${document.title.text}" is a placeholder, not a name`);
  }

  if (document.titleEvidence === undefined) {
    failures.push(`${feature.id}: title "${document.title.text}" has no evidence recorded`);
    continue;
  }
  const scopeClass = scope.classify(document.titleEvidence.evidence);
  if (scopeClass !== 'OWNED') {
    failures.push(
      `${feature.id}: title reads ${document.titleEvidence.evidence}, which this feature classifies ${scopeClass}`,
    );
    continue;
  }
  provenanced += 1;
}

const pct = (n, d) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

console.log('\nTitle authority\n');
console.log(`  features                               ${rows.length}`);
console.log(`  titles emitted                         ${emitted}`);
console.log(`  titles withheld                        ${withheld}`);
console.log(
  `  provenance to an owned node            ${provenanced}/${emitted}  ${pct(provenanced, emitted)}`,
);
console.log(`  identifier-derived                     ${byOrigin['normalised-identifier'] ?? 0}`);

console.log('\n  By origin\n');
for (const [origin, count] of Object.entries(byOrigin).sort()) {
  console.log(`    ${origin.padEnd(24)} ${count}`);
}

console.log('\n  Per feature\n');
for (const row of [...rows].sort((a, b) => (a.featureId < b.featureId ? -1 : 1))) {
  console.log(
    `    ${row.featureId.padEnd(28)} ${String(row.origin).padEnd(18)} ${row.title === null ? '—' : JSON.stringify(row.title)}`,
  );
}

console.log('');
if (failures.length > 0) {
  for (const failure of failures.slice(0, 30)) console.log(`    ✗ ${failure}`);
  console.log('\nFAIL — a user-facing name came from somewhere a user has never looked.\n');
  process.exit(1);
}
console.log('PASS — every title is text the interface supplies, and the rest are withheld.\n');
