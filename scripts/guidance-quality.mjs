/**
 * The deterministic gate on compiled guidance.
 *
 * Everything measured here was a real defect found by a human-facing review,
 * and every one of them is machine-detectable — which is the argument for
 * checking it before a reviewer is asked to. Someone reading twenty-one
 * features should be spending their attention on whether the help is *useful*,
 * not on catching a doubled noun phrase that a regular expression finds in a
 * millisecond.
 *
 * The four hard targets are zero, and they are zero for different reasons:
 *
 * - **Internal vocabulary.** `verified`, `claim`, `evidence`, `capability` are
 *   how we talk about our own confidence. A user reading them learns something
 *   about our architecture and nothing about the product.
 * - **Raw identifiers.** `clients.create` is an address. It leaked as grammar,
 *   producing `update a client detail rename`.
 * - **Malformed repetition.** `the invoices create form form` came from a
 *   template with an identifier dropped into it twice.
 * - **Unsupported propositions.** The invariant this project is built on. It
 *   now applies to the compiler as well as the renderer.
 *
 * Usage:
 *   pnpm test:guidance-quality
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
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

/**
 * Words that describe our confidence rather than the product.
 *
 * `route` and `capability` are deliberately here even though an application
 * might legitimately use either word: if one ever does, the exception belongs in
 * that application's configuration, not in a default that lets our vocabulary
 * through everywhere else.
 */
const INTERNAL_VOCABULARY = [
  'verified',
  'unverified',
  'structurally',
  'semantically grounded',
  'productclaim',
  'claim',
  'evidence',
  'verifier',
  'graph node',
  'feature scope',
  'unsupported rule',
  'capability',
  'assertion',
];

/** A dotted or dashed lowercase token: what a semantic identifier looks like. */
const IDENTIFIER_SHAPE = /\b[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,}\b/;

/** A permission identifier: `clients:create`. */
const PERMISSION_SHAPE = /\b[a-z][a-z0-9-]*:[a-z][a-z0-9-]*\b/;

/** The same noun twice in a row — `form form`, `client client`. */
const DOUBLED_WORD = /\b(\w+)\s+\1\b/i;

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const failures = [];
const metrics = {
  features: 0,
  internalVocabularyLeaks: 0,
  identifierLeaks: 0,
  permissionIdLeaks: 0,
  malformedPhrases: 0,
  emptyFillerSections: 0,
  propositionsWithoutProvenance: 0,
  stepsWithoutProvenance: 0,
  passiveContainerSteps: 0,
  invalidWorkflowOrder: 0,
  contradictions: 0,
};
const completeness = {};

/** Every user-visible string one document would put in front of a reader. */
function userVisibleStrings(document) {
  const out = [];
  if (document.title?.text) out.push(document.title.text);
  if (document.summary?.text) out.push(document.summary.text);
  if (document.purpose?.text) out.push(document.purpose.text);
  for (const step of document.steps) {
    const text = realiseInstruction(step.proposition);
    if (text) out.push(text);
  }
  for (const condition of document.conditions) {
    const text = tryRealise(condition.proposition);
    if (text) out.push(text);
  }
  for (const question of document.questions) out.push(question.text);
  return out;
}

