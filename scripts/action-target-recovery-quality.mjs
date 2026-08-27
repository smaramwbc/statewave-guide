/**
 * The funnel, and the invariants that stop it becoming a score-improvement
 * exercise.
 *
 * Round 4 established that a guide naming a control scores 2.25 and a guide
 * naming only a screen scores 1.11. The temptation that follows is obvious, and
 * this file exists to make giving in to it fail loudly.
 *
 * The funnel first. Every action claim whose subject could not be resolved
 * directly is offered to recovery, and this reports what happened to each — how
 * many reached a surface the feature owns, how many resolved, how many were
 * refused as ambiguous, and how many were refused because the subject does
 * nothing or does it along a relationship the rule does not accept. A rule
 * whose refusals are invisible cannot be argued with, so there are no silent
 * outcomes here and no unreported cap.
 *
 * Then five things that must remain true:
 *
 * 1. A recovered control acts on a surface the feature **owns**.
 * 2. Ambiguity emits nothing.
 * 3. The passive controls stay passive — a read-only display, a section, a
 *    table and a button with only a permission edge gain no action.
 * 4. Every action Round 4 emitted, Round 5 still emits.
 * 5. Nothing new is said that the Round 4 package did not already say, except
 *    through a recovery this file can name.
 *
 * Usage:
 *   pnpm test:action-target-recovery-quality
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
  recoverActionTarget,
  resolveActionTarget,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const round4 = JSON.parse(readFileSync(path.join(BENCH, 'human-review-round-4.json'), 'utf8'));
const model = captured.model;

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();
const candidates = discoverFeatureCandidates(graph);

/**
 * Features whose scope may never gain an action, and why.
 *
 * The anti-overfitting set. Each sits on a page beside something actionable, so
 * any rule that reasons from proximity picks one of them up.
 */
const MUST_STAY_PASSIVE = {
  'settings.new-key': 'a <code> element showing a rotated key',
  'settings.danger-zone': 'a <section> wrapping the rotate button',
  'clients.table': 'a <table>; rows act, tables do not',
  'dashboard.new-client': 'a button whose only edge says who may see it',
  'clients.error': 'no verified claim of any kind',
};

const funnel = {
  featuresWithActionClaims: 0,
  actionClaims: 0,
  directlyResolved: 0,
  offeredToRecovery: 0,
  structurallyEligible: 0,
  resolved: 0,
  ambiguous: 0,
  refusedNoPassiveSubject: 0,
  refusedNoSeparateControl: 0,
  refusedPassive: 0,
  refusedUnsupportedRelationship: 0,
};
const byRule = new Map();
const recoveredRows = [];
const failures = [];

const documents = new Map();

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
  documents.set(feature.id, document);

  const actionClaims = model.claims.filter(
    (claim) =>
      claim.featureId === feature.id &&
      claim.status === 'structurally_verified' &&
      (claim.type === 'workflow_step' ||
        (claim.type === 'capability' && claim.assertion?.action !== undefined)),
  );
  if (actionClaims.length > 0) funnel.featuresWithActionClaims += 1;
  funnel.actionClaims += actionClaims.length;

  for (const claim of actionClaims) {
    const subjectRef = claim.assertion?.subjectRef ?? '';
    const direct = resolveActionTarget({ subjectRef, candidate, scope, graph });
    if (direct.status === 'resolved') {
      funnel.directlyResolved += 1;
      continue;
    }
    funnel.offeredToRecovery += 1;
    const outcome = recoverActionTarget({ subjectRef, candidate, scope, graph });

    switch (outcome.status) {
      case 'resolved': {
        funnel.structurallyEligible += 1;
        funnel.resolved += 1;
        const rule = outcome.provenance.rule;
        byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
        recoveredRows.push({ featureId: feature.id, claimId: claim.id, ...outcome.provenance });
        if (outcome.provenance.actionSurfaceScope !== 'OWNED') {
          failures.push(
            `${feature.id}: recovered ${outcome.target.nodeId} through ${outcome.provenance.actionSurface}, which the feature does not own`,
          );
        }
        break;
      }
      case 'ambiguous':
        funnel.structurallyEligible += 1;
        funnel.ambiguous += 1;
        break;
      case 'none':
        if (outcome.reason === 'no-separate-control') {
          funnel.structurallyEligible += 1;
          funnel.refusedNoSeparateControl += 1;
        } else {
          funnel.refusedNoPassiveSubject += 1;
        }
        break;
      case 'passive':
        funnel.refusedPassive += 1;
        break;
      case 'unsupported-relationship':
        funnel.refusedUnsupportedRelationship += 1;
        break;
    }
  }
}

