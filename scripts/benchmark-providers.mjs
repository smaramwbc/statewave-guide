#!/usr/bin/env node
/**
 * Provider Reality Check.
 *
 * Runs the frozen dataset through every configured provider and measures two
 * different things that are easy to confuse:
 *
 *   PROPOSED  →  VERIFIER  →  ACCEPTED / REJECTED
 *
 * A model that proposes a hundred fabrications the verifier catches is safe at
 * runtime and still a worse semantic model than one that proposes two. So
 * proposals and acceptances are counted separately everywhere, and no single
 * aggregate score is produced — §26 of the brief, and the reason there is a
 * comparison table at the end rather than a winner.
 *
 *   pnpm benchmark:providers
 *   pnpm benchmark:providers -- --provider openai-gpt-5 --runs 5
 *
 * A provider with no credential is SKIPPED, named, and excluded from every
 * table. It is never counted as a zero.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDeterministicRenderer,
  discoverFeatureCandidates,
  enrichApplicationGraph,
  resolveProviders,
  DEFAULT_PROVIDERS,
} from '../packages/semantic/dist/index.js';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/**
 * Which round this run belongs to, and what shaped it.
 *
 * Recorded on every artefact because a metric without its inputs is not
 * evidence. Round 2 changed the prompt, the scope algorithm and the planner at
 * once; a reader comparing it to Round 1 needs to know that.
 */
const ROUND = 'round-2';
const PROMPT_VERSION = 'v2';
const SCOPE_VERSION = 'forward-spine-1';
const PLANNER_VERSION = 'matrix-probe-1';

const BENCH = path.join(ROOT, 'benchmarks/provider-reality-check');

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { runs: 3, providers: [], dataset: 'dataset-v1.json', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--provider' && value) {
      args.providers.push(value);
      i += 1;
    } else if (flag === '--model' && value) {
      args.model = value;
      i += 1;
    } else if (flag === '--runs' && value) {
      args.runs = Number(value);
      i += 1;
    } else if (flag === '--dataset' && value) {
      args.dataset = value;
      i += 1;
    } else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--help') args.help = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`
Provider Reality Check

  --provider <id>   only this provider (repeatable)
  --model <id>      override the model for the selected provider
  --runs <n>        repetitions per candidate (default 3)
  --dataset <file>  dataset file under benchmarks/provider-reality-check
  --dry-run         resolve providers and print the plan; call nothing
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Frozen inputs
// ---------------------------------------------------------------------------

const dataset = JSON.parse(readFileSync(path.join(BENCH, args.dataset), 'utf8'));
const gold = JSON.parse(readFileSync(path.join(BENCH, 'gold-v1.json'), 'utf8'));
const goldById = new Map(gold.features.map((f) => [f.featureId, f]));

const fixtureRoot = path.join(ROOT, dataset.fixture);
const { graph } = await createProjectIndexer({
  root: fixtureRoot,
  config: { include: dataset.include, exclude: dataset.exclude },
}).index();

const allCandidates = discoverFeatureCandidates(graph);
const selected = dataset.candidates
  .map((entry) => ({ entry, candidate: allCandidates.find((c) => c.id === entry.id) }))
  .filter((row) => row.candidate !== undefined);

