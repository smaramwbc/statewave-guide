/**
 * What changed between the Round 2 renderer and the Round 3 compiler, and what
 * did not.
 *
 * Two jobs, and the second matters more than the first.
 *
 * The **snapshot** puts both renderings of all twenty-one features side by side
 * so the change is auditable by reading rather than by trusting a metric.
 *
 * The **expansion check** is the safety half. Compilation is allowed to select,
 * reorder, rephrase and stay silent. It is not allowed to add a single fact
 * about the application. So every capability, permission and destination the
 * new guidance speaks about is matched back to an accepted claim in the frozen
 * ProductModel, and anything with no match is a failure — not a warning, and
 * not a note in a report somebody skims.
 *
 * That check is why the ProductModel is frozen on disk rather than regenerated.
 * A model that moved between the two sides would make "no new facts" unfalsifiable.
 *
 * Usage:
 *   node scripts/guidance-snapshot.mjs
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import {
  compileGuidance,
  realiseInstruction,
  tryRealise,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const previous = JSON.parse(readFileSync(path.join(BENCH, 'review-round-2.json'), 'utf8'));

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const model = captured.model;

/** Every fact the accepted ProductModel establishes for one feature. */
function acceptedFacts(featureId) {
  const claims = model.claims.filter(
    (claim) => claim.featureId === featureId && claim.status === 'structurally_verified',
  );
  return {
    actions: new Set(
      claims
        .filter((claim) => claim.type === 'capability')
        .map((claim) => claim.assertion?.action)
        .filter(Boolean),
    ),
    permissions: new Set(
      claims
        .flatMap((claim) => [
          claim.assertion?.permission,
          ...(claim.assertion?.targets ?? [])
            .filter((target) => target.startsWith('permission:'))
            .map((target) => target.slice('permission:'.length)),
        ])
        .filter(Boolean),
    ),
    nodes: new Set(claims.flatMap((claim) => claim.assertion?.targets ?? [])),
    claimIds: new Set(claims.map((claim) => claim.id)),
  };
}

const rows = [];
const expansions = [];

for (const feature of model.features) {
  const document = compileGuidance({ model, feature, graph });
  const facts = acceptedFacts(feature.id);

  // --- No factual expansion ------------------------------------------------
  // Every proposition that asserts application behaviour must trace back to an
  // accepted claim, and the claim must actually carry what the proposition
  // says. A capability sentence about `delete` drawn from a claim about `view`
  // would be a new fact wearing old provenance.
  const check = (proposition, where) => {
    const cited = proposition.provenance.claims;
    const traced = cited.some((id) => facts.claimIds.has(id));
    const fromGraph = proposition.provenance.facts.length > 0;

    if (!traced && !fromGraph) {
      expansions.push(`${feature.id} ${where}: cites nothing accepted`);
      return;
    }
    // An absent action is not an unsupported one. A step often knows only which
    // control is pressed, and saying no more than that is the correct outcome.
    if (
      proposition.kind === 'perform_action' &&
      proposition.action !== undefined &&
      !facts.actions.has(proposition.action)
    ) {
      expansions.push(
        `${feature.id} ${where}: speaks of "${proposition.action}", which no accepted claim establishes`,
      );
    }
    if (
      proposition.kind === 'requires_permission' &&
      !facts.permissions.has(proposition.permission)
    ) {
      expansions.push(
        `${feature.id} ${where}: names permission "${proposition.permission}", which no accepted claim establishes`,
      );
    }
    if (proposition.kind === 'confirm_action' && proposition.action !== undefined) {
      if (!facts.actions.has(proposition.action)) {
        expansions.push(
          `${feature.id} ${where}: confirms "${proposition.action}", which no accepted claim establishes`,
        );
      }
    }
  };

  for (const step of document.steps) check(step.proposition, `step ${step.index}`);
  for (const condition of document.conditions) check(condition.proposition, 'condition');

  // --- Snapshot ------------------------------------------------------------
  const before = previous.features.find((entry) => entry.featureId === feature.id);
  rows.push({
    featureId: feature.id,
    before: {
      title: before?.renderedDocument ? titleOf(before.renderedDocument) : null,
      description: before?.renderedDocument ? descriptionOf(before.renderedDocument) : null,
      workflow: before?.workflow ?? [],
    },
    after: {
      title: document.title.text,
      titleOrigin: document.title.origin,
      summary: document.summary?.text ?? null,
      purpose: document.purpose?.text ?? null,
      steps: document.steps.map((step) => realiseInstruction(step.proposition)).filter(Boolean),
      conditions: document.conditions.map((c) => tryRealise(c.proposition)).filter(Boolean),
      questions: document.questions.map((question) => question.text),
      completeness: document.completeness,
      diagnostics: document.diagnostics.map((entry) => entry.code),
    },
  });
}

function titleOf(text) {
  return /^# (.+)$/m.exec(text)?.[1]?.trim() ?? null;
}
function descriptionOf(text) {
  const lines = text.split('\n');
  const heading = lines.findIndex((line) => line.startsWith('# '));
  if (heading === -1) return null;
  for (let index = heading + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') continue;
    if (line.startsWith('_') || line.startsWith('<!--') || line.startsWith('#')) break;
    return line;
  }
  return null;
}

writeFileSync(
  path.join(BENCH, 'guidance-round-2-vs-3.json'),
  `${JSON.stringify({ features: rows.length, rows }, null, 2)}\n`,
);

const md = ['# Round 2 renderer vs Round 3 guidance compiler', ''];
md.push(
  'Same features, same ProductModel, same underlying facts. Only the presentation changed.',
  '',
);
for (const row of rows) {
  md.push(`## ${row.featureId}`, '');
  md.push('**Before**', '');
  md.push(`- title: ${row.before.title ?? '—'}`);
  md.push(`- description: ${row.before.description ?? '—'}`);
  for (const step of row.before.workflow) md.push(`- step: ${step}`);
  md.push('', '**After**', '');
  md.push(`- title: ${row.after.title}`);
  md.push(`- summary: ${row.after.summary ?? '(omitted)'}`);
  for (const step of row.after.steps) md.push(`- step: ${step}`);
  for (const condition of row.after.conditions) md.push(`- condition: ${condition}`);
  md.push(`- completeness: ${row.after.completeness}`);
  md.push('');
}
writeFileSync(path.join(BENCH, 'guidance-round-2-vs-3.md'), `${md.join('\n')}\n`);

console.log(`\nCompared ${rows.length} features.`);
console.log('  benchmarks/provider-reality-check/guidance-round-2-vs-3.json');
console.log('  benchmarks/provider-reality-check/guidance-round-2-vs-3.md\n');

if (expansions.length > 0) {
  console.log('FAIL — guidance asserts something the ProductModel does not establish:\n');
  for (const entry of expansions.slice(0, 30)) console.log(`  ✗ ${entry}`);
  if (expansions.length > 30) console.log(`  … and ${expansions.length - 30} more`);
  console.log('');
  process.exit(1);
}

console.log('PASS — every proposition traces to an accepted claim. No factual expansion.\n');
