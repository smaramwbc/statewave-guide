/**
 * Builds the artefact a human scores Round 2 usefulness from.
 *
 * Usefulness is the one measure in this benchmark that cannot be automated, and
 * the reason is not that it is hard — it is that the only candidate scorer is
 * the thing being scored. A model grading its own product understanding
 * measures agreement with itself, and reporting that number as usefulness would
 * be worse than reporting nothing, because it looks like evidence.
 *
 * So this file writes out what was produced and stops. It carries no suggested
 * score, no ranking, and no ordering that hints at one: features come out in
 * dataset order, which was fixed before any of this ran.
 *
 * Usage:
 *   node scripts/review-artifact.mjs [--out benchmarks/provider-reality-check/review-round-2.json]
 *
 * @packageDocumentation
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import {
  buildEvidencePack,
  computeFeatureScope,
  createDeterministicRenderer,
  discoverFeatureCandidates,
  enrichApplicationGraph,
  planClaimOpportunities,
  renderFeatureDoc,
  resolveProvider,
  DEFAULT_PROVIDERS,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const outPath = flag('out', path.join(BENCH, 'review-round-2.json'));
const providerId = flag('provider', 'anthropic-opus-5');

const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const gold = JSON.parse(readFileSync(path.join(BENCH, 'gold-v1.json'), 'utf8'));

const config = DEFAULT_PROVIDERS.find((entry) => entry.id === providerId);
if (config === undefined) {
  console.error(`Unknown provider ${providerId}.`);
  process.exit(1);
}
const resolved = resolveProvider(config, process.env);
if (resolved.status !== 'ready') {
  console.error(`${providerId} is not configured: ${resolved.reason}`);
  console.error('No review artefact was written, because nothing was generated.');
  process.exit(1);
}

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const candidates = discoverFeatureCandidates(graph);
const known = new Set(candidates.map((entry) => entry.id));
const wanted = dataset.candidates.map((entry) => entry.id ?? entry);

const run = await enrichApplicationGraph({
  graph,
  provider: resolved.provider,
  renderer: createDeterministicRenderer(),
  candidateIds: wanted,
});

const features = [];
for (const entry of dataset.candidates) {
  const id = entry.id ?? entry;
  const candidate = candidates.find((row) => row.id === id);
  const feature = run.model.features.find((row) => row.id === id);
  const goldEntry = gold.features.find((row) => row.featureId === id);
  if (candidate === undefined) continue;

  const pack = buildEvidencePack(graph, candidate);
  const scope = computeFeatureScope({
    featureId: id,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const offered = planClaimOpportunities({
    candidate,
    knownFeatureIds: known,
    pack,
    graph,
    scope,
  });

  const claims = run.model.claims.filter((claim) => claim.featureId === id);
  const workflow = run.model.workflows.find((row) => row.featureId === id);

  features.push({
    featureId: id,
    band: entry.band,
    // What a reviewer needs to judge against, stated before the output so the
    // expectation is read first.
    goldExpectations: goldEntry ?? null,
    scope: scope.summary(),
    opportunitiesOffered: offered.map((row) => ({
      id: row.id,
      type: row.type,
      ...(row.action === undefined ? {} : { action: row.action }),
      subject: row.subjectRef,
      belongsBecause: row.ownershipSummary,
    })),
    acceptedClaims: claims
      .filter((claim) => claim.status !== 'rejected')
      .map((claim) => ({
        type: claim.type,
        ...(claim.assertion?.action === undefined ? {} : { action: claim.assertion.action }),
        status: claim.status,
        text: claim.text,
        // `evidence`, not `evidenceIds`: the claim carries evidence records.
        // Reading the wrong field wrote an empty list for every claim, which left
        // a reviewer with nothing to judge correctness against.
        evidence: (claim.evidence ?? []).map((record) => record.ref),
      })),
    refusedClaims: claims
      .filter((claim) => claim.status === 'rejected')
      .map((claim) => ({
        type: claim.type,
        text: claim.text,
        reason: claim.rejection?.reason ?? null,
      })),
    workflow: workflow?.steps.map((step) => step.text) ?? [],
    renderedDocument:
      feature === undefined ? null : renderFeatureDoc(run.model, feature, { workflows: new Map() }),
    // Deliberately absent: any score, rank, or suggestion of one.
    humanScore: null,
    humanNotes: null,
  });
}

const artefact = {
  round: 'round-2',
  scoredBy: null,
  scoredAt: null,
  rubric: {
    0: 'useless',
    1: 'minimally useful',
    2: 'useful',
    3: 'excellent',
  },
  instructions: [
    'Score each feature 0-3 on whether what was produced would help a person use this product.',
    'Do not score accuracy: everything under acceptedClaims has already been verified against the graph.',
    'A feature that correctly produced almost nothing may still deserve a low score. Say so. Restraint that leaves a user with nothing useful is still nothing useful.',
    'The pipeline that generated this must not score it. If the only available reviewer is the model under test, leave the scores null and record that no independent review happened.',
  ],
  provider: providerId,
  model: resolved.provider.model,
  dataset: `v${dataset.version}`,
  gold: `v${gold.version}`,
  prompt: 'v2',
  features,
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artefact, null, 2)}\n`);
console.log(`Wrote ${features.length} features to ${path.relative(ROOT, outPath)}`);
console.log('Human usefulness score: PENDING. No score was inferred, and none should be.');
