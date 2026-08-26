#!/usr/bin/env node
/**
 * Semantic composition benchmark.
 *
 * Answers one question: **what does the verifier do to a model that misbehaves?**
 *
 * That framing decides everything about how this script is built. A run against
 * a cooperative stand-in produces a page of zeroes — nothing generated, nothing
 * refused, nothing learned — so the provider here is deliberately adversarial.
 * It calls the deterministic mock for an honest answer, then splices in
 * fabrications drawn from a fixed catalogue: a capability with no verification
 * rule, a target belonging to another feature, an invented graph id, a
 * fabricated route, a permission nothing requires, a workflow step pointing at
 * something a user cannot be shown.
 *
 * Because the fabrications are inserted here, **the ground truth is known**.
 * Every claim is written into a ledger under the deterministic id the pipeline
 * will give it, marked hostile or honest. Afterwards the two are compared
 * against the Product Model, which is what makes the pass/fail conditions
 * meaningful:
 *
 * - a hostile assertion that was **accepted** fails the run;
 * - an honest claim that was **rejected** fails the run;
 * - a ledger entry with no matching claim fails the run, because silent
 *   accounting drift would make every number above it worthless.
 *
 * ## What this does NOT measure
 *
 * It does not measure how often a real model hallucinates. The fabrication rate
 * here is a constant this file chose. Read the `Model behaviour` block at the
 * end of the report before quoting any figure from it.
 *
 * Nor does the proposition figure measure whether the prose is *true*. It counts
 * eleven capability and effect words across the five surfaces that actually
 * reach a reader — description, title, purpose, questions and workflow steps — and
 * a fabrication phrased in other words scores zero. A hit is strong evidence of
 * a problem; a clean run is weak evidence of correctness, and there is no
 * arrangement of a wordlist that changes that.
 *
 * @see docs/semantic-real-world-report.md
 */

import { fileURLToPath } from 'node:url';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import { SEMANTIC_LIMITS, featureEnrichmentSchema } from '../packages/shared/dist/index.js';
import {
  EVIDENCE_FENCE_CLOSE,
  EVIDENCE_FENCE_OPEN,
  PROPOSITION_WATCHLIST,
  checkRenderedPropositions,
  createMockProvider,
  enrichApplicationGraph,
} from '../packages/semantic/dist/index.js';

const FIXTURE = fileURLToPath(
  new URL('../packages/indexer/test/fixtures/realistic-app', import.meta.url),
);
const INCLUDE = ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'];

/** How many fabrications are spliced into each feature's response. */
const FABRICATIONS_PER_FEATURE = 3;

// ---------------------------------------------------------------------------
// The adversarial provider
// ---------------------------------------------------------------------------

/** Reads the fenced data block back into the document the model was shown. */
function parseEvidenceDocument(evidence) {
  const start = evidence.indexOf(EVIDENCE_FENCE_OPEN);
  const end = evidence.lastIndexOf(EVIDENCE_FENCE_CLOSE);
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    return JSON.parse(evidence.slice(start + EVIDENCE_FENCE_OPEN.length, end));
  } catch {
    return undefined;
  }
}

/**
 * The fabrication catalogue.
 *
 * Each entry is a function of the evidence pack returning one hostile claim, or
 * `undefined` when this pack cannot host that attack. Every entry names the
 * reason the verifier is expected to give, so a refusal for the *wrong* reason
 * is visible rather than counted as a success.
 */
