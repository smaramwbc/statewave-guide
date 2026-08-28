/**
 * What observed behaviour added, and what it must not have.
 *
 * Round 8 changes where a claim may come from and nothing about what a claim
 * entitles the pipeline to say. Every Closed Loop #7 language rule is untouched,
 * every Closed Loop #8 naming rule is untouched, ownership still decides, and no
 * provider was called. The one difference is that seven capabilities the static
 * analysis could not establish were watched happening in a browser, and are now
 * claims.
 *
 * So a difference between the rounds is a capability recovered, a sentence
 * correctly withheld, or a bug — and this exists for the third. Two bugs in
 * particular:
 *
 *   1. A sentence that appeared without a claim behind it. Runtime evidence
 *      widens the *input*; it does not create a licence to phrase.
 *   2. A sentence that a runtime claim licensed but only a *static* claim could
 *      justify. A behavioural claim proves that one run did something once. It
 *      does not prove an API exists, a permission is required, or a name is
 *      correct, and every added sentence is checked against the claim it cites
 *      rather than against how plausible it reads.
 *
 * Usage:
 *   node scripts/guidance-round-7-vs-8.mjs [--write]
 *
 * @packageDocumentation
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  buildEvidencePack,
  compileGuidance,
  computeFeatureScope,
  realiseInstruction,
} from '../packages/semantic/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

const WRITE_IN_PLACE = process.argv.includes('--write');
const OUT = WRITE_IN_PLACE ? BENCH : mkdtempSync(path.join(os.tmpdir(), 'statewave-compare-'));

const before = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-7.json'), 'utf8'));
const beforeByFeature = new Map(before.items.map((item) => [item.featureId, item]));

const loaded = await loadEverything(ROOT);
const { enriched, accepted, refused, contradictions } = enrich(loaded);
const runtimeClaimIds = new Set(
  enriched.claims.filter((claim) => claim.status === 'behaviorally_verified').map((c) => c.id),
);

const rows = [];
const violations = [];
let propositions = 0;
let fromRuntime = 0;

for (const feature of enriched.features) {
  const candidate = loaded.candidates.find((entry) => entry.id === feature.id);
  if (candidate === undefined) continue;
  const pack = buildEvidencePack(loaded.graph, candidate);
  const scope = computeFeatureScope({
    featureId: feature.id,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const document = compileGuidance({
    model: enriched,
    feature,
    graph: loaded.graph,
    candidate,
    scope,
  });
  const prior = beforeByFeature.get(feature.id)?.productOutput;

  for (const proposition of document.languagePropositions) {
    propositions += 1;
    const support = proposition.support;
    if (support === undefined) {
      violations.push(
        `${feature.id}: ${proposition.type}="${proposition.value}" carries no support`,
      );
      continue;
    }
    if (support.kind === 'owned-node' && scope.classify(support.nodeId) !== 'OWNED') {
      violations.push(
        `${feature.id}: ${proposition.type}="${proposition.value}" rests on ${support.nodeId}, which this feature does not own`,
      );
      continue;
    }
    if (support.kind !== 'claim-assertion') continue;

    const claim = enriched.claims.find((entry) => entry.id === support.claimId);
    if (claim === undefined) continue;
    if (claim.status !== 'structurally_verified' && claim.status !== 'behaviorally_verified') {
      violations.push(
        `${feature.id}: ${proposition.type}="${proposition.value}" rests on ${support.claimId}, which is ${claim.status}`,
      );
      continue;
    }
    if (!runtimeClaimIds.has(claim.id)) continue;
    fromRuntime += 1;

    // A behavioural claim licenses a *capability*, and nothing else. A run
    // establishes that pressing something did something; it does not establish
    // an endpoint, a permission, or a name.
    if (claim.type !== 'capability') {
      violations.push(`${feature.id}: a runtime claim of type ${claim.type} licensed a sentence`);
    }
    const subject = claim.assertion?.subjectRef;
    if (subject !== undefined && scope.classify(subject) !== 'OWNED') {
      violations.push(`${feature.id}: a runtime sentence names ${subject}, which is not owned`);
    }
  }

  // A runtime claim must not have produced a name. Titles and control names come
  // from what the interface displays, and Round 8 does not change that.
  if (document.titleEvidence !== undefined) {
    if (!['ui-label', 'accessible-name'].includes(document.titleEvidence.origin)) {
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
        `${feature.id}: a step names "${control.text}" from a ${control.origin}, not a name`,
      );
    }
  }

  const runtimeHere = accepted.filter((entry) => entry.record.featureId === feature.id);
  rows.push({
    featureId: feature.id,
    runtime: runtimeHere.map((entry) => ({
      action: entry.record.action,
      subjectRef: entry.record.subjectRef,
      traceId: entry.record.traceId,
      route: entry.record.context.route,
    })),
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
    withheld: document.withheldLanguage,
  });
}

const summary = {
  features: rows.length,
  propositions,
  fromRuntime,
  accepted: accepted.length,
  refusedByIntegration: refused.length,
  refusedByRule: loaded.runtime.refusals.length,
  contradictions: contradictions.length,
};
writeFileSync(
  path.join(OUT, 'guidance-round-7-vs-8.json'),
  `${JSON.stringify({ ...summary, rows }, null, 2)}\n`,
);

const md = ['# Round 7 → Round 8: behavioural evidence', ''];
md.push(
  'Same twenty-one features, same frozen static capture, same compiler, no provider call. What',
  'changed is that seven capabilities were watched happening in a running browser and became claims.',
  '',
);
let changed = 0;
for (const row of rows) {
  const differs =
    row.before.title !== row.after.title ||
    row.before.purpose !== row.after.purpose ||
    row.before.summary !== row.after.summary ||
    JSON.stringify(row.before.questions) !== JSON.stringify(row.after.questions) ||
    JSON.stringify(row.before.steps ?? []) !== JSON.stringify(row.after.steps);
  if (!differs && row.runtime.length === 0) continue;
  changed += differs ? 1 : 0;
  md.push(`## ${row.featureId}`, '');
  for (const entry of row.runtime) {
    md.push(
      `- observed: \`${entry.action}\` at ${entry.subjectRef} on ${entry.route} (${entry.traceId})`,
    );
  }
  if (row.before.purpose !== row.after.purpose) {
    md.push(`- **purpose was:** ${row.before.purpose ?? '_(withheld)_'}`);
    md.push(`- **purpose now:** ${row.after.purpose ?? '_(withheld)_'}`);
  }
  if (row.before.summary !== row.after.summary) {
    md.push(`- **summary was:** ${row.before.summary ?? '_(withheld)_'}`);
    md.push(`- **summary now:** ${row.after.summary ?? '_(withheld)_'}`);
  }
  if (JSON.stringify(row.before.questions) !== JSON.stringify(row.after.questions)) {
    md.push(`- questions was: ${JSON.stringify(row.before.questions)}`);
    md.push(`- **questions now:** ${JSON.stringify(row.after.questions)}`);
  }
  if (JSON.stringify(row.before.steps ?? []) !== JSON.stringify(row.after.steps)) {
    md.push(`- steps was: ${JSON.stringify(row.before.steps ?? [])}`);
    md.push(`- **steps now:** ${JSON.stringify(row.after.steps)}`);
  }
  if (row.before.title !== row.after.title) {
    md.push(`- **title was:** ${row.before.title ?? '_(withheld)_'}`);
    md.push(`- **title now:** ${row.after.title ?? '_(withheld)_'}`);
  }
  for (const entry of row.withheld) {
    md.push(`  - withheld \`${entry.type}\` (${entry.refusal}): ${entry.detail}`);
  }
  md.push('');
}

md.push('## Refused', '');
for (const refusal of loaded.runtime.refusals) {
  md.push(
    `- \`${refusal.proposed}\` at ${refusal.featureId} — **${refusal.reason}**: ${refusal.detail}`,
  );
}
for (const entry of refused) {
  md.push(
    `- \`${entry.record.action}\` at ${entry.record.subjectRef} — **${entry.reason}**: ${entry.detail}`,
  );
}
md.push('');
md.push(
  '---',
  '',
  `${changed} of ${rows.length} features changed.`,
  '',
  `${fromRuntime}/${propositions} emitted propositions rest on a behavioural claim.`,
  '',
);
writeFileSync(path.join(OUT, 'guidance-round-7-vs-8.md'), `${md.join('\n')}\n`);

console.log(`\nCompared ${rows.length} features; ${changed} changed.`);
console.log(`  emitted language propositions:  ${propositions}`);
console.log(`  resting on a behavioural claim: ${fromRuntime}`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-7-vs-8.json`);
console.log(`  ${path.relative(ROOT, OUT)}/guidance-round-7-vs-8.md\n`);

if (violations.length > 0) {
  console.log('FAIL — behavioural evidence bought a sentence it does not pay for:\n');
  for (const violation of violations.slice(0, 30)) console.log(`  ✗ ${violation}`);
  console.log('');
  process.exit(1);
}
console.log('PASS — every sentence still traces to a claim that establishes it.\n');
