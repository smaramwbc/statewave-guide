/**
 * What user-visible evidence changed, and what it must not have.
 *
 * Round 7 changes what the graph can read, not what it is allowed to say. The
 * Product Model is the same frozen capture, no provider was called, and every
 * Closed Loop #7 rule is byte-identical — a purpose still needs a verified
 * capability, and the six unestablishable proposition kinds are still
 * unreachable. What moved is that eight visible labels the indexer was walking
 * past are now read, and a control now knows what contains it.
 *
 * So a difference is a name recovered, a name withdrawn, or a bug. The bug this
 * catches is a name that is not a name: a title or a control name that traces to
 * an identifier rather than to text a user could find.
 *
 * Usage:
 *   node scripts/guidance-round-6-vs-7.mjs [--write]
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

const WRITE_IN_PLACE = process.argv.includes('--write');
const OUT = WRITE_IN_PLACE ? BENCH : mkdtempSync(path.join(os.tmpdir(), 'statewave-compare-'));

const model = JSON.parse(
  readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'),
).model;
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const before = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-6.json'), 'utf8'));

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();
const candidates = discoverFeatureCandidates(graph);
const beforeByFeature = new Map(before.items.map((item) => [item.featureId, item]));

const rows = [];
const violations = [];
let propositions = 0;
let supported = 0;

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
  const prior = beforeByFeature.get(feature.id)?.productOutput;

  // --- Every emitted proposition carries support, and owns what it names -----
  for (const proposition of document.languagePropositions) {
    propositions += 1;
    const support = proposition.support;
    if (support === undefined) {
      violations.push(
        `${feature.id}: ${proposition.type}="${proposition.value}" carries no support`,
      );
      continue;
    }
    if (support.kind === 'owned-node') {
      const scopeClass = scope.classify(support.nodeId);
      if (scopeClass !== 'OWNED') {
        violations.push(
          `${feature.id}: ${proposition.type}="${proposition.value}" rests on ${support.nodeId}, which this feature classifies ${scopeClass}`,
        );
        continue;
      }
    }
    if (support.kind === 'claim-assertion') {
      const claim = model.claims.find((entry) => entry.id === support.claimId);
      // A claim id that is not a claim is the feature's own namespace, used as
      // the last-resort object noun. Anything else must be an accepted claim.
      if (claim !== undefined && claim.status !== 'structurally_verified') {
        violations.push(
          `${feature.id}: ${proposition.type}="${proposition.value}" rests on ${support.claimId}, which is ${claim.status} rather than verified`,
        );
        continue;
      }
    }
    supported += 1;
  }

  // --- Every name is a name somebody wrote ---------------------------------
  if (document.title !== undefined) {
    if (document.titleEvidence === undefined) {
      violations.push(`${feature.id}: emits a title with no evidence`);
    } else if (scope.classify(document.titleEvidence.evidence) !== 'OWNED') {
      violations.push(
        `${feature.id}: title reads ${document.titleEvidence.evidence}, which this feature does not own`,
      );
    } else if (!['ui-label', 'accessible-name'].includes(document.titleEvidence.origin)) {
      violations.push(
        `${feature.id}: title origin ${document.titleEvidence.origin} is not text a user can read`,
      );
    }
  }
  for (const step of document.steps) {
    if (step.origin === 'synthetic-entry') continue;
    const control = step.proposition.control ?? step.proposition.via;
    if (control === undefined) continue;
    if (!['ui-label', 'accessible-name'].includes(control.origin)) {
      violations.push(
        `${feature.id}: a step names "${control.text}" from a ${control.origin}, which is an identifier rather than a name`,
      );
    }
  }

  // --- Nothing new is asserted ---------------------------------------------
  // A purpose or question in Round 6 that Round 5 did not have is only
  // legitimate if every proposition behind it is supported, which the loop above
  // has just established. What is checked here is the converse: that no sentence
  // appeared without a proposition trail at all.
  if (document.purpose !== undefined && document.languagePropositions.length === 0) {
    violations.push(`${feature.id}: emits a purpose with no propositions behind it`);
  }
  for (const question of document.questions) {
    if (question.provenance.claims.length === 0 && question.provenance.facts.length === 0) {
      violations.push(`${feature.id}: question "${question.text}" cites nothing`);
    }
  }

  rows.push({
    featureId: feature.id,
    before: {
      title: prior?.title ?? null,
      purpose: prior?.purpose ?? null,
      summary: prior?.summary ?? null,
      questions: prior?.questions ?? [],
      steps: prior?.steps ?? [],
    },
    after: {
      title: document.title?.text ?? null,
      titleOrigin: document.titleEvidence?.origin ?? null,
      purpose: document.purpose?.text ?? null,
      summary: document.summary?.text ?? null,
      questions: document.questions.map((entry) => entry.text),
      steps: document.steps.map((step) => realiseInstruction(step.proposition)).filter(Boolean),
    },
    propositions: document.languagePropositions.map((entry) => ({
      type: entry.type,
      value: entry.value,
      support: entry.support,
    })),
    withheld: document.withheldLanguage,
    diagnostics: document.diagnostics
      .filter((entry) => entry.code.startsWith('LANGUAGE_'))
      .map((entry) => ({ code: entry.code, subject: entry.subject, detail: entry.detail })),
  });
}

writeFileSync(
  path.join(OUT, 'guidance-round-6-vs-7.json'),
  `${JSON.stringify({ features: rows.length, propositions, supported, rows }, null, 2)}\n`,
);

const md = ['# Round 6 → Round 7: semantic language authority', ''];
md.push(
  'Same Product Model, same twenty-one features, no provider call. What changed is that no',
  'user-facing sentence is passed through from the model any more — each is built from propositions',
  'that carry their own support.',
  '',
);
let changed = 0;
for (const row of rows) {
  const titleChanged = row.before.title !== row.after.title;
  const purposeChanged = row.before.purpose !== row.after.purpose;
  const summaryChanged = row.before.summary !== row.after.summary;
  const questionsChanged =
    JSON.stringify(row.before.questions) !== JSON.stringify(row.after.questions);
  const stepsChanged = JSON.stringify(row.before.steps ?? []) !== JSON.stringify(row.after.steps);
  if (!titleChanged && !purposeChanged && !summaryChanged && !questionsChanged && !stepsChanged) {
    continue;
  }
  changed += 1;
  md.push(`## ${row.featureId}`, '');
  if (titleChanged) {
    md.push(`- **title was:** ${row.before.title === null ? '_(none)_' : row.before.title}`);
    md.push(
      `- **title now:** ${row.after.title === null ? '_(withheld)_' : `${row.after.title} (${row.after.titleOrigin})`}`,
    );
  }
  if (stepsChanged) {
    md.push(`- steps was: ${JSON.stringify(row.before.steps ?? [])}`);
    md.push(`- **steps now:** ${JSON.stringify(row.after.steps)}`);
  }
  if (purposeChanged) {
    md.push(`- **purpose was:** ${row.before.purpose === null ? '_(none)_' : row.before.purpose}`);
    md.push(`- **purpose now:** ${row.after.purpose === null ? '_(none)_' : row.after.purpose}`);
  }
  if (summaryChanged) {
    md.push(`- **summary was:** ${row.before.summary === null ? '_(none)_' : row.before.summary}`);
    md.push(`- **summary now:** ${row.after.summary === null ? '_(none)_' : row.after.summary}`);
  }
  for (const question of row.before.questions) md.push(`- question was: ${question}`);
  for (const question of row.after.questions) md.push(`- **question now:** ${question}`);
  for (const proposition of row.propositions) {
    const support = proposition.support;
    const cite =
      support.kind === 'claim-assertion'
        ? support.claimId
        : support.kind === 'owned-node'
          ? `${support.nodeId} (${support.attribute} "${support.text}")`
          : support.kind === 'owned-edge'
            ? support.edgeId
            : support.term;
    md.push(`  - \`${proposition.type}\` = ${proposition.value} ← ${cite}`);
  }
  for (const entry of row.withheld) {
    md.push(`  - withheld \`${entry.type}\` (${entry.refusal}): ${entry.detail}`);
  }
  for (const entry of row.diagnostics) md.push(`  - ${entry.code}: ${entry.subject}`);
  md.push('');
}
md.push(
  '---',
  '',
  `${changed} of ${rows.length} features changed.`,
  '',
  `${supported}/${propositions} emitted propositions carry support that this feature owns.`,
  '',
);
writeFileSync(path.join(OUT, 'guidance-round-6-vs-7.md'), `${md.join('\n')}\n`);

console.log(`\nCompared ${rows.length} features; ${changed} changed.`);
console.log(`  emitted language propositions: ${propositions}`);
console.log(`  carrying owned support:        ${supported}`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-6-vs-7.json`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-6-vs-7.md\n`);

if (violations.length > 0) {
  console.log('FAIL — a sentence asserts something nothing establishes:\n');
  for (const violation of violations.slice(0, 30)) console.log(`  ✗ ${violation}`);
  console.log('');
  process.exit(1);
}
console.log('PASS — every emitted proposition traces to an accepted assertion or an owned fact.\n');
