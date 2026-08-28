/**
 * Whether a claim remembers the conditions it was true under.
 *
 * A runtime observation is only ever true of one run: one route, one seeded
 * data set, one set of permissions, one set of flags. "You can delete a client"
 * observed as an administrator is not a fact about the product, it is a fact
 * about administrators — and the moment that context is dropped, the claim reads
 * as universal and the guide will tell a read-only user to press a button they
 * cannot see.
 *
 * So the context travels with the claim, unmodified, and the language compiled
 * from it may not out-run it. The last check below is the one that matters:
 * nothing a runtime claim produces may state a permission, because the run
 * observed what *one* permission set could do and never established that the
 * permission was required.
 *
 * Usage:
 *   pnpm test:runtime-context-preservation
 *
 * @packageDocumentation
 */

import path from 'node:path';
import process from 'node:process';
import {
  buildEvidencePack,
  compileGuidance,
  computeFeatureScope,
} from '../packages/semantic/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const loaded = await loadEverything(ROOT);
const { enriched } = enrich(loaded);

const traces = new Map(loaded.runtime.records.map((record) => [record.traceId, record]));
const runtimeClaims = enriched.claims.filter((claim) => claim.status === 'behaviorally_verified');
const failures = [];

for (const claim of runtimeClaims) {
  const record = traces.get(claim.runtimeTraceId);
  if (record === undefined) continue;
  const kept = claim.runtimeContext;
  if (kept === undefined) {
    failures.push(`${claim.id} dropped the context it was observed under`);
    continue;
  }
  if (JSON.stringify(kept) !== JSON.stringify(record.context)) {
    failures.push(`${claim.id} carries a context that differs from trace ${claim.runtimeTraceId}`);
  }
  if (typeof kept.route !== 'string' || kept.route.length === 0) {
    failures.push(`${claim.id} does not say which screen it was observed on`);
  }
  if (!Array.isArray(kept.permissions)) {
    failures.push(`${claim.id} does not say which permissions were granted`);
  }
}

// Nothing compiled from a runtime claim may assert a permission.
const byFeature = new Map();
for (const claim of runtimeClaims) {
  byFeature.set(claim.featureId, [...(byFeature.get(claim.featureId) ?? []), claim]);
}
let checked = 0;
for (const [featureId, claims] of byFeature) {
  const feature = enriched.features.find((entry) => entry.id === featureId);
  const candidate = loaded.candidates.find((entry) => entry.id === featureId);
  if (feature === undefined || candidate === undefined) continue;
  const pack = buildEvidencePack(loaded.graph, candidate);
  const scope = computeFeatureScope({
    featureId,
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
  const runtimeIds = new Set(claims.map((claim) => claim.id));

  for (const surface of [...document.steps, ...document.conditions]) {
    const cited = surface.provenance?.claims ?? [];
    if (!cited.some((id) => runtimeIds.has(id))) continue;
    checked += 1;
    const permission = (surface.provenance?.facts ?? []).find((ref) =>
      ref.startsWith('permission:'),
    );
    if (permission !== undefined) {
      failures.push(
        `${featureId}: a runtime-backed surface asserts ${permission}, which no run established as required`,
      );
    }
  }
  for (const proposition of document.languagePropositions ?? []) {
    const support = proposition.support;
    if (support.kind !== 'claim-assertion' || !runtimeIds.has(support.claimId)) continue;
    checked += 1;
  }
}

const say = (line = '') => console.log(line);
say('\nRuntime context preservation\n');
say(`  behavioural claims                   ${runtimeClaims.length}`);
say(
  `  carrying a full context              ${runtimeClaims.filter((c) => c.runtimeContext !== undefined).length}`,
);
say(`  compiled surfaces traced back        ${checked}`);
say('');
for (const claim of runtimeClaims) {
  const context = claim.runtimeContext ?? {};
  say(
    `    ${claim.id.padEnd(44)} ${String(context.route).padEnd(14)} ${(context.permissions ?? []).length} permission(s)`,
  );
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — a claim outlived the conditions that made it true.\n');
  process.exit(1);
}
say('\nPASS — every behavioural claim carries its run, and none out-runs it.\n');