if (selected.length !== dataset.candidates.length) {
  console.error(
    `✗ ${dataset.candidates.length - selected.length} dataset candidate(s) no longer exist in the fixture.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

let configs = DEFAULT_PROVIDERS;
if (args.providers.length > 0) {
  configs = configs.filter((c) => args.providers.includes(c.id));
  if (configs.length === 0) {
    console.error(`✗ no provider matches ${args.providers.join(', ')}`);
    process.exit(1);
  }
}
if (args.model && configs.length === 1) {
  configs = [{ ...configs[0], model: args.model }];
}

const resolved = resolveProviders(configs);

console.log('\nProvider Reality Check\n');
console.log(
  `  dataset       ${args.dataset} (v${dataset.version}) — ${selected.length} candidates`,
);
console.log(`  gold          gold-v1.json (v${gold.version})`);
console.log(`  prompt        prompt-v1.txt (frozen)`);
console.log(`  runs          ${args.runs} per candidate`);
console.log('');
for (const item of resolved) {
  console.log(
    item.status === 'ready'
      ? `  READY    ${item.config.id.padEnd(26)} ${item.settings}`
      : `  SKIPPED  ${item.config.id.padEnd(26)} ${item.reason}`,
  );
}

const ready = resolved.filter((item) => item.status === 'ready');
if (args.dryRun || ready.length === 0) {
  console.log('');
  if (ready.length === 0) {
    console.log('  No provider could run. Nothing was measured, and nothing is reported.');
    console.log('  Set a credential and re-run; see benchmarks/provider-reality-check/README.md.');
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const NEVER_ACTIONS = ['import', 'export', 'search', 'send'];

/** Blank counters. */
function emptyMetrics() {
  return {
    features: 0,
    // proposed → verified
    factualProposed: 0,
    factualVerified: 0,
    factualRejected: 0,
    languageProposed: 0,
    languageGrounded: 0,
    languageRejected: 0,
    // hallucination pressure, classified rather than lumped
    forbiddenCapabilitiesProposed: 0,
    unsupportedActionsProposed: 0,
    unknownSubjectsProposed: 0,
    unknownReferencesProposed: 0,
    invalidPermissionsProposed: 0,
    invalidRoutesProposed: 0,
    evidenceDoesNotSupport: 0,
    unsupportedClaimRule: 0,
    // gold-set comparison
    requiredConceptsExpected: 0,
    requiredConceptsRecovered: 0,
    requiredEvidenceExpected: 0,
    requiredEvidenceRecovered: 0,
    requiredWorkflowExpected: 0,
    requiredWorkflowRecovered: 0,
    capabilitiesOutsideAllowed: 0,
    // Round 2. The planner offers only claims the verifier has already proved,
    // so what is being measured here is not whether a model can find a fact —
    // it is whether it can tell a fact worth saying from one that is merely
    // true. Round 1 could not measure that at all: restraint scored 0/30
    // because declining was not something the schema let a model express.
    opportunitiesOffered: 0,
    opportunitiesAccepted: 0,
    opportunitiesDeclined: 0,
    // The Round 1 defect, counted directly. Both must stay at zero for
    // accepted claims; as *proposals* they are the interesting signal.
    subjectOutOfScope: 0,
    targetOutOfScope: 0,
    // The one case where the verifier let something through: a claim that
    // passed structural verification while asserting an action the gold set
    // forbids for that feature. A bare count is not inspectable — knowing that
    // it happened once is useless without knowing which claim, on what
    // evidence. Recorded so it can be read back without paying a provider.
    capabilitiesOutsideAllowedDetail: [],
    // A sample of refusals per reason, for the same reason: two harness
    // defects in this benchmark were found by reading rejection text, and both
    // were invisible in the aggregate counts.
    rejectionSamples: {},
    forbiddenClaimsInProse: 0,
    // restraint (refusal candidates)
    restraintCases: 0,
    restraintHeld: 0,
    // thin output — the failure mode the mock exhibited
    featuresWithoutCapability: 0,
    featuresOnlyWorkflowSteps: 0,
    featuresRepeatingIdentifiers: 0,
    // operational
    calls: 0,
    schemaFailures: 0,
    providerErrors: 0,
    rateLimited: 0,
    timeouts: 0,
    inputTokens: 0,
    outputTokens: 0,
    reportedTokens: false,
    latencies: [],
    rejectionsByReason: {},
  };
}

const lower = (value) => String(value ?? '').toLowerCase();

/** Substring concept matching. A heuristic, and reported as one. */
function conceptRecovered(concept, text) {
  const words = lower(concept)
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const haystack = lower(text);
  return words.length === 0 ? false : words.every((w) => haystack.includes(w));
}

function scoreFeature(metrics, feature, claims, prose, goldEntry) {
  metrics.features += 1;

  const mine = claims.filter((c) => c.featureId === feature.id);
  const factual = mine.filter((c) => c.assertion !== undefined);
  const language = mine.filter((c) => c.assertion === undefined);

  metrics.factualProposed += factual.length;
  metrics.languageProposed += language.length;
  metrics.factualVerified += factual.filter((c) => c.status === 'structurally_verified').length;
  metrics.factualRejected += factual.filter((c) => c.status === 'rejected').length;
  metrics.languageGrounded += language.filter((c) => c.status === 'semantically_grounded').length;
  metrics.languageRejected += language.filter((c) => c.status === 'rejected').length;

  for (const claim of mine) {
    const reason = claim.rejection?.reason;
    if (!reason) continue;
    metrics.rejectionsByReason[reason] = (metrics.rejectionsByReason[reason] ?? 0) + 1;
    // Keep a few verbatim examples per reason. Aggregate counts hid both
    // harness defects this benchmark uncovered; the rejection text named them
    // immediately.
    const samples = (metrics.rejectionSamples[reason] ??= []);
    if (samples.length < 3) {
      samples.push({
        featureId: claim.featureId,
        type: claim.type,
        action: claim.assertion?.action,
        detail: claim.rejection?.detail,
      });
    }
    if (reason === 'UNKNOWN_SUBJECT') metrics.unknownSubjectsProposed += 1;
    if (reason === 'UNKNOWN_GRAPH_REFERENCE') metrics.unknownReferencesProposed += 1;
    if (reason === 'UNKNOWN_PERMISSION') metrics.invalidPermissionsProposed += 1;
    if (reason === 'UNKNOWN_ROUTE') metrics.invalidRoutesProposed += 1;
    if (reason === 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM') metrics.evidenceDoesNotSupport += 1;
    if (reason === 'SUBJECT_OUT_OF_SCOPE') metrics.subjectOutOfScope += 1;
    if (reason === 'TARGET_OUT_OF_SCOPE') metrics.targetOutOfScope += 1;
    if (reason === 'UNSUPPORTED_CLAIM_RULE') metrics.unsupportedClaimRule += 1;
  }

  const proposedActions = factual.map((c) => c.assertion?.action).filter(Boolean);
  metrics.unsupportedActionsProposed += proposedActions.filter((a) =>
    NEVER_ACTIONS.includes(a),
  ).length;

  const verifiedCapabilities = factual.filter(
    (c) => c.type === 'capability' && c.status === 'structurally_verified',
  );

  // --- thin output ---------------------------------------------------------
  if (verifiedCapabilities.length === 0) metrics.featuresWithoutCapability += 1;
  const verifiedTypes = new Set(
    factual.filter((c) => c.status === 'structurally_verified').map((c) => c.type),
  );
  if (verifiedTypes.size === 1 && verifiedTypes.has('workflow_step')) {
    metrics.featuresOnlyWorkflowSteps += 1;
  }
  // Prose that is mostly the identifier restated is the mock's failure mode.
  const identifierEchoes = mine.filter((c) => lower(c.text).includes(lower(feature.id))).length;
  if (mine.length > 0 && identifierEchoes / mine.length > 0.5) {
    metrics.featuresRepeatingIdentifiers += 1;
  }

  if (!goldEntry) return;

  // --- gold comparison -----------------------------------------------------
  const acceptedRefs = new Set(
    mine
      .filter((c) => c.status !== 'rejected')
      .flatMap((c) => [...(c.assertion?.targets ?? []), ...c.evidence.map((e) => e.ref)]),
  );

  metrics.requiredConceptsExpected += goldEntry.requiredConcepts.length;
  for (const concept of goldEntry.requiredConcepts) {
    if (conceptRecovered(concept, prose)) metrics.requiredConceptsRecovered += 1;
  }
  metrics.requiredEvidenceExpected += goldEntry.requiredEvidence.length;
  for (const ref of goldEntry.requiredEvidence) {
    if (acceptedRefs.has(ref)) metrics.requiredEvidenceRecovered += 1;
  }
  metrics.requiredWorkflowExpected += goldEntry.requiredWorkflowTargets.length;
  const workflowTargets = new Set(
    mine.filter((c) => c.type === 'workflow_step').flatMap((c) => c.assertion?.targets ?? []),
  );
  for (const ref of goldEntry.requiredWorkflowTargets) {
    if (workflowTargets.has(ref)) metrics.requiredWorkflowRecovered += 1;
  }

  for (const claim of verifiedCapabilities) {
    const action = claim.assertion?.action;
    if (action && !goldEntry.allowedCapabilityActions.includes(action)) {
      metrics.capabilitiesOutsideAllowed += 1;
      metrics.capabilitiesOutsideAllowedDetail.push({
        claimId: claim.id,
        featureId: claim.featureId,
        action,
        allowed: [...goldEntry.allowedCapabilityActions],
        subjectRef: claim.assertion?.subjectRef,
        targets: [...(claim.assertion?.targets ?? [])],
        text: claim.text,
      });
    }
  }
  metrics.forbiddenCapabilitiesProposed += proposedActions.filter((a) =>
    goldEntry.forbiddenCapabilities.includes(a),
  ).length;
  for (const forbidden of goldEntry.forbiddenClaims) {
    if (lower(prose).includes(lower(forbidden))) metrics.forbiddenClaimsInProse += 1;
  }

  if (goldEntry.expectRestraint) {
    metrics.restraintCases += 1;
    // Restraint is about what was PROPOSED, not what survived. The verifier
    // blocking a fabrication is safety; not proposing it is judgement.
    const proposedCapability = factual.some((c) => c.type === 'capability');
    if (!proposedCapability) metrics.restraintHeld += 1;
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const runStamp = new Date().toISOString();
const results = [];

for (const item of ready) {
  const metrics = emptyMetrics();
  const perRun = [];
  console.log(`\n─── ${item.config.id} ───`);

  for (let run = 1; run <= args.runs; run += 1) {
    process.stdout.write(`  run ${run}/${args.runs} … `);
    let enrichment;
    try {
      enrichment = await enrichApplicationGraph({
        graph,
        provider: item.provider,
        renderer: createDeterministicRenderer(),
        // Only the dataset's candidates are sent to the provider. Discovery
        // stays complete so a subjectRef naming a feature outside the selection
        // still resolves; enriching the whole application to score twenty
        // features would mean paying for the rest, once per run.
        candidateIds: selected.map((row) => row.entry.id),
      });
    } catch (thrown) {
      console.log(`failed — ${thrown instanceof Error ? thrown.message : thrown}`);
      metrics.providerErrors += 1;
      continue;
    }

    const model = enrichment.model;
    const selectedIds = new Set(selected.map((row) => row.entry.id));
    const features = model.features.filter((f) => selectedIds.has(f.id));

    for (const feature of features) {
      const workflow = model.workflows.find((w) => w.featureId === feature.id);
      const prose = [
        feature.title,
        feature.description,
        feature.purpose ?? '',
        ...(feature.questions ?? []),
        ...(workflow?.steps.map((s) => s.text) ?? []),
      ].join(' ');
      scoreFeature(metrics, feature, model.claims, prose, goldById.get(feature.id));
    }

    // `SemanticUsage` reports tokens and latency, not a call count — the
    // pipeline is what knows how many candidates it sent. Reused features cost
    // no call, so they are subtracted rather than assumed away.
    for (const tally of enrichment.opportunities ?? []) {
      metrics.opportunitiesOffered += tally.offered;
      metrics.opportunitiesAccepted += tally.accepted;
      metrics.opportunitiesDeclined += tally.declined;
    }
    metrics.calls += selected.length - enrichment.reused.length;
    // A provider that reports no token usage leaves these undefined. Coercing
    // that to zero would print a confident `0 in / 0 out`, which reads as
    // "free" rather than "not reported".
    if (enrichment.usage.inputTokens !== undefined) {
      metrics.inputTokens += enrichment.usage.inputTokens;
      metrics.reportedTokens = true;
    }
    if (enrichment.usage.outputTokens !== undefined) {
      metrics.outputTokens += enrichment.usage.outputTokens;
      metrics.reportedTokens = true;
    }
    metrics.latencies.push(enrichment.usage.latencyMs);

    perRun.push({
      run,
      features: features.length,
      claimIds: model.claims
        .filter((c) => selectedIds.has(c.featureId))
        .map((c) => `${c.id}:${c.status}`)
        .sort(),
    });
    console.log(`${features.length} features`);
  }

  // --- stability across runs ------------------------------------------------
  let stability = null;
  if (perRun.length >= 2) {
    const base = new Set(perRun[0].claimIds);
    const overlaps = perRun.slice(1).map((r) => {
      const other = new Set(r.claimIds);
      const shared = [...base].filter((id) => other.has(id)).length;
      const union = new Set([...base, ...other]).size;
      return union === 0 ? 1 : shared / union;
    });
    stability = overlaps.reduce((a, b) => a + b, 0) / overlaps.length;
  }

  results.push({
    id: item.config.id,
    model: item.config.model,
    settings: item.settings,
    metrics,
    stability,
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
console.log('\n\nComparison — no single score, by design\n');
console.log(
  '  provider                  factual proposed/verified  restraint  concepts  evidence  stability  schema fail',
);
console.log('  ' + '─'.repeat(104));
for (const r of results) {
  const m = r.metrics;
  console.log(
    `  ${r.id.padEnd(26)}` +
      `${String(m.factualProposed).padStart(8)}/${String(m.factualVerified).padEnd(9)}` +
      `${pct(m.restraintHeld, m.restraintCases).padStart(9)}  ` +
      `${pct(m.requiredConceptsRecovered, m.requiredConceptsExpected).padStart(8)}  ` +
      `${pct(m.requiredEvidenceRecovered, m.requiredEvidenceExpected).padStart(8)}  ` +
      `${(r.stability === null ? '—' : `${Math.round(r.stability * 100)}%`).padStart(9)}  ` +
      `${String(m.schemaFailures).padStart(11)}`,
  );
}

console.log('\n  Hallucination pressure — proposed, before the verifier saw them\n');
for (const r of results) {
  const m = r.metrics;
  console.log(
    `  ${r.id.padEnd(26)} unsupported-action ${String(m.unsupportedActionsProposed).padStart(3)} · ` +
      `forbidden-capability ${String(m.forbiddenCapabilitiesProposed).padStart(3)} · ` +
      `unknown-subject ${String(m.unknownSubjectsProposed).padStart(3)} · ` +
      `bad-permission ${String(m.invalidPermissionsProposed).padStart(3)} · ` +
      `bad-route ${String(m.invalidRoutesProposed).padStart(3)}`,
  );
}

console.log('\n  Thin output — accurate but nearly useless\n');
for (const r of results) {
  const m = r.metrics;
  console.log(
    `  ${r.id.padEnd(26)} no capability ${String(m.featuresWithoutCapability).padStart(3)}/${m.features} · ` +
      `workflow-steps only ${String(m.featuresOnlyWorkflowSteps).padStart(3)} · ` +
      `restates identifiers ${String(m.featuresRepeatingIdentifiers).padStart(3)}`,
  );
}

console.log('\n  Operational\n');
for (const r of results) {
  const m = r.metrics;
  // One latency figure per run, not per call — the pipeline sums the calls it
  // makes. A percentile over three runs would be arithmetic theatre, so the
  // per-run total and the mean per call are what get printed.
  const runTotal = m.latencies.reduce((sum, ms) => sum + ms, 0);
  const perCall = m.calls > 0 ? Math.round(runTotal / m.calls) : undefined;
  const tokens = m.reportedTokens
    ? `in ${m.inputTokens.toLocaleString().padStart(9)} · out ${m.outputTokens.toLocaleString().padStart(7)}`
    : `tokens not reported by provider`;
  console.log(
    `  ${r.id.padEnd(26)} calls ${String(m.calls).padStart(4)} · ${tokens} · ` +
      `${Math.round(runTotal / 1000)}s total · ~${perCall ?? '—'}ms/call`,
  );
  console.log(`  ${''.padEnd(26)} settings: ${r.settings}`);
}

console.log(`
  Renderer: deterministic. No model wrote user-facing prose in this benchmark —
  what is measured is product understanding, not writing style.

  Cost is not computed: no adapter here receives a price from its provider, and
  inventing one would be worse than omitting it.
`);

// ---------------------------------------------------------------------------
// Artefacts
// ---------------------------------------------------------------------------

for (const r of results) {
  // Rounds are kept apart on disk, permanently. Round 1's numbers are the only
  // baseline for judging Round 2, and a benchmark that overwrites its own
  // history can only ever report that things are fine now.
  const dir = path.join(BENCH, 'results', ROUND);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(
      dir,
      `${r.id}-dataset-v${dataset.version}-gold-v${gold.version}-prompt-${PROMPT_VERSION}.json`,
    ),
    JSON.stringify(
      {
        round: ROUND,
        provider: r.id,
        model: r.model,
        settings: r.settings,
        dataset: `v${dataset.version}`,
        gold: `v${gold.version}`,
        prompt: PROMPT_VERSION,
        scopeAlgorithm: SCOPE_VERSION,
        opportunityPlanner: PLANNER_VERSION,
        runs: args.runs,
        runAt: runStamp,
        stability: r.stability,
        metrics: r.metrics,
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(
  `  Wrote ${results.length} result file(s) under benchmarks/provider-reality-check/results/\n`,
);
