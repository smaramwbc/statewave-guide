#!/usr/bin/env node
/**
 * Indexer quality benchmark.
 *
 * Runs the indexer over the realistic fixture and scores it against the
 * hand-written ground truth in `expectations.json`.
 *
 * Two statistical rules govern the output, and they are the reason this is a
 * script rather than a one-line assertion:
 *
 * 1. **Recall is always computable.** The manifest is a subset of truth, so
 *    "how much of what we expected did we find" is always a fair question.
 * 2. **Precision is only computable where the manifest is exhaustive.** If the
 *    manifest lists a *selection* of a category, a node the indexer found that
 *    the manifest does not list is not a false positive — it is simply not
 *    scored. Reporting precision there would invent a number. Those cells print
 *    `—`.
 *
 * Trap violations are not averaged into anything. One is a failure.
 *
 * @see docs/quality.md
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';

const FIXTURE = fileURLToPath(
  new URL('../packages/indexer/test/fixtures/realistic-app', import.meta.url),
);
const INCLUDE = ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'];

const manifest = JSON.parse(readFileSync(`${FIXTURE}/expectations.json`, 'utf8'));

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const started = process.hrtime.bigint();
const { graph } = await createProjectIndexer({
  root: FIXTURE,
  config: { include: INCLUDE, exclude: ['**/__tests__/**', '**/*.test.*'] },
}).index();
const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** A category is exhaustive when the manifest says so in plain words. */
const isExhaustive = (note) => typeof note === 'string' && note.trim().startsWith('complete');

/**
 * Ids the manifest declines to adjudicate.
 *
 * Each `ambiguous` entry states its `acceptableOutcomes` in prose, and those
 * strings name the canonical ids involved — "no element node" versus
 * "element:client-detail.delete-dialog with the provenance of this line". Both
 * outcomes are correct, so the id is excluded from BOTH sides of the score:
 * producing it is not a false positive, and omitting it is not a false negative.
 *
 * Scoring a case the fixture author explicitly refused to adjudicate would be
 * inventing an answer, which is the thing this benchmark exists to avoid.
 */
