/**
 * What action selection changed, and what it must not have.
 *
 * Round 4 alters which verified actions reach the guide and nothing about what
 * is known: the Product Model is the same frozen capture, no provider was
 * called, and the wording templates are untouched. So a difference between the
 * two rounds is either an action recovered, an action correctly withheld, or a
 * bug — and the third is what this exists to catch.
 *
 * Every added step is traced back to an accepted claim and a control the feature
 * owns. A step that appears in Round 4 without one is a new factual proposition
 * however plausible it reads, and fails the run.
 *
 * Usage:
 *   node scripts/guidance-round-3-vs-4.mjs
 *
 * @packageDocumentation
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import {
  buildEvidencePack,
  compileGuidance,
  computeFeatureScope,
  discoverFeatureCandidates,
  realiseInstruction,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

/**
 * Where the comparison is written.
 *
 * A temporary directory by default, and this is the whole point. These scripts
 * run as gates, and a gate that rewrites a committed artefact destroys the
 * evidence it was checking: running `test:no-factual-expansion` after a later
 * change regenerated the Round 2-to-3 comparison with the *current* compiler's
 * output, so a historical record acquired steps that round never produced. It
 * would then have been committed by the next `git add -A` with nobody the wiser.
 *
 * Historical benchmark evidence is immutable. Regenerating one is a deliberate
 * act — `--write` — not a side effect of running a check.
 */
const WRITE_IN_PLACE = process.argv.includes('--write');
const OUT = WRITE_IN_PLACE ? BENCH : mkdtempSync(path.join(os.tmpdir(), 'statewave-compare-'));

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const before = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-3.json'), 'utf8'));
const model = captured.model;

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const candidates = discoverFeatureCandidates(graph);
const beforeByFeature = new Map(before.items.map((item) => [item.featureId, item]));

/** Every action a feature's accepted claims establish, by control. */
function acceptedControls(featureId) {
  const controls = new Set();
  for (const claim of model.claims) {
    if (claim.featureId !== featureId) continue;
    if (claim.status !== 'structurally_verified') continue;
    if (claim.assertion?.subjectRef !== undefined) controls.add(claim.assertion.subjectRef);
    for (const target of claim.assertion?.targets ?? []) controls.add(target);
  }
  return controls;
}

const rows = [];
const violations = [];

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

  const priorSteps = beforeByFeature.get(feature.id)?.productOutput?.steps ?? [];
  const nowSteps = document.steps
    .map((step) => realiseInstruction(step.proposition))
    .filter(Boolean);

  const added = nowSteps.filter((step) => !priorSteps.includes(step));
  const removed = priorSteps.filter((step) => !nowSteps.includes(step));

  // Every added step must trace to a claim and to a control the feature owns.
  const accepted = acceptedControls(feature.id);
  for (const step of document.steps) {
    const text = realiseInstruction(step.proposition);
    if (text === undefined || priorSteps.includes(text)) continue;
    if (step.origin === 'synthetic-entry') continue;

    const cited = step.provenance.claims;
    const traced = cited.some((id) =>
      model.claims.some((claim) => claim.id === id && claim.status === 'structurally_verified'),
    );
    if (!traced) {
      violations.push(`${feature.id}: "${text}" cites no accepted claim`);
      continue;
    }
    const owned = step.provenance.facts.some(
      (ref) => accepted.has(ref) || scope.classify(ref) === 'OWNED',
    );
    if (!owned) {
      violations.push(`${feature.id}: "${text}" names nothing this feature owns`);
    }
  }

  rows.push({
    featureId: feature.id,
    before: {
      steps: priorSteps,
      completeness: beforeByFeature.get(feature.id) === undefined ? null : 'ROUND_3',
    },
    after: {
      steps: nowSteps,
      completeness: document.completeness,
      taskCompletion: document.taskCompletion,
      diagnostics: document.diagnostics.map((entry) => entry.code),
    },
    actionsAdded: added,
    actionsRemoved: removed,
    reasons: document.actionAccounting
      .filter((entry) => entry.outcome === 'dropped')
      .map((entry) => ({ claimId: entry.claimId, reason: entry.reason, detail: entry.detail })),
    provenance: document.steps
      .filter((step) => step.origin !== 'synthetic-entry')
      .map((step) => ({
        text: realiseInstruction(step.proposition),
        origin: step.origin,
        claims: step.provenance.claims,
        facts: step.provenance.facts,
      })),
  });
}

writeFileSync(
  path.join(OUT, 'guidance-round-3-vs-4.json'),
  `${JSON.stringify({ features: rows.length, rows }, null, 2)}\n`,
);

const md = ['# Round 3 → Round 4: action selection', ''];
md.push(
  'Same Product Model, same twenty-one features, no provider call. What changed is which verified',
  'actions the compiler selects into the guide.',
  '',
);
let changed = 0;
for (const row of rows) {
  if (row.actionsAdded.length === 0 && row.actionsRemoved.length === 0) continue;
  changed += 1;
  md.push(`## ${row.featureId}`, '');
  md.push(`- completeness: ${row.after.completeness} · task: ${row.after.taskCompletion}`);
  for (const step of row.actionsAdded) md.push(`- **added:** ${step}`);
  for (const step of row.actionsRemoved) md.push(`- **removed:** ${step}`);
  for (const reason of row.reasons) md.push(`- withheld (${reason.reason}): ${reason.detail}`);
  md.push('');
}
md.push(`---`, '', `${changed} of ${rows.length} features changed.`, '');
writeFileSync(path.join(OUT, 'guidance-round-3-vs-4.md'), `${md.join('\n')}\n`);

console.log(`\nCompared ${rows.length} features; ${changed} changed.`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-3-vs-4.json`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-3-vs-4.md\n`);

if (violations.length > 0) {
  console.log('FAIL — an added step asserts something the model does not establish:\n');
  for (const violation of violations.slice(0, 30)) console.log(`  ✗ ${violation}`);
  console.log('');
  process.exit(1);
}
console.log('PASS — every added action traces to an accepted claim and an owned control.\n');
