/**
 * Whether verified actions reach the guide, and where they go when they do not.
 *
 * The Round 3 review found ten of twenty-one features missing an action the
 * Product Model already held. The defect was not that steps were dropped —
 * some should be — but that they were dropped *silently*, so a whole class of
 * missing guidance looked from the inside like a feature with nothing to say.
 * A metric that only counted what was emitted could not have found it.
 *
 * So this counts both halves. Every verified action claim is followed to one of
 * two ends: a step in the guide, or a named reason. There is no third outcome,
 * and a claim reaching neither fails the gate.
 *
 * **Retention** deliberately excludes de-duplicated claims. A capability, a
 * workflow step and a submit claim naming the same button are three claims and
 * one user action, and counting the two that collapsed as losses would penalise
 * the pipeline for not telling somebody to press the same control three times.
 *
 * Usage:
 *   pnpm test:workflow-selection-quality
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
  realiseInstruction,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const model = captured.model;

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const candidates = discoverFeatureCandidates(graph);

const failures = [];
const metrics = {
  features: 0,
  verifiedActionClaims: 0,
  resolvedActionTargets: 0,
  emittedActionSteps: 0,
  droppedActionClaims: 0,
  deduplicated: 0,
};
const dropReasons = {};
const completeness = {};
const taskCompletion = {};

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
  completeness[document.completeness] = (completeness[document.completeness] ?? 0) + 1;
  taskCompletion[document.taskCompletion] = (taskCompletion[document.taskCompletion] ?? 0) + 1;

  for (const entry of document.actionAccounting) {
    metrics.verifiedActionClaims += 1;
    if (entry.targetNodeId !== undefined) metrics.resolvedActionTargets += 1;

    if (entry.outcome === 'emitted') {
      metrics.emittedActionSteps += 1;
      continue;
    }

    metrics.droppedActionClaims += 1;
    if (entry.reason === undefined) {
      failures.push(`${feature.id}: an action claim was dropped without a reason`);
      continue;
    }
    dropReasons[entry.reason] = (dropReasons[entry.reason] ?? 0) + 1;
    if (entry.reason === 'DUPLICATE_ACTION') metrics.deduplicated += 1;

    // A claim that resolved to a control and is not a duplicate must appear.
    // This is the Round 3 defect stated as a check.
    if (entry.targetNodeId !== undefined && entry.reason !== 'DUPLICATE_ACTION') {
      failures.push(
        `${feature.id}: ${entry.claimId} resolved to ${entry.targetNodeId} and was dropped anyway (${entry.reason})`,
      );
    }
  }

  // No step may repeat another.
  const steps = document.steps.map((step) => realiseInstruction(step.proposition));
  if (new Set(steps).size !== steps.length) {
    failures.push(`${feature.id}: the same instruction appears more than once`);
  }

  // `ACTIONABLE` must mean a task action, not a synthesised entry.
  const task = document.steps.filter((step) => step.origin !== 'synthetic-entry');
  if (
    (document.completeness === 'ACTIONABLE' || document.completeness === 'COMPLETE') &&
    task.length === 0
  ) {
    failures.push(`${feature.id}: classified ${document.completeness} with no task action`);
  }
  if (document.completeness === 'ENTRY_ONLY' && task.length > 0) {
    failures.push(`${feature.id}: classified ENTRY_ONLY with ${task.length} task action(s)`);
  }
}

const retainable = metrics.resolvedActionTargets - metrics.deduplicated;
const retention = retainable === 0 ? 1 : metrics.emittedActionSteps / retainable;

const say = (line = '') => console.log(line);
say('\nWorkflow action selection\n');
say(`  features compiled                    ${metrics.features}`);
say('');
say(`  verified action claims               ${metrics.verifiedActionClaims}`);
say(`  resolved action targets              ${metrics.resolvedActionTargets}`);
say(`  emitted action steps                 ${metrics.emittedActionSteps}`);
say(`  dropped action claims                ${metrics.droppedActionClaims}`);
say('');
say(
  `  action retention                     ${(retention * 100).toFixed(0)}%  (${metrics.emittedActionSteps}/${retainable}, de-duplicated excluded)`,
);

say('\n  Why a claim was dropped\n');
for (const [reason, count] of Object.entries(dropReasons).sort()) {
  say(`    ${reason.padEnd(28)} ${count}`);
}

say('\n  Workflow coverage\n');
const order = ['NO_TASK', 'ENTRY_ONLY', 'PARTIAL', 'TERMINAL_ACTION_REACHED', 'COMPLETE_PATH'];
for (const level of order) {
  const count = taskCompletion[level] ?? 0;
  say(`    ${level.padEnd(26)} ${String(count).padStart(3)}  ${'█'.repeat(count)}`);
}

say('\n  Completeness\n');
for (const level of [
  'EMPTY',
  'IDENTIFICATION_ONLY',
  'DESCRIPTIVE',
  'ENTRY_ONLY',
  'ACTIONABLE',
  'COMPLETE',
]) {
  const count = completeness[level] ?? 0;
  say(`    ${level.padEnd(26)} ${String(count).padStart(3)}  ${'█'.repeat(count)}`);
}

const withTask =
  (taskCompletion['PARTIAL'] ?? 0) +
  (taskCompletion['TERMINAL_ACTION_REACHED'] ?? 0) +
  (taskCompletion['COMPLETE_PATH'] ?? 0);
say('');
say(`  features with at least one task action  ${withTask}/${metrics.features}`);
say(
  `  features reaching a terminal action     ${(taskCompletion['TERMINAL_ACTION_REACHED'] ?? 0) + (taskCompletion['COMPLETE_PATH'] ?? 0)}/${metrics.features}`,
);
say(
  `  features with a complete known path     ${taskCompletion['COMPLETE_PATH'] ?? 0}/${metrics.features}`,
);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures.slice(0, 30)) say(`    ✗ ${failure}`);
  if (failures.length > 30) say(`    … and ${failures.length - 30} more`);
  say('\nFAIL — a verified action was lost, or a classification does not match its steps.\n');
  process.exit(1);
}

say('\nPASS — every verified action claim reached a step or a named reason.\n');