const ID_IN_PROSE =
  /\b(?:element|function|component|api|route|service|hook|schema|permission|type|file):[^\s,"']+/g;

const ambiguousIds = new Set();
for (const entry of manifest.ambiguous ?? []) {
  for (const outcome of entry.acceptableOutcomes ?? []) {
    for (const id of outcome.match(ID_IN_PROSE) ?? []) ambiguousIds.add(id.replace(/[.;]$/, ''));
  }
}

/** An edge is ambiguous when either endpoint is. */
const relationshipIsAmbiguous = (source, target) =>
  ambiguousIds.has(source) || ambiguousIds.has(target);

function score(expected, found, exhaustive) {
  const expectedSet = new Set(expected.filter((id) => !ambiguousIds.has(id)));
  const foundSet = new Set(found.filter((id) => !ambiguousIds.has(id)));
  const hits = [...expectedSet].filter((id) => foundSet.has(id));
  const missed = [...expectedSet].filter((id) => !foundSet.has(id));
  const extra = [...foundSet].filter((id) => !expectedSet.has(id));

  return {
    expected: expectedSet.size,
    found: foundSet.size,
    /** True positives: expected and found. */
    tp: hits.length,
    /** False positives: found but not expected. Only meaningful when exhaustive. */
    fp: exhaustive ? extra.length : null,
    /** False negatives: expected but not found. */
    fn: missed.length,
    missed,
    extra,
    recall: expectedSet.size === 0 ? null : hits.length / expectedSet.size,
    precision: !exhaustive || foundSet.size === 0 ? null : hits.length / foundSet.size,
  };
}

// --- nodes -----------------------------------------------------------------

/**
 * Built-in framework hooks are scored separately, not removed.
 *
 * `useState` and `useEffect` are real nodes and the graph is right to carry them —
 * `HookNode.builtin` exists precisely so they can be told apart. But they are
 * *framework implementation* knowledge, not *product* knowledge: knowing that a
 * component calls `useState` says nothing about what the product does, while
 * knowing it calls `usePermissions` says a great deal.
 *
 * Averaging them into one number would let 31 uncontroversial React hooks bury
 * the handful of project hooks that actually matter. So they get their own row,
 * and the product rows measure product understanding.
 */
const isBuiltinHook = (node) => node.kind === 'hook' && node.builtin === true;
const builtinHookIds = new Set(graph.nodes.filter(isBuiltinHook).map((node) => node.id));

/** True when a manifest entry itself sits at a declared-ambiguous location. */

const nodeScores = {};
for (const [kind, entries] of Object.entries(manifest.nodes)) {
  const expected = entries.map((entry) => entry.id);
  const found = graph.nodes
    .filter((node) => node.kind === kind && !isBuiltinHook(node))
    .map((node) => node.id);
  nodeScores[kind] = score(expected, found, isExhaustive(manifest.exhaustiveness?.[kind]));
}

// --- relationships ---------------------------------------------------------

const relNote = manifest.exhaustiveness?.relationships ?? '';
/** `calls` is explicitly a selection; the manifest says recall must not be computed from it. */
const nonExhaustiveRelationships = new Set(
  ['calls'].filter((type) => relNote.includes(`\`${type}\``) || relNote.includes(type)),
);

const relKey = (r) => `${r.source}|${r.type}|${r.target}`;
const foundRels = new Map(graph.relationships.map((r) => [relKey(r), r]));

const relScores = {};
const coreOnly = (manifest.relationships ?? []).filter((r) => (r.tier ?? 'core') === 'core');
for (const type of new Set(coreOnly.map((r) => r.type))) {
  const expected = coreOnly
    .filter((r) => r.type === type && !relationshipIsAmbiguous(r.source, r.target))
    .map(relKey);
  // Same split as nodes: an edge into a built-in hook is framework knowledge.
  const found = graph.relationships
    .filter(
      (r) =>
        r.type === type &&
        !builtinHookIds.has(r.target) &&
        !relationshipIsAmbiguous(r.source, r.target),
    )
    .map(relKey);
  relScores[type] = score(expected, found, !nonExhaustiveRelationships.has(type));
}

/** Framework-hook coverage, reported but never mixed into the product scores. */
const builtinHookEdges = graph.relationships.filter((r) => builtinHookIds.has(r.target)).length;

// --- stretch goals ---------------------------------------------------------

const stretch = (manifest.relationships ?? []).filter((r) => r.tier === 'stretch');
const stretchHit = stretch.filter((r) => foundRels.has(relKey(r)));

// --- traps -----------------------------------------------------------------

const matchesWildcard = (pattern, value) =>
  pattern.includes('*')
    ? new RegExp(
        `^${pattern
          .split('*')
          .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
      ).test(value)
    : pattern === value;

/**
 * A trap is violated when a node or edge draws EVIDENCE FROM THE TRAP'S LOCATION —
 * not merely when an id exists.
 *
 * The distinction is the whole point. `api:POST:/api/clients` is a real endpoint
 * with a real call site; the trap says it must not *also* gain a provenance from
 * a documentation string that happens to spell it. Matching on the id alone would
 * report the legitimate node as a false positive and make the trap unpassable.
 * The manifest states this outright: "must not gain a provenance here".
 */
const atTrapLocation = (records, trap) =>
  (records ?? []).some(
    (record) =>
      record?.file === trap.file && (trap.line === undefined || record.line === trap.line),
  );

const trapViolations = [];
for (const trap of manifest.mustNotExist ?? []) {
  if (trap.kind === 'relationship') {
    const hit = graph.relationships.find(
      (r) =>
        r.type === trap.type &&
        (!trap.sourceLike || matchesWildcard(trap.sourceLike, r.source)) &&
        (!trap.targetLike || matchesWildcard(trap.targetLike, r.target)) &&
        (trap.file === undefined || atTrapLocation(r.evidence, trap)),
    );
    if (hit) trapViolations.push({ trap, hit: relKey(hit) });
  } else if (trap.kind === 'node') {
    const hit = graph.nodes.find(
      (n) =>
        trap.idLike &&
        matchesWildcard(trap.idLike, n.id) &&
        (trap.file === undefined || atTrapLocation([...(n.provenances ?? []), n.provenance], trap)),
    );
    if (hit) trapViolations.push({ trap, hit: hit.id });
  }
}

// --- diagnostics -----------------------------------------------------------

const diagnosticExpectations = [
  ...(manifest.expectedUnresolved ?? []),
  ...(manifest.expectedDiagnostics ?? []),
].filter((entry) => entry.expectedDiagnostic);

const diagnosticHits = diagnosticExpectations.filter((entry) =>
  graph.diagnostics.some((d) => d.code === entry.expectedDiagnostic && d.file === entry.file),
);

// --- evidence discipline ---------------------------------------------------

const ALLOWED_CONFIDENCE = [1, 0.95, 0.9];
const noEvidence = graph.relationships.filter((r) => !r.evidence?.length);
const badConfidence = graph.relationships.filter((r) => !ALLOWED_CONFIDENCE.includes(r.confidence));
const inferenceWithoutRule = graph.relationships
  .flatMap((r) => r.evidence ?? [])
  .filter((e) => e.type === 'static-inference' && !e.rule);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pct = (value) =>
  value === null ? '   —' : `${String(Math.round(value * 100)).padStart(3)}%`;
const label = (name) => name.padEnd(18);
const rule = (n = 62) => '-'.repeat(n);

const lines = [];
lines.push('', 'Statewave Guide Indexer Quality', '');
lines.push(`Fixture: ${manifest.fixture}   indexed in ${durationMs.toFixed(0)} ms`, '');

lines.push('Nodes');
lines.push(rule());
for (const [kind, s] of Object.entries(nodeScores).sort()) {
  lines.push(
    `${label(kind)} P ${pct(s.precision)}  R ${pct(s.recall)}   ` +
      `TP ${String(s.tp).padStart(3)}  FP ${String(s.fp ?? '—').padStart(3)}  FN ${String(s.fn).padStart(3)}`,
  );
}

lines.push('', 'Relationships');
lines.push(rule());
for (const [type, s] of Object.entries(relScores).sort()) {
  lines.push(
    `${label(type)} P ${pct(s.precision)}  R ${pct(s.recall)}   ` +
      `TP ${String(s.tp).padStart(3)}  FP ${String(s.fp ?? '—').padStart(3)}  FN ${String(s.fn).padStart(3)}`,
  );
}

lines.push('', 'Framework knowledge (reported, not scored as product understanding)');
lines.push(rule());
lines.push(
  `${label('built-in hooks')} ${builtinHookIds.size} nodes, ${builtinHookEdges} uses_hook edges`,
);
lines.push('  Real nodes, deliberately kept. Excluded from the product rows above because');
lines.push('  "this component calls useState" is not a fact about the product.');

lines.push('', 'Discipline');
lines.push(rule());
lines.push(
  `${label('traps')} ${trapViolations.length} violations of ${(manifest.mustNotExist ?? []).length}`,
);
lines.push(
  `${label('diagnostics')} ${diagnosticHits.length} of ${diagnosticExpectations.length} expected refusals reported`,
);
lines.push(`${label('no evidence')} ${noEvidence.length} relationships`);
lines.push(`${label('bad confidence')} ${badConfidence.length} relationships`);
lines.push(`${label('inference w/o rule')} ${inferenceWithoutRule.length} evidence records`);
lines.push(
  `${label('stretch goals')} ${stretchHit.length} of ${stretch.length} reached (not required)`,
);

lines.push('', 'Notes');
lines.push(rule());
lines.push('  Precision prints — where the manifest is a selection rather than exhaustive:');
lines.push('  a node we found that it does not list is unscored, not a false positive.');
lines.push(`  ${ambiguousIds.size} ids in \`ambiguous\` are excluded from scoring entirely.`);

console.log(lines.join('\n'));

if (process.argv.includes('--json')) {
  const snapshot = {
    nodes: nodeScores,
    relationships: relScores,
    discipline: {
      trapsTotal: (manifest.mustNotExist ?? []).length,
      trapViolations: trapViolations.length,
      trapViolationDetail: trapViolations.map((v) => ({ hit: v.hit, why: v.trap.why })),
      diagnosticsExpected: diagnosticExpectations.length,
      diagnosticsReported: diagnosticHits.length,
      relationshipsWithoutEvidence: noEvidence.length,
      invalidConfidenceValues: badConfidence.length,
      inferencesWithoutRule: inferenceWithoutRule.length,
      integrity: graph.health.integrity,
    },
    stretch: { reached: stretchHit.length, total: stretch.length },
    frameworkKnowledge: { builtinHookNodes: builtinHookIds.size, builtinHookEdges },
    durationMs: Math.round(durationMs),
  };
  const target = process.argv[process.argv.indexOf('--json') + 1];
  if (target && !target.startsWith('--')) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`snapshot written to ${target}`);
  } else {
    console.log(JSON.stringify(snapshot, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

const failures = [];
if (trapViolations.length > 0) {
  failures.push(`${trapViolations.length} false-positive trap(s) violated`);
  for (const { trap, hit } of trapViolations) {
    failures.push(`    ${hit}\n      why it must not exist: ${trap.why}`);
  }
}
if (noEvidence.length > 0) failures.push(`${noEvidence.length} relationship(s) with no evidence`);
if (badConfidence.length > 0) {
  failures.push(`${badConfidence.length} relationship(s) with a confidence outside {1, 0.95, 0.9}`);
}
if (inferenceWithoutRule.length > 0) {
  failures.push(`${inferenceWithoutRule.length} static-inference evidence record(s) with no rule`);
}
if (graph.health.integrity !== 'PASS') failures.push('graph integrity FAILED');

if (failures.length > 0) {
  console.error('\n✗ FAILED\n' + failures.map((f) => `  ${f}`).join('\n') + '\n');
  process.exit(1);
}
console.log('\n✓ No trap violations, no evidence gaps.\n');
