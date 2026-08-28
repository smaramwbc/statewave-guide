/**
 * Whether a runtime-backed claim can be traced back to the thing that saw it.
 *
 * A claim nobody can re-derive is not evidence, it is an assertion with a
 * citation format. So every behaviourally verified claim has to name the trace
 * it came from, the rule that accepted it, the graph it was correlated against,
 * and the observed effects themselves — and a reader has to be able to find that
 * trace in the committed record and get the same answer.
 *
 * The direction that matters most is the one that looks like a technicality:
 * runtime evidence must never be mistakable for static evidence. Both end up in
 * the same `evidence` array, and if a runtime effect could sit there labelled
 * `static`, then "the graph proves this" and "a browser once did this" become
 * the same sentence to every consumer downstream. They are not the same
 * sentence. One is true of the code; the other is true of one run.
 *
 * Usage:
 *   pnpm test:runtime-claim-provenance
 *
 * @packageDocumentation
 */

import path from 'node:path';
import process from 'node:process';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const loaded = await loadEverything(ROOT);
const { enriched } = enrich(loaded);

const runtimeClaims = enriched.claims.filter((claim) => claim.status === 'behaviorally_verified');
const traces = new Map(loaded.runtime.records.map((record) => [record.traceId, record]));
const failures = [];
let effects = 0;

for (const claim of runtimeClaims) {
  const traceId = claim.runtimeTraceId;
  if (traceId === undefined) {
    failures.push(`${claim.id} names no trace`);
    continue;
  }
  const record = traces.get(traceId);
  if (record === undefined) {
    failures.push(`${claim.id} cites trace ${traceId}, which is not in the committed record`);
    continue;
  }

  // The claim says what the trace says.
  if (record.action !== claim.assertion?.action) {
    failures.push(
      `${claim.id} asserts ${claim.assertion?.action}; trace ${traceId} observed ${record.action}`,
    );
  }
  if (record.subjectRef !== claim.assertion?.subjectRef) {
    failures.push(
      `${claim.id} names ${claim.assertion?.subjectRef}; trace ${traceId} acted on ${record.subjectRef}`,
    );
  }
  if (record.graphHash !== claim.provenance?.graphHash) {
    failures.push(`${claim.id} was correlated against a different graph than trace ${traceId}`);
  }
  if (claim.generatedBy?.provider !== 'runtime-observation') {
    failures.push(`${claim.id} is attributed to ${claim.generatedBy?.provider ?? 'nothing'}`);
  }

  // Every cited effect is one the trace actually holds, and is labelled runtime.
  const observed = new Set(record.effects);
  if (claim.evidence.length === 0) failures.push(`${claim.id} cites no effect`);
  for (const item of claim.evidence) {
    effects += 1;
    if (item.kind !== 'runtime') {
      failures.push(`${claim.id} cites "${item.ref}" as ${item.kind} evidence, not runtime`);
    }
    if (!observed.has(item.ref)) {
      failures.push(`${claim.id} cites "${item.ref}", which trace ${traceId} did not observe`);
    }
  }
}

// And nothing static may borrow the runtime label.
for (const claim of enriched.claims) {
  if (claim.status === 'behaviorally_verified') continue;
  const borrowed = claim.evidence?.find((item) => item.kind === 'runtime');
  if (borrowed !== undefined) failures.push(`${claim.id} is static and cites runtime evidence`);
  if (claim.runtimeTraceId !== undefined) failures.push(`${claim.id} is static and names a trace`);
}

const say = (line = '') => console.log(line);
say('\nRuntime claim provenance\n');
say(`  behaviourally verified claims        ${runtimeClaims.length}`);
say(`  effects cited                        ${effects}`);
say(
  `  traces resolved                      ${runtimeClaims.filter((c) => traces.has(c.runtimeTraceId)).length}/${runtimeClaims.length}`,
);
say('');
for (const claim of runtimeClaims) {
  say(
    `    ${claim.id.padEnd(44)} ${String(claim.runtimeTraceId).padEnd(16)} ${claim.evidence.length} effect(s)`,
  );
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — a behavioural claim cannot be traced to the observation behind it.\n');
  process.exit(1);
}
say('\nPASS — every behavioural claim names its trace, its rule and its effects.\n');
