/**
 * What bounded recovery changed, and what it must not have.
 *
 * Round 5 alters which verified actions reach the guide and nothing about what
 * is known: the Product Model is the same frozen capture, no provider was
 * called, no verification rule moved, and the wording templates are untouched.
 * So a difference between the two rounds is either an action recovered, an
 * action correctly withheld, a restatement removed — or a bug, and the last is
 * what this exists to catch.
 *
 * Every added step is traced back to an accepted claim and to a control acting
 * on something the feature owns. A step that appears in Round 5 without one is
 * a new factual proposition however plausible it reads, and fails the run.
 *
 * Removals are checked too, and they are the half a "no expansion" audit
 * usually forgets. A recovery rule that quietly stopped emitting an action
 * would pass an expansion check and lose a user their instructions.
 *
 * Usage:
 *   node scripts/guidance-round-4-vs-5.mjs [--write]
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

/** Historical evidence is immutable; regenerating one is `--write`, not a side effect. */
const WRITE_IN_PLACE = process.argv.includes('--write');
const OUT = WRITE_IN_PLACE ? BENCH : mkdtempSync(path.join(os.tmpdir(), 'statewave-compare-'));

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const before = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-4.json'), 'utf8'));
const model = captured.model;

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const candidates = discoverFeatureCandidates(graph);
const beforeByFeature = new Map(before.items.map((item) => [item.featureId, item]));

/** Every control a feature's accepted claims name. */
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

  // Every added step must trace to a claim and to something the feature owns.
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
    const recovered = document.actionRecoveries.find((entry) =>
      step.provenance.facts.includes(entry.control),
    );
    // A recovered control is reached through work the feature owns rather than
    // through the control itself, so its warrant is the surface. Anything else
    // has to name something owned directly.
    if (!owned && recovered === undefined) {
      violations.push(`${feature.id}: "${text}" names nothing this feature owns`);
      continue;
    }
    if (recovered !== undefined && recovered.actionSurfaceScope !== 'OWNED') {
      violations.push(
        `${feature.id}: "${text}" was recovered through ${recovered.actionSurface}, which this feature does not own`,
      );
    }
  }

  // A removal is only legitimate where something else already says it.
  for (const text of removed) {
    if (nowSteps.includes(text)) continue;
    const redundant = document.diagnostics.some((entry) => entry.code === 'REDUNDANT_ENTRY_STEP');
    if (!redundant) {
      violations.push(`${feature.id}: "${text}" disappeared and nothing accounts for it`);
    }
  }

  rows.push({
    featureId: feature.id,
    before: { steps: priorSteps },
    after: {
      steps: nowSteps,
      completeness: document.completeness,
      taskCompletion: document.taskCompletion,
      diagnostics: document.diagnostics.map((entry) => entry.code),
    },
    actionsAdded: added,
    actionsRemoved: removed,
    recoveries: document.actionRecoveries,
    reasons: document.actionAccounting
      .filter((entry) => entry.outcome === 'dropped')
      .map((entry) => ({
        claimId: entry.claimId,
        reason: entry.reason,
        recovery: entry.recovery ?? null,
        detail: entry.detail,
      })),
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
  path.join(OUT, 'guidance-round-4-vs-5.json'),
  `${JSON.stringify({ features: rows.length, rows }, null, 2)}\n`,
);

const md = ['# Round 4 → Round 5: bounded action target recovery', ''];
md.push(
  'Same Product Model, same twenty-one features, no provider call. What changed is which verified',
  'actions the compiler can reach, and whether a synthesised entry step restates one.',
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
  for (const entry of row.recoveries) {
    md.push(
      `- recovered ${entry.control} from ${entry.from} through \`${entry.relationship}\` at ${entry.actionSurface} (${entry.actionSurfaceScope})`,
    );
  }
  for (const reason of row.reasons) md.push(`- withheld (${reason.reason}): ${reason.detail}`);
  md.push('');
}
md.push(`---`, '', `${changed} of ${rows.length} features changed.`, '');
writeFileSync(path.join(OUT, 'guidance-round-4-vs-5.md'), `${md.join('\n')}\n`);

console.log(`\nCompared ${rows.length} features; ${changed} changed.`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-4-vs-5.json`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-4-vs-5.md\n`);

if (violations.length > 0) {
  console.log('FAIL — a step changed in a way the model does not establish:\n');
  for (const violation of violations.slice(0, 30)) console.log(`  ✗ ${violation}`);
  console.log('');
  process.exit(1);
}
console.log('PASS — every added action traces to an accepted claim and owned work.\n');