for (const feature of captured.model.features) {
  const document = compileGuidance({ model: captured.model, feature, graph });
  metrics.features += 1;
  completeness[document.completeness] = (completeness[document.completeness] ?? 0) + 1;

  const strings = userVisibleStrings(document);

  for (const text of strings) {
    const lower = text.toLowerCase();

    for (const word of INTERNAL_VOCABULARY) {
      if (lower.includes(word)) {
        metrics.internalVocabularyLeaks += 1;
        failures.push(`${feature.id}: internal vocabulary "${word}" in "${text}"`);
        break;
      }
    }

    // A quoted span is text the user can see on screen; an application may
    // legitimately label a control `clients.create`, however unwise. Only
    // unquoted prose is checked.
    const unquoted = text.replace(/"[^"]*"/g, '');
    if (IDENTIFIER_SHAPE.test(unquoted)) {
      metrics.identifierLeaks += 1;
      failures.push(`${feature.id}: identifier shape in "${text}"`);
    }
    if (PERMISSION_SHAPE.test(unquoted)) {
      metrics.permissionIdLeaks += 1;
      failures.push(`${feature.id}: permission identifier in "${text}"`);
    }
    if (DOUBLED_WORD.test(text)) {
      metrics.malformedPhrases += 1;
      failures.push(`${feature.id}: doubled word in "${text}"`);
    }
  }

  // A heading with nothing under it. Day 2 produced workflow sections holding a
  // single restatement of the feature's own name.
  if (
    document.steps.length === 0 &&
    document.summary === undefined &&
    document.purpose === undefined
  ) {
    if (document.completeness !== 'IDENTIFICATION_ONLY' && document.completeness !== 'EMPTY') {
      metrics.emptyFillerSections += 1;
      failures.push(`${feature.id}: a document with no content is not classified as empty`);
    }
  }

  for (const step of document.steps) {
    if (step.provenance.claims.length === 0 && step.provenance.facts.length === 0) {
      metrics.stepsWithoutProvenance += 1;
      failures.push(`${feature.id}: a step cites nothing`);
    }
    if (step.kind === 'action' && step.role === 'container') {
      metrics.passiveContainerSteps += 1;
      failures.push(`${feature.id}: a container was rendered as an action`);
    }
  }

  for (const key of ['summary', 'purpose']) {
    const sentence = document[key];
    if (sentence === undefined) continue;
    if (sentence.provenance.claims.length === 0 && sentence.provenance.facts.length === 0) {
      metrics.propositionsWithoutProvenance += 1;
      failures.push(`${feature.id}: ${key} cites nothing`);
    }
  }

  // Roles must appear in the order a person performs them.
  const order = ['entry', 'trigger', 'container', 'input', 'confirmation', 'result'];
  let previous = -1;
  for (const step of document.steps) {
    const rank = order.indexOf(step.role);
    if (rank < previous) {
      metrics.invalidWorkflowOrder += 1;
      failures.push(`${feature.id}: step roles are out of order at step ${step.index}`);
      break;
    }
    previous = rank;
  }

  // Nothing may both disclaim knowledge and describe behaviour.
  const disclaims = strings.some((text) =>
    /nothing (is|was) known|could not be (established|verified)/i.test(text),
  );
  const describes = document.summary !== undefined || document.steps.length > 0;
  if (disclaims && describes) {
    metrics.contradictions += 1;
    failures.push(
      `${feature.id}: disclaims knowledge and describes behaviour in the same document`,
    );
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const say = (line = '') => console.log(line);
say('\nGuidance compilation quality\n');
say(`  features compiled                    ${metrics.features}`);
say('');
say('  Hard targets (all must be zero)\n');
const hard = [
  ['internal vocabulary in user copy', metrics.internalVocabularyLeaks],
  ['semantic identifiers in prose', metrics.identifierLeaks],
  ['permission identifiers in user copy', metrics.permissionIdLeaks],
  ['malformed repeated phrases', metrics.malformedPhrases],
  ['propositions without provenance', metrics.propositionsWithoutProvenance],
  ['steps without provenance', metrics.stepsWithoutProvenance],
  ['passive containers rendered as actions', metrics.passiveContainerSteps],
  ['workflows in invalid action order', metrics.invalidWorkflowOrder],
  ['documents that disclaim and describe', metrics.contradictions],
  ['empty filler sections', metrics.emptyFillerSections],
];
for (const [label, value] of hard) {
  say(`    ${value === 0 ? '✓' : '✗'} ${label.padEnd(42)} ${value}`);
}

say('\n  Completeness\n');
for (const level of ['EMPTY', 'IDENTIFICATION_ONLY', 'DESCRIPTIVE', 'ACTIONABLE', 'COMPLETE']) {
  const count = completeness[level] ?? 0;
  say(`    ${level.padEnd(20)} ${String(count).padStart(3)}  ${'█'.repeat(count)}`);
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures.slice(0, 30)) say(`    ✗ ${failure}`);
  if (failures.length > 30) say(`    … and ${failures.length - 30} more`);
  say('\nFAIL — guidance compilation put something in user copy that does not belong there.\n');
  process.exit(1);
}

say('\nPASS — no internal vocabulary, no identifiers, no unprovenanced guidance.\n');
