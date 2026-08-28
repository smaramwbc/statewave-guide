/**
 * Whether observed behaviour reaches the Product Model, and only where allowed.
 *
 * The loop's question is whether a browser can add to product truth without
 * lowering the bar. That has two failure directions and this checks both.
 *
 * Evidence must not be *lost*: an accepted record that quietly fails to become a
 * claim is a capability the product has and the guide will never mention, and
 * nothing else in the suite would notice. And evidence must not be *laundered*:
 * a refused record must leave no trace, the static claims must survive
 * byte-identical, and no runtime claim may appear for a control its feature does
 * not own — ownership is not relaxed because the proof arrived from a browser.
 *
 * Usage:
 *   pnpm test:runtime-productmodel-integration
 *
 * @packageDocumentation
 */

import path from 'node:path';
import process from 'node:process';
import { computeFeatureScope, buildEvidencePack } from '../packages/semantic/dist/index.js';
import { isVerifiedClaim } from '../packages/shared/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const loaded = await loadEverything(ROOT);
const { enriched, accepted, refused, contradictions } = enrich(loaded);

const failures = [];
const runtimeClaims = enriched.claims.filter((claim) => claim.status === 'behaviorally_verified');

// Every acceptance is in the model exactly once.
if (runtimeClaims.length !== accepted.length) {
  failures.push(`${accepted.length} records accepted but ${runtimeClaims.length} claims appeared`);
}
const ids = new Set(runtimeClaims.map((claim) => claim.id));
if (ids.size !== runtimeClaims.length) failures.push('two runtime claims share an id');

// Every refusal is absent from the model. Checked by subject and action rather
// than by id, because a refused record that came back under a different id is
// exactly the laundering this is here to catch.
for (const entry of [...refused, ...contradictions]) {
  const leaked = runtimeClaims.find(
    (claim) =>
      claim.assertion?.subjectRef === entry.record.subjectRef &&
      claim.assertion?.action === entry.record.action,
  );
  if (leaked !== undefined) {
    failures.push(
      `${entry.record.traceId} was refused (${entry.reason}) and appears as ${leaked.id}`,
    );
  }
}
for (const refusal of loaded.runtime.refusals) {
  const leaked = runtimeClaims.find(
    (claim) => claim.assertion?.subjectRef === `element:${refusal.featureId}`,
  );
  if (leaked !== undefined) {
    failures.push(
      `${refusal.traceId} failed its rule (${refusal.reason}) and appears as ${leaked.id}`,
    );
  }
}

// The static half is untouched, in content and in order.
const staticBefore = JSON.stringify(loaded.model.claims);
const staticAfter = JSON.stringify(
  enriched.claims.filter((c) => c.status !== 'behaviorally_verified'),
);
if (staticBefore !== staticAfter) failures.push('the frozen static claims changed');

// Ownership still decides, whatever the evidence was.
const scopes = new Map();
for (const claim of runtimeClaims) {
  let scope = scopes.get(claim.featureId);
  if (scope === undefined) {
    const candidate = loaded.candidates.find((entry) => entry.id === claim.featureId);
    if (candidate === undefined) {
      failures.push(`${claim.id} names a feature that does not exist`);
      continue;
    }
    const pack = buildEvidencePack(loaded.graph, candidate);
    scope = computeFeatureScope({
      featureId: claim.featureId,
      roots: candidate.rootNodes,
      nodes: pack.nodes,
      relationships: pack.relationships,
    });
    scopes.set(claim.featureId, scope);
  }
  const subject = claim.assertion?.subjectRef;
  if (subject === undefined) {
    failures.push(`${claim.id} asserts nothing`);
    continue;
  }
  if (scope.classify(subject) !== 'OWNED') {
    failures.push(`${claim.id} claims ${subject}, which ${claim.featureId} does not own`);
  }
  if (!isVerifiedClaim(claim)) failures.push(`${claim.id} is not treated as verified`);
}

const say = (line = '') => console.log(line);
say('\nRuntime → ProductModel integration\n');
say(`  records offered                      ${loaded.runtime.records.length}`);
say(`  accepted as claims                   ${accepted.length}`);
say(`  refused by integration               ${refused.length}`);
say(`  contradicted a static claim          ${contradictions.length}`);
say(`  refused earlier, by a rule           ${loaded.runtime.refusals.length}`);
say('');
say(`  static claims                        ${loaded.model.claims.length} (unchanged)`);
say(`  behaviourally verified claims        ${runtimeClaims.length}`);
say(`  total                                ${enriched.claims.length}`);
say('');
for (const entry of accepted) {
  say(`    ✓ ${entry.record.action.padEnd(9)} ${entry.record.subjectRef}`);
}
for (const refusal of loaded.runtime.refusals) {
  say(
    `    ✗ ${String(refusal.proposed).padEnd(9)} element:${refusal.featureId}  ${refusal.reason}`,
  );
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — observed behaviour entered the model on terms static evidence does not get.\n');
  process.exit(1);
}
say('\nPASS — every acceptance became one owned claim, and every refusal became none.\n');
