/**
 * The enriched ProductModel: static claims, plus what a browser watched.
 *
 * One model, not two. Runtime evidence is an additional source for the same
 * claim pipeline, and a runtime-backed claim goes through the same ownership and
 * rule checks a static one does — it simply satisfies them with an observed
 * effect instead of a graph path.
 *
 * Every refusal is returned alongside the acceptances. A record that produced
 * nothing and said nothing would be indistinguishable from a record that was
 * never offered.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createProjectIndexer } from '../../packages/indexer/dist/index.js';
import {
  buildEvidencePack,
  computeFeatureScope,
  discoverFeatureCandidates,
  integrateRuntimeCapability,
} from '../../packages/semantic/dist/index.js';

/** Loads the frozen model, the dataset, the graph and the runtime record. */
export async function loadEverything(root) {
  const BENCH = path.join(root, 'benchmarks', 'provider-reality-check');
  const model = JSON.parse(
    readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'),
  ).model;
  const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
  const runtime = JSON.parse(readFileSync(path.join(BENCH, 'runtime-evidence-v1.json'), 'utf8'));
  const { graph } = await createProjectIndexer({
    root: path.join(root, dataset.fixture),
    config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
  }).index();
  return { model, dataset, runtime, graph, candidates: discoverFeatureCandidates(graph) };
}

/**
 * The model with every accepted runtime capability added.
 *
 * The static claims are copied through untouched and in order, so a
 * static-only comparison against the frozen capture is byte-exact. New claims
 * are appended, sorted, and carry ids that name their origin — a reader seeing
 * `#capability:runtime:1` knows what they are looking at without opening it.
 */
export function enrich({ model, graph, candidates, runtime }) {
  const graphNodeIds = new Set(graph.nodes.map((node) => node.id));
  const accepted = [];
  const refused = [];
  const contradictions = [];

  const ordinals = new Map();
  for (const record of runtime.records) {
    const candidate = candidates.find((entry) => entry.id === record.featureId);
    if (candidate === undefined) {
      refused.push({
        record,
        reason: 'UNMAPPED_SUBJECT',
        detail: `${record.featureId} is not a discovered feature.`,
      });
      continue;
    }
    const pack = buildEvidencePack(graph, candidate);
    const scope = computeFeatureScope({
      featureId: record.featureId,
      roots: candidate.rootNodes,
      nodes: pack.nodes,
      relationships: pack.relationships,
    });
    const ordinal = (ordinals.get(record.featureId) ?? 0) + 1;
    ordinals.set(record.featureId, ordinal);

    const outcome = integrateRuntimeCapability({
      record,
      scope,
      graphNodeIds,
      existingClaims: model.claims.filter((claim) => claim.featureId === record.featureId),
      ordinal,
    });

    if (outcome.status === 'accepted') accepted.push({ record, claim: outcome.claim });
    else if (outcome.status === 'contradiction') contradictions.push({ record, ...outcome });
    else refused.push({ record, reason: outcome.reason, detail: outcome.detail });
  }

  return {
    enriched: { ...model, claims: [...model.claims, ...accepted.map((entry) => entry.claim)] },
    accepted,
    refused,
    contradictions,
  };
}