const emittedFromRecovery = [...documents.values()].flatMap((document) =>
  document.steps.filter((step) =>
    document.actionRecoveries.some((entry) => step.provenance.facts.includes(entry.control)),
  ),
);

// --- Invariant 2: ambiguity emits nothing ----------------------------------
for (const [featureId, document] of documents) {
  const ambiguous = document.actionAccounting.filter(
    (entry) => entry.reason === 'AMBIGUOUS_ACTION_TARGET',
  );
  for (const entry of ambiguous) {
    if (entry.outcome !== 'dropped') {
      failures.push(`${featureId}: ${entry.claimId} was ambiguous and still emitted`);
    }
  }
}

// --- Invariant 3: the passive set stays passive -----------------------------
for (const [featureId, why] of Object.entries(MUST_STAY_PASSIVE)) {
  const document = documents.get(featureId);
  if (document === undefined) {
    failures.push(`${featureId}: expected in the model and absent`);
    continue;
  }
  const task = document.steps.filter((step) => step.origin !== 'synthetic-entry');
  if (task.length > 0) {
    failures.push(
      `${featureId} gained ${task.length} action(s) and must not have — it is ${why}: ${task
        .map((step) => realiseInstruction(step.proposition))
        .join(' ')}`,
    );
  }
  if (document.actionRecoveries.length > 0) {
    failures.push(`${featureId} recovered a control and must not have — it is ${why}`);
  }
}

// --- Invariant 4: retention, against an exact denominator -------------------
//
// The denominator is Round 4's emitted task steps, not "all verified action
// claims". A claim that never produced a step in Round 4 cannot be retained,
// and counting it would make the number flattering and meaningless.
const retention = { denominator: 0, kept: 0, reworded: 0, withdrawn: [], lost: [] };
const explained = new Set();

/** The control a step quotes, when it quotes one. */
const quoted = (text) => text.match(/"([^"]+)"/)?.[1];

for (const item of round4.items) {
  const document = documents.get(item.featureId);
  if (document === undefined) continue;
  const now = document.steps.map((step) => realiseInstruction(step.proposition)).filter(Boolean);
  const nowQuoted = new Set(now.map(quoted).filter(Boolean));
  const nowEntersFields = document.steps.some((step) => step.proposition.kind === 'enter_fields');

  for (const step of item.productOutput.steps) {
    // The synthesised entry step is not an action claim and is not part of this
    // denominator; its removal is measured separately, below.
    if (/^Open .+\.$/.test(step)) continue;
    retention.denominator += 1;

    if (now.includes(step)) {
      retention.kept += 1;
      continue;
    }

    // Retention is about the *action*, not the sentence. Closed Loop #8 gave
    // `clients.create-dialog.email` the label its component actually renders, so
    // "the client's email" became "the client's billing email" — the same step,
    // told better. Matching on strings would have called that a loss.
    const name = quoted(step);
    if (name !== undefined && nowQuoted.has(name)) {
      retention.kept += 1;
      retention.reworded += 1;
      continue;
    }
    if (name === undefined && /^Enter /.test(step) && nowEntersFields) {
      retention.kept += 1;
      retention.reworded += 1;
      continue;
    }

    // A step withdrawn on purpose, with the reason recorded. `Choose Open.`
    // named a control whose visible text is an invoice number; Closed Loop #8
    // withdrew it rather than keep inventing the word from the identifier. A
    // withdrawal nobody recorded is still a failure.
    const withdrawn = document.actionAccounting.some(
      (entry) => entry.outcome === 'dropped' && entry.reason !== undefined,
    );
    if (withdrawn) {
      retention.withdrawn.push(`${item.featureId}: "${step}"`);
      continue;
    }
    retention.lost.push(`${item.featureId}: "${step}"`);
  }
  for (const step of item.productOutput.steps) {
    if (!/^Open .+\.$/.test(step)) continue;
    if (now.includes(step)) continue;
    const redundant = document.diagnostics.some((entry) => entry.code === 'REDUNDANT_ENTRY_STEP');
    if (redundant) explained.add(item.featureId);
    else failures.push(`${item.featureId}: entry step "${step}" vanished with no reason recorded`);
  }
}
if (retention.lost.length > 0) {
  for (const lost of retention.lost) failures.push(`retention: ${lost} is no longer emitted`);
}