const CATALOGUE = [
  {
    name: 'capability with no verification rule (import)',
    expect: 'UNSUPPORTED_CLAIM_RULE',
    build: (pack) => ({
      type: 'capability',
      action: 'import',
      text: 'Records can be imported from a spreadsheet.',
      subjectRef: pack.subject,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'capability with no verification rule (export)',
    expect: 'UNSUPPORTED_CLAIM_RULE',
    build: (pack) => ({
      type: 'capability',
      action: 'export',
      text: 'Records can be exported to a spreadsheet.',
      subjectRef: pack.subject,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'capability with no verification rule (search)',
    expect: 'UNSUPPORTED_CLAIM_RULE',
    build: (pack) => ({
      type: 'capability',
      action: 'search',
      // Listing is not searching, and the graph carries no search signal at all:
      // no relationship, no node kind, and an `input` element is shaped like
      // every other field. The matrix omits it deliberately, and the benchmark
      // exercised the other three omissions but never this one.
      text: 'Records can be found by typing part of a name.',
      subjectRef: pack.subject,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'capability with no verification rule (send)',
    expect: 'UNSUPPORTED_CLAIM_RULE',
    build: (pack) => ({
      type: 'capability',
      action: 'send',
      text: 'A confirmation is emailed to the customer.',
      subjectRef: pack.subject,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'target belonging to another feature',
    expect: 'NO_SUPPORTING_EVIDENCE',
    build: (pack) =>
      pack.foreign === undefined
        ? undefined
        : {
            type: 'capability',
            action: 'create',
            text: 'A record can be created here.',
            subjectRef: pack.subject,
            targets: [pack.foreign],
          },
  },
  {
    name: 'invented graph id',
    expect: 'UNKNOWN_GRAPH_REFERENCE',
    build: (pack) => ({
      type: 'capability',
      action: 'create',
      text: 'A record can be created here.',
      subjectRef: pack.subject,
      targets: [`${pack.anchor}-fabricated`],
    }),
  },
  {
    name: 'invented subject',
    expect: 'UNKNOWN_SUBJECT',
    build: (pack) => ({
      type: 'capability',
      action: 'view',
      text: 'The bulk editor shows every record at once.',
      subjectRef: `feature:${pack.featureId}.bulk-editor`,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'permission nothing in the evidence requires',
    expect: 'UNKNOWN_PERMISSION',
    build: (pack) => ({
      type: 'permission',
      permission: 'superuser:all',
      text: 'Only a superuser may do this.',
      subjectRef: pack.subject,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'route the feature does not have',
    expect: 'UNKNOWN_ROUTE',
    build: (pack) => ({
      type: 'navigation',
      route: '/fabricated/route',
      text: 'This opens the fabricated screen.',
      subjectRef: pack.subject,
      targets: [pack.anchor],
    }),
  },
  {
    name: 'workflow step pointing at something a user cannot be shown',
    expect: 'UNSUPPORTED_WORKFLOW_STEP',
    build: (pack) =>
      pack.fn === undefined
        ? undefined
        : {
            type: 'workflow_step',
            text: 'Wait for the handler to finish.',
            subjectRef: pack.subject,
            targets: [pack.fn],
          },
  },
  {
    name: 'create capability citing a read endpoint',
    expect: 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
    build: (pack) =>
      pack.getEndpoint === undefined
        ? undefined
        : {
            type: 'capability',
            action: 'create',
            text: 'A record can be created from this screen.',
            subjectRef: pack.subject,
            targets: [pack.getEndpoint],
          },
  },
  {
    name: 'capability citing nothing that could perform it',
    expect: 'UNSUPPORTED_CAPABILITY',
    build: (pack) =>
      pack.permissionNode === undefined
        ? undefined
        : {
            type: 'capability',
            action: 'create',
            text: 'A record can be created from this screen.',
            subjectRef: pack.subject,
            targets: [pack.permissionNode],
          },
  },
  {
    name: 'constraint with no schema or permission behind it',
    expect: 'UNSUPPORTED_CONSTRAINT',
    build: (pack) =>
      pack.element === undefined
        ? undefined
        : {
            type: 'constraint',
            text: 'The name field is limited to sixty characters.',
            subjectRef: pack.subject,
            targets: [pack.element],
          },
  },
];

/** The one language fabrication: an interpretation attached to another feature. */
const LANGUAGE_FABRICATION = {
  name: 'interpretation attached to another feature',
  expect: 'NO_SUPPORTING_EVIDENCE',
  build: (pack) =>
    pack.foreign === undefined
      ? undefined
      : {
          type: 'purpose',
          text: 'Someone uses this when they need to reconcile the month.',
          targets: [pack.foreign],
        },
};

/** The handful of facts the catalogue selects its targets from. */
function summarise(document, foreignIds) {
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const ids = new Set(nodes.map((node) => node.id));
  const byKind = (kind) => nodes.find((node) => node.kind === kind)?.id;
  const anchor = ids.has(document.root) ? document.root : nodes[0]?.id;
  if (anchor === undefined) return undefined;

  return {
    featureId: document.featureId,
    subject: `feature:${document.featureId}`,
    anchor,
    foreign: foreignIds.find((id) => !ids.has(id)),
    fn: byKind('function'),
    element: byKind('element'),
    permissionNode: byKind('permission'),
    getEndpoint: nodes.find(
      (node) =>
        node.kind === 'api' &&
        node.facts?.method === 'GET' &&
        typeof node.facts?.path === 'string' &&
        !node.facts.path.startsWith('?'),
    )?.id,
    permissions: Array.isArray(document.permissions) ? document.permissions : [],
  };
}

/**
 * A provider that answers honestly and then lies on purpose.
 *
 * The rotation is deterministic — feature position decides which catalogue
 * entries are used — so two runs over the same fixture fabricate exactly the
 * same claims in exactly the same places.
 */
function createAdversarialProvider(graph) {
  const honest = createMockProvider();
  const foreignIds = graph.nodes.map((node) => node.id);
  /** Claim id → what this script knows about that claim. */
  const ledger = new Map();
  let position = 0;
  let calls = 0;

  /** Records the id the pipeline will mint for every claim in a response. */
  const record = (featureId, factualClaims, languageClaims, hostile) => {
    const ordinals = new Map();
    for (const claim of [...factualClaims, ...languageClaims]) {
      const ordinal = (ordinals.get(claim.type) ?? 0) + 1;
      ordinals.set(claim.type, ordinal);
      const entry = hostile.get(claim);
      ledger.set(`${featureId}#${claim.type}:${ordinal}`, {
        featureId,
        hostile: entry !== undefined,
        attack: entry?.name,
        expect: entry?.expect,
        seen: false,
      });
    }
  };

  return {
    name: 'adversarial-mock',
    model: 'scripted-fabricator-1',
    ledger,
    get calls() {
      return calls;
    },
    async generateStructured(request) {
      calls += 1;
      const base = await honest.generateStructured(request);
      if (!base.success) return base;

      const document = parseEvidenceDocument(request.evidence);
      const pack = document === undefined ? undefined : summarise(document, foreignIds);
      if (pack === undefined) return base;

      const index = position;
      position += 1;

      const hostile = new Map();
      const fabricated = [];
      for (let offset = 0; offset < FABRICATIONS_PER_FEATURE; offset += 1) {
        // Walk the catalogue from the rotated position until an attack this
        // pack can host is found; a pack with no function node simply gets the
        // next attack rather than one fewer.
        for (let step = 0; step < CATALOGUE.length; step += 1) {
          const entry =
            CATALOGUE[(index * FABRICATIONS_PER_FEATURE + offset + step) % CATALOGUE.length];
          const claim = entry.build(pack);
          if (claim === undefined || fabricated.some((existing) => existing.entry === entry)) {
            continue;
          }
          fabricated.push({ entry, claim });
          hostile.set(claim, entry);
          break;
        }
      }

      const languageFabrication = LANGUAGE_FABRICATION.build(pack);
      if (languageFabrication !== undefined) {
        hostile.set(languageFabrication, LANGUAGE_FABRICATION);
      }

      const factualClaims = [
        ...base.data.factualClaims.slice(0, SEMANTIC_LIMITS.maxFactualClaims - fabricated.length),
        ...fabricated.map((entry) => entry.claim),
      ];
      const languageClaims = [
        ...base.data.languageClaims.slice(0, SEMANTIC_LIMITS.maxLanguageClaims - 1),
        ...(languageFabrication === undefined ? [] : [languageFabrication]),
      ];

      record(pack.featureId, factualClaims, languageClaims, hostile);

      const response = { ...base.data, factualClaims, languageClaims };
      const parsed = featureEnrichmentSchema.safeParse(response);
      if (!parsed.success) {
        throw new Error(
          `The benchmark built a response its own schema rejects: ${parsed.error.message}`,
        );
      }
      return { ...base, data: parsed.data };
    },
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const { graph } = await createProjectIndexer({
  root: FIXTURE,
  config: { include: INCLUDE, exclude: ['**/__tests__/**', '**/*.test.*'] },
}).index();

const provider = createAdversarialProvider(graph);
const run = await enrichApplicationGraph({
  graph,
  provider,
  application: 'realistic-app',
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const claimsByFeature = new Map();
for (const claim of run.model.claims) {
  const list = claimsByFeature.get(claim.featureId);
  if (list) list.push(claim);
  else claimsByFeature.set(claim.featureId, [claim]);
}

let factualGenerated = 0;
let factualVerified = 0;
let factualRejected = 0;
let languageGenerated = 0;
let languageGrounded = 0;
let languageRejected = 0;

/** Hostile assertions, and what happened to them. */
const hostile = { attempted: 0, blocked: 0, accepted: [], wrongReason: [] };
/** Honest claims, and what happened to them. */
const controls = { attempted: 0, accepted: 0, rejected: [] };

for (const claim of run.model.claims) {
  const factual = claim.assertion !== undefined;
  if (factual) {
    factualGenerated += 1;
    if (claim.status === 'structurally_verified') factualVerified += 1;
    else factualRejected += 1;
  } else {
    languageGenerated += 1;
    if (claim.status === 'semantically_grounded') languageGrounded += 1;
    else languageRejected += 1;
  }

  const known = provider.ledger.get(claim.id);
  if (known === undefined) continue;
  known.seen = true;

  if (known.hostile) {
    hostile.attempted += 1;
    if (claim.status === 'rejected') {
      hostile.blocked += 1;
      if (claim.rejection?.reason !== known.expect) {
        hostile.wrongReason.push(
          `${claim.id} — ${known.attack}: expected ${known.expect}, got ${claim.rejection?.reason ?? 'no reason'}`,
        );
      }
    } else {
      hostile.accepted.push(`${claim.id} — ${known.attack} (${claim.status})`);
    }
    continue;
  }

  controls.attempted += 1;
  if (claim.status === 'rejected') {
    controls.rejected.push(
      `${claim.id} — ${claim.rejection?.reason ?? 'no reason'}: ${claim.rejection?.detail ?? ''}`,
    );
  } else {
    controls.accepted += 1;
  }
}

const unaccounted = [...provider.ledger.entries()]
  .filter(([, entry]) => !entry.seen)
  .map(([id]) => id);

/**
 * Watchlist propositions any shipped prose asserts and no accepted claim backs.
 *
 * Five surfaces reach a reader, not one. `feature.description` is composed by
 * the deterministic renderer from assertions; `title`, `purpose`, `questions`
 * and every workflow step are model prose that only the wording gate in
 * `verifier.ts` ever looks at. Checking the renderer alone published a figure
 * labelled "renderer introduced 0" while four unchecked surfaces sat beside it
 * on the same page.
 *
 * The graph facts a feature owns count as backing: a route named
 * `/clients/export` is the application's own word, not a model's.
 */
const introduced = [];
for (const feature of run.model.features) {
  const claims = claimsByFeature.get(feature.id) ?? [];
  const evidenceLanguage = [...feature.routes, ...feature.elements, ...feature.permissions];
  const workflow = run.model.workflows.find((entry) => entry.featureId === feature.id);
  const surfaces = [
    ['description', feature.description],
    ['title', feature.title],
    ...(feature.purpose === undefined ? [] : [['purpose', feature.purpose]]),
    ...feature.questions.map((question, index) => [`question[${index}]`, question]),
    ...(workflow?.steps ?? []).map((step) => [`step[${step.index}]`, step.text]),
  ];
  for (const [surface, prose] of surfaces) {
    const result = checkRenderedPropositions(prose, claims, { evidenceLanguage });
    for (const proposition of result.introduced) {
      introduced.push(`${feature.id} ${surface}: ${proposition}`);
    }
  }
}

const unsupportedActions = new Map();
for (const feature of run.model.features) {
  for (const [action, count] of Object.entries(feature.claimSummary.unsupportedActions)) {
    unsupportedActions.set(action, (unsupportedActions.get(action) ?? 0) + count);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const LABEL_WIDTH = 40;
const VALUE_WIDTH = 8;

const count = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const row = (label, value) =>
  `  ${String(label).padEnd(LABEL_WIDTH)}${String(value).padStart(VALUE_WIDTH)}`;

/** A figure the provider did not supply is a dash, never a guess. */
const supplied = (value, format) => (value === undefined ? '—' : format(value));

const lines = [];
const say = (line = '') => lines.push(line);

say('ProductModel Semantic Composition');
say();
say(row('application', run.model.application ?? 'unknown'));
say(row('feature candidates', count(run.model.verification.featureCandidates)));
say(row('features enriched', count(run.model.verification.featuresEnriched)));
say(row('features accepted', count(run.model.verification.featuresAccepted)));
say(row('features refused by verification', count(run.model.verification.featuresRejected)));
say();

if (run.warnings.length > 0) {
  // Grouped rather than listed: enrichment prefixes every caveat with the
  // feature it came from, and sixty-nine copies of "the pack was truncated" is
  // a wall, which is the same as saying nothing.
  const grouped = new Map();
  for (const warning of run.warnings) {
    const match = /^([^\s:]+): (.*)$/s.exec(warning);
    const message = match?.[2] ?? warning;
    grouped.set(message, (grouped.get(message) ?? 0) + 1);
  }
  say('Caveats this run reported');
  for (const [message, features] of grouped) say(`  ${features} × ${message}`);
  say();
}

say('Factual claims');
say(row('generated', count(factualGenerated)));
say(row('structurally verified', count(factualVerified)));
say(row('rejected', count(factualRejected)));
say();

say('Language claims');
say(row('generated', count(languageGenerated)));
say(row('semantically grounded', count(languageGrounded)));
say(row('rejected', count(languageRejected)));
say();

say('Unsupported factual actions');
if (unsupportedActions.size === 0) say('  none');
for (const action of [...unsupportedActions.keys()].sort()) {
  say(`  ${action} : ${count(unsupportedActions.get(action))}`);
}
say();

say('Rejected reasons');
const reasons = Object.entries(run.model.verification.rejectionsByReason);
if (reasons.length === 0) say('  none');
for (const [reason, total] of reasons.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  say(`  ${reason} : ${count(total)}`);
}
say();

say('Unsupported propositions in shipped prose');
say(row(`over ${PROPOSITION_WATCHLIST.length} watched propositions`, count(introduced.length)));
say('  Surfaces checked: description, title, purpose, questions, workflow steps.');
for (const entry of introduced) say(`    ${entry}`);
say();

say('Verifier quality');
say(row('hostile assertions attempted', count(hostile.attempted)));
say(row('hostile assertions blocked', count(hostile.blocked)));
say(
  row(
    'unsupported capabilities blocked',
    count(run.model.verification.blocked.unsupportedCapabilities),
  ),
);
say(
  row(
    'unsupported permissions blocked',
    count(run.model.verification.blocked.unsupportedPermissions),
  ),
);
say(
  row(
    'unsupported constraints blocked',
    count(run.model.verification.blocked.unsupportedConstraints),
  ),
);
say(
  row(
    'invalid workflow targets blocked',
    count(run.model.verification.blocked.workflowStepsWithoutEvidence),
  ),
);
say(
  row(
    'unknown factual subjects blocked',
    count(run.model.verification.rejectionsByReason.UNKNOWN_SUBJECT ?? 0),
  ),
);
say(row('positive controls attempted', count(controls.attempted)));
say(row('positive controls accepted', count(controls.accepted)));
say();

say('Model usage');
say(row('calls', count(provider.calls)));
say(row('input tokens', supplied(run.usage.inputTokens, count)));
say(row('output tokens', supplied(run.usage.outputTokens, count)));
say(
  row(
    'cost',
    supplied(run.usage.costUsd, (value) => `$${value.toFixed(2)}`),
  ),
);
// The stand-in reports zero rather than timing anything, so there is no
// duration to print. A dash says that; `0 ms` would not.
say(row('latency', '—'));
say();
say("  Token counts are the stand-in provider's own estimate (characters / 4).");
say('  Cost is zero because no vendor was called. Latency is not reported because');
say('  the stand-in returns zero by design rather than measuring anything.');
say();

say('Model behaviour');
say('  Not empirically measured in Closed Loop #3.');
say('  No real model provider credentials were configured.');
say('  Mock-model results measure the VERIFIER, not real-model hallucination frequency.');

console.log(lines.join('\n'));

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

const failures = [];
if (hostile.accepted.length > 0) {
  failures.push(`${hostile.accepted.length} hostile assertions were ACCEPTED:`);
  failures.push(...hostile.accepted.map((entry) => `  ${entry}`));
}
if (controls.rejected.length > 0) {
  failures.push(`${controls.rejected.length} positive controls were REJECTED:`);
  failures.push(...controls.rejected.map((entry) => `  ${entry}`));
}
if (hostile.wrongReason.length > 0) {
  failures.push(`${hostile.wrongReason.length} refusals gave the wrong reason:`);
  failures.push(...hostile.wrongReason.map((entry) => `  ${entry}`));
}
if (unaccounted.length > 0) {
  failures.push(`${unaccounted.length} ledger entries matched no claim in the model:`);
  failures.push(...unaccounted.slice(0, 20).map((entry) => `  ${entry}`));
}
if (introduced.length > 0) {
  // Every one of these surfaces goes through the wording gate before it can be
  // published, so a hit here is that gate having failed to hold rather than a
  // detector being noisy.
  failures.push(`${introduced.length} shipped sentences assert something nothing supports:`);
  failures.push(...introduced.map((entry) => `  ${entry}`));
}
if (hostile.attempted === 0 || controls.attempted === 0) {
  failures.push('The benchmark exercised no hostile assertions or no positive controls.');
}

if (failures.length > 0) {
  console.error('');
  console.error('FAIL');
  for (const line of failures) console.error(line);
  process.exit(1);
}

console.log('');
console.log('PASS — every hostile assertion was blocked and every positive control survived.');
