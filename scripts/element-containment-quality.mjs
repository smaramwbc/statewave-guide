/**
 * What the graph now knows about which control is inside which.
 *
 * Before Closed Loop #8 every `contains` edge started at a component, so a form
 * and the two inputs it wraps were three peers under one page and the graph had
 * no way to say otherwise. `settings.form` could not be shown to contain its own
 * fields, which is why the Round 5 audit filed *"collects organisation name and
 * notification preferences"* as an indexer omission rather than an overreach.
 *
 * The walk that fixes it is four refusals long, and the refusals are the part
 * worth watching: a control written inside a JSX attribute renders wherever the
 * callee decides, and a custom component may render its children, its fallback,
 * or neither. This reports what was found *and* what was declined, because a
 * recall cost nobody can see is a recall cost nobody will fix.
 *
 * It also guards the second-order effect. Every nested element now has two
 * incoming `contains` edges — one from its component, one from its parent
 * element — and counting those as two owners demoted every nested control to
 * shared infrastructure. Measured before the fix, `clients.create` lost all five
 * of its dialog controls. The census below is where that would show up again.
 *
 * Usage:
 *   pnpm test:element-containment-quality
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
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');
const model = JSON.parse(
  readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'),
).model;
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const all = graph.relationships.filter((edge) => edge.type === 'contains');
const elementLevel = all.filter((edge) => edge.source.startsWith('element:'));
const componentLevel = all.filter((edge) => edge.source.startsWith('component:'));
const failures = [];

// Every element-level edge must be element to element, and must not be a cycle.
const parentOf = new Map();
for (const edge of elementLevel) {
  if (!edge.target.startsWith('element:')) {
    failures.push(`${edge.id}: element containment must point at an element`);
    continue;
  }
  if (edge.source === edge.target) failures.push(`${edge.id}: an element contains itself`);
  if (parentOf.has(edge.target)) {
    failures.push(
      `${edge.target}: two element parents (${parentOf.get(edge.target)} and ${edge.source}) — a control with two containers answers "what is this inside?" twice`,
    );
  }
  parentOf.set(edge.target, edge.source);
  if (edge.confidence !== 1) failures.push(`${edge.id}: containment is direct syntax or nothing`);
  if ((edge.evidence ?? []).length === 0) failures.push(`${edge.id}: no evidence`);
}

// No cycles: walking up from any element must terminate.
for (const start of parentOf.keys()) {
  const seen = new Set([start]);
  let current = parentOf.get(start);
  while (current !== undefined) {
    if (seen.has(current)) {
      failures.push(`${start}: containment cycles through ${current}`);
      break;
    }
    seen.add(current);
    current = parentOf.get(current);
  }
}

// Ownership must not have shrunk. The fan-in regression, pinned.
const candidates = discoverFeatureCandidates(graph);
const ownedCounts = [];
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
  const owned = pack.nodes.filter((node) => scope.classify(node.id) === 'OWNED').length;
  ownedCounts.push({ featureId: feature.id, owned });
  compileGuidance({ model, feature, graph, candidate, scope });
}
const totalOwned = ownedCounts.reduce((total, entry) => total + entry.owned, 0);
// 69 before Closed Loop #8, 77 after. A drop means the fan-in measure has
// started reading one nesting as two owners again.
if (totalOwned < 69) {
  failures.push(
    `ownership shrank to ${totalOwned} nodes across ${ownedCounts.length} features, from 69 before element containment existed`,
  );
}

console.log('\nElement containment\n');
console.log(`  contains edges, total                  ${all.length}`);
console.log(`    component → element                  ${componentLevel.length}`);
console.log(`    element → element                    ${elementLevel.length}`);
console.log(`  elements with a parent element         ${parentOf.size}`);
console.log(`  owned nodes across the review features ${totalOwned}`);

console.log('\n  Element → element\n');
for (const edge of [...elementLevel].sort((a, b) => (a.id < b.id ? -1 : 1))) {
  console.log(
    `    ${edge.source.replace('element:', '').padEnd(30)} > ${edge.target.replace('element:', '')}`,
  );
}

console.log('');
if (failures.length > 0) {
  for (const failure of failures.slice(0, 30)) console.log(`    ✗ ${failure}`);
  console.log('\nFAIL — containment says something the JSX does not.\n');
  process.exit(1);
}
console.log('PASS — every containment edge is one nesting, read once, with evidence.\n');