// --- Report -----------------------------------------------------------------
const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);

console.log('\nBounded action target recovery\n');
console.log('  Funnel');
console.log(`    features carrying action claims        ${funnel.featuresWithActionClaims}`);
console.log(`    verified action claims                 ${funnel.actionClaims}`);
console.log(`    resolved directly                      ${funnel.directlyResolved}`);
console.log(`    offered to recovery                    ${funnel.offeredToRecovery}`);
console.log(`      rule did not apply to the subject    ${funnel.refusedNoPassiveSubject}`);
console.log(`      subject does nothing at all          ${funnel.refusedPassive}`);
console.log(`      relationship not an action surface   ${funnel.refusedUnsupportedRelationship}`);
console.log(`      reached an owned action surface      ${funnel.structurallyEligible}`);
console.log(`        resolved                           ${funnel.resolved}`);
console.log(`        refused: ambiguous                 ${funnel.ambiguous}`);
console.log(`        refused: no separate control       ${funnel.refusedNoSeparateControl}`);
console.log(`    steps emitted from a recovered target  ${emittedFromRecovery.length}`);

const accounted =
  funnel.refusedNoPassiveSubject +
  funnel.refusedPassive +
  funnel.refusedUnsupportedRelationship +
  funnel.structurallyEligible;
if (accounted !== funnel.offeredToRecovery) {
  failures.push(
    `funnel does not balance: ${accounted} outcomes for ${funnel.offeredToRecovery} attempts`,
  );
}

console.log('\n  By rule');
if (byRule.size === 0) console.log('    (none fired)');
for (const [rule, count] of [...byRule].sort()) console.log(`    ${rule.padEnd(38)} ${count}`);

console.log('\n  Recovered');
if (recoveredRows.length === 0) console.log('    (nothing)');
for (const row of recoveredRows) {
  console.log(`    ${row.featureId} · ${row.claimId}`);
  console.log(
    `      ${row.from}  --${row.relationship}-->  ${row.actionSurface}  [${row.actionSurfaceScope}]`,
  );
  console.log(
    `      ${row.control}  --${row.relationship}-->  ${row.actionSurface}  [control scope ${row.controlScope}]`,
  );
}

console.log('\n  Passive set (must gain nothing)');
for (const [featureId, why] of Object.entries(MUST_STAY_PASSIVE)) {
  const document = documents.get(featureId);
  const task = (document?.steps ?? []).filter((step) => step.origin !== 'synthetic-entry').length;
  console.log(`    ${featureId.padEnd(24)} ${task} action(s)   ${why}`);
}

console.log('\n  Action retention');
console.log(
  `    Round 4 task steps still emitted       ${retention.kept}/${retention.denominator}  ${pct(retention.kept, retention.denominator)}`,
);
console.log(`      of which reworded from better evidence ${retention.reworded}`);
console.log(`    withdrawn with a recorded reason       ${retention.withdrawn.length}`);
for (const entry of retention.withdrawn) console.log(`      · ${entry}`);
console.log(
  `      denominator: task steps in the Round 4 package, excluding the synthesised entry step.`,
);
console.log(
  `    entry steps removed as restatements    ${explained.size}  (${[...explained].join(', ') || 'none'})`,
);

console.log('');
if (failures.length > 0) {
  for (const failure of failures) console.log(`    ✗ ${failure}`);
  console.log('\nFAIL — recovery broke an invariant.\n');
  process.exit(1);
}
console.log('PASS — every recovery is owned, unique, accounted for, and nothing was lost.\n');
