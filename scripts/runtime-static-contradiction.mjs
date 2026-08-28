/**
 * What happens when the code and the browser disagree.
 *
 * The whole loop rests on runtime evidence being *additional* — it may say
 * something the graph is silent about, and it may not overrule something the
 * graph proves. If the two conflict, neither wins automatically. The static
 * claim was derived from the source; the runtime claim was derived from one run
 * of one build against one seeded data set. Silently preferring either is a
 * decision the pipeline is not entitled to make, so the record is refused and
 * the disagreement is surfaced for a person.
 *
 * The real run finds no conflicts, and that is exactly why a script that only
 * printed "0 contradictions" would be worthless — a detector that never fires
 * and a detector that cannot fire produce the same output. So this feeds the
 * integration deliberately conflicting records and requires each to be refused,
 * then feeds it agreeing ones and requires those to survive. The zero at the
 * end means something only because the mechanism was made to fire first.
 *
 * Usage:
 *   pnpm test:runtime-static-contradiction
 *
 * @packageDocumentation
 */

import path from 'node:path';
import process from 'node:process';
import {
  buildEvidencePack,
  computeFeatureScope,
  integrateRuntimeCapability,
} from '../packages/semantic/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const loaded = await loadEverything(ROOT);
const { contradictions, accepted } = enrich(loaded);
const failures = [];

const graphNodeIds = new Set(loaded.graph.nodes.map((node) => node.id));

/** Runs one record through integration against the real model. */
function integrate(record) {
  const candidate = loaded.candidates.find((entry) => entry.id === record.featureId);
  if (candidate === undefined) return { status: 'refused', reason: 'UNMAPPED_SUBJECT' };
  const pack = buildEvidencePack(loaded.graph, candidate);
  const scope = computeFeatureScope({
    featureId: record.featureId,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  return integrateRuntimeCapability({
    record,
    scope,
    graphNodeIds,
    existingClaims: loaded.model.claims.filter((claim) => claim.featureId === record.featureId),
    ordinal: 99,
  });
}

/**
 * Records built to conflict with a static claim that really exists.
 *
 * Each takes a subject the graph already carries a capability for and asserts
 * the opposed action against it. Nothing here is hypothetical: the static claims
 * named below are in the frozen capture.
 */
function conflicting() {
  const built = [];
  for (const claim of loaded.model.claims) {
    if (claim.status !== 'structurally_verified' || claim.type !== 'capability') continue;
    const action = claim.assertion?.action;
    const subject = claim.assertion?.subjectRef;
    if (subject === undefined) continue;
    const opposite = { delete: 'navigate', create: 'navigate', update: 'navigate' }[action];
    if (opposite === undefined) continue;
    const template = loaded.runtime.records.find((record) => record.action === 'navigate');
    if (template === undefined) continue;
    built.push({
      ...template,
      featureId: claim.featureId,
      subjectRef: subject,
      targets: [subject],
      action: opposite,
      traceId: `synthetic-conflict-${built.length + 1}`,
      rule: `runtime/${opposite}`,
    });
  }
  return built;
}

const probes = conflicting();
if (probes.length === 0) failures.push('no static capability claim was available to conflict with');
let caught = 0;
for (const record of probes) {
  const outcome = integrate(record);
  if (outcome.status === 'contradiction') {
    caught += 1;
    continue;
  }
  if (outcome.status === 'accepted') {
    failures.push(`a run claiming ${record.action} at ${record.subjectRef} overruled the graph`);
  }
  // A refusal for an unrelated reason (ownership, say) is not a contradiction
  // caught; it is the probe failing to reach the check.
}
if (caught === 0)
  failures.push('the contradiction detector did not fire on any conflicting record');

// And the real records still pass, so the check is not merely refusing things.
for (const entry of accepted) {
  const again = integrate(entry.record);
  if (again.status !== 'accepted') {
    failures.push(`${entry.record.traceId} no longer integrates (${again.status})`);
  }
}

const say = (line = '') => console.log(line);
say('\nRuntime vs static contradiction\n');
say(`  conflicting records constructed      ${probes.length}`);
say(`  refused as contradictions            ${caught}`);
say(`  real records still accepted          ${accepted.length}`);
say(`  real contradictions in the record    ${contradictions.length}`);
say('');
for (const entry of contradictions) {
  say(`    ! ${entry.record.subjectRef} — ${entry.detail}`);
}
if (contradictions.length === 0) {
  say('    the graph and the run agree everywhere they both speak.');
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — a run was allowed to overrule the source, or the detector is inert.\n');
  process.exit(1);
}
say('\nPASS — disagreement is refused and reported; agreement passes through.\n');
