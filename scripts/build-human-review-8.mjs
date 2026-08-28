/**
 * SUPERSEDED by `build-human-review-8-r1.mjs` — RUNTIME_REVIEW_FACT_ATTRIBUTION_DEFECT.
 *
 * The renderer below hard-codes the verb *"Typing into"* onto every collection
 * change and the direction *"reduced"* onto every count, and describes any
 * container's member count as a collection. It therefore told a reviewer that a
 * **click** on `Rotate API key` was typing, that a count of 1 rising to 2 had
 * been "reduced", and that a page `<section>` gaining a child was a collection
 * changing size.
 *
 * **This file is deliberately not fixed.** It is the builder that produced the
 * package that was actually issued, and `--check` is what proves the committed
 * artefact is its output. Correcting it here would make an issued package
 * regenerate into something no reviewer ever saw — falsifying history through a
 * gate rather than an edit, which is the failure mode `artifact-integrity`
 * exists to catch. The correction lives in the revision instead.
 *
 * The blinded review package for Round 8 — the first with observed behaviour in it.
 *
 * Same twenty-one features, same frozen static capture, same gate v2 rubric, no
 * provider call. What changed is that eight capabilities verified against the
 * *running* fixture are now claims in the ProductModel, and the unchanged Closed
 * Loop #7 compiler has been run over the result.
 *
 * The instrument changes with it. A reviewer scoring *"Lets you filter clients."*
 * has to be able to check it, and no static fact can — the graph proves a text
 * box and a chain of hooks. So the fact list now carries what was **observed**,
 * described neutrally:
 *
 *   "Typing into the text input reduced the visible client collection from 5
 *    items to 2."
 *
 * and not
 *
 *   "The Search feature searches clients."
 *
 * The second would hand the reviewer the interpretation they are being asked to
 * score. Every runtime fact below describes an effect and leaves the meaning to
 * whoever reads it.
 *
 * Usage:
 *   node scripts/build-human-review-8.mjs [--seed 20260901] [--check]
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';
import { renderReviewItem } from './lib/review-markdown.mjs';
import {
  buildEvidencePack,
  compileGuidance,
  computeFeatureScope,
  discoverFeatureCandidates,
  realiseInstruction,
  tryRealise,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/** A different seed from Round 2, so position carries no memory between rounds. */
const SEED = Number(flag('seed', '20260901'));

/**
 * Check the fact coverage without issuing a package.
 *
 * The coverage invariant is a property of the compiler, not of a particular
 * build, so it runs as a gate — and a gate that rewrites an issued review
 * package as a side effect is the failure `test:artifact-integrity` exists to
 * catch.
 */
const CHECK_ONLY = process.argv.includes('--check');

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));

// One ProductModel. The static claims are the frozen Round 2 capture, unchanged
// and in order; the runtime-backed ones are appended by the same integration the
// gate checks. There is no second model and no separate runtime pipeline.
const loaded = await loadEverything(ROOT);
const integration = enrich(loaded);
const model = integration.enriched;
const runtimeByFeature = new Map();
for (const entry of integration.accepted) {
  const list = runtimeByFeature.get(entry.record.featureId) ?? [];
  list.push(entry.record);
  runtimeByFeature.set(entry.record.featureId, list);
}

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

/**
 * What an unlabelled control *is*, structurally, without guessing what it is for.
 *
 * "The Settings screen contains a read-only code display" is checkable: someone
 * can look. "The Settings screen shows your new API key" is an interpretation,
 * and putting one in the reviewer's evidence column would be handing them our
 * conclusion to check our conclusion against.
 */
const STRUCTURAL_KINDS = {
  code: 'a read-only code display',
  pre: 'a read-only text block',
  input: 'a text input',
  textfield: 'a text input',
  select: 'a dropdown',
  textarea: 'a multi-line text input',
  table: 'a table',
  form: 'a form',
  img: 'an image',
};

function screenOf(featureId) {
  const head = featureId.split('.')[0] ?? featureId;
  const route = graph.nodes.find((node) => node.kind === 'route' && node.path === `/${head}`);
  if (route?.componentName !== undefined) return route.componentName.replace(/Page$/, '');
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/** One checkable fact, in a sentence somebody can verify by looking. */
function describeFact(ref, featureId) {
  const node = nodeById.get(ref);
  if (node !== undefined) {
    switch (node.kind) {
      case 'element': {
        if (typeof node.label === 'string' && node.label.trim().length > 0) {
          return `The screen has a control labelled "${node.label.trim()}".`;
        }
        const tag = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
        const described = STRUCTURAL_KINDS[tag] ?? STRUCTURAL_KINDS[node.type ?? ''];
        return described === undefined
          ? undefined
          : `The ${screenOf(featureId)} screen contains ${described}.`;
      }
      case 'route':
        return `There is a screen at ${node.path}.`;
      case 'api':
        return `The application can send a ${node.method} request to ${node.path}.`;
      case 'permission':
        return `Using this requires the "${node.permission}" permission.`;
      default:
        return undefined;
    }
  }
  return undefined;
}

/** Effects, parsed back out of their serialised `KIND|k=v,...` form. */
function parseEffect(entry) {
  const [kind, rest = ''] = entry.split('|');
  const fields = {};
  for (const pair of rest.split(',')) {
    const index = pair.indexOf('=');
    if (index > 0) fields[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return { kind, fields };
}

/**
 * What was observed, in sentences a reviewer can check by looking.
 *
 * Deliberately flat. "Reduced the visible collection from 5 items to 2" is
 * something somebody can reproduce; "filters clients" is the conclusion under
 * review. The second belongs in the output being scored, never in the evidence
 * it is scored against.
 */
function describeRuntimeFacts(record) {
  // How to refer to the control that was operated. Closed Loop #8's rule holds
  // in the evidence list as much as in the guide: a label the interface shows,
  // or nothing. `invoices.list.open` is a real row link with no accessible name,
  // and calling it "the Open control" here would smuggle an identifier into a
  // reviewer's evidence — the exact substitution the last two loops removed.
  const node = nodeById.get(record.subjectRef);
  const label = typeof node?.label === 'string' ? node.label.trim() : '';
  const the =
    label.length > 0
      ? `the control labelled "${label}"`
      : 'one control on this screen that the interface does not name';

  const sentences = [];
  for (const raw of record.effects) {
    const { kind, fields } = parseEffect(raw);
    if (kind === 'COLLECTION_CHANGED' && fields['containerSemanticId'] !== undefined) {
      sentences.push(
        `Typing into ${the} reduced a visible collection on the screen from ${fields['before']} items to ${fields['after']}.`,
      );
    }
    if (kind === 'ROUTE_CHANGED') {
      sentences.push(`Activating this control moved from ${fields['from']} to ${fields['to']}.`);
    }
    if (kind === 'NETWORK_REQUEST' && fields['statusCategory'] === '2xx') {
      sentences.push(
        `Activating ${the} sent a ${fields['method']} request to ${fields['path']}, which succeeded.`,
      );
    }
    if (kind === 'REGION_APPEARED') {
      sentences.push(`Activating ${the} made a ${fields['role']} appear on the screen.`);
    }
    if (kind === 'ELEMENT_APPEARED') {
      sentences.push(`Activating ${the} made an element appear that was not there before.`);
    }
  }
  sentences.push(
    `All of this was observed on the ${record.context.route} screen, with these permissions granted: ${[...record.context.permissions].sort().join(', ')}.`,
  );
  return [...new Set(sentences)];
}

const items = [];
const key = [];
const coverage = {
  proposition: { required: 0, covered: 0 },
  actionStep: { required: 0, covered: 0 },
  controlName: { required: 0, covered: 0 },
  title: { required: 0, covered: 0 },
  missing: [],
};

/** The visible control name a step quotes, when it quotes one. */
function controlNameOf(proposition) {
  const label = proposition.control ?? proposition.via ?? proposition.container;
  return label?.text;
}

const candidates = discoverFeatureCandidates(graph);

for (const feature of model.features) {
  const candidate = candidates.find((entry) => entry.id === feature.id);
  const scope =
    candidate === undefined
      ? undefined
      : computeFeatureScope({
          featureId: feature.id,
          roots: candidate.rootNodes,
          nodes: buildEvidencePack(graph, candidate).nodes,
          relationships: buildEvidencePack(graph, candidate).relationships,
        });
  const document = compileGuidance({
    model,
    feature,
    graph,
    ...(candidate === undefined ? {} : { candidate }),
    ...(scope === undefined ? {} : { scope }),
  });

  const refs = new Set();
  for (const claim of model.claims) {
    if (claim.featureId !== feature.id) continue;
    if (claim.status !== 'structurally_verified') continue;
    for (const target of claim.assertion?.targets ?? []) refs.add(target);
    if (claim.assertion?.subjectRef !== undefined) refs.add(claim.assertion.subjectRef);
  }
  for (const element of feature.elements ?? []) refs.add(`element:${element}`);

  // Everything the output actually rests on. This is the Round 5 fix: a control
  // reached through action-target recovery, or a noun taken from an endpoint
  // path, is cited by the guidance and was invisible to the reviewer.
  const required = new Set();
  /** A relationship is evidence through its endpoints, which are what a user sees. */
  const cite = (ref) => {
    refs.add(ref);
    required.add(ref);
    if (!ref.includes('|')) return;
    const [source, , target] = ref.split('|');
    if (source) {
      refs.add(source);
      required.add(source);
    }
    if (target) {
      refs.add(target);
      required.add(target);
    }
  };
  for (const step of document.steps) {
    for (const ref of step.provenance.facts) cite(ref);
  }
  for (const entry of document.actionRecoveries) {
    refs.add(entry.control);
    required.add(entry.control);
    refs.add(entry.actionSurface);
  }
  for (const proposition of document.languagePropositions) {
    const support = proposition.support;
    if (support.kind === 'owned-node') {
      refs.add(support.nodeId);
      required.add(support.nodeId);
    }
    if (support.kind === 'claim-assertion') {
      const claim = model.claims.find((entry) => entry.id === support.claimId);
      if (claim?.assertion?.subjectRef !== undefined) {
        refs.add(claim.assertion.subjectRef);
        required.add(claim.assertion.subjectRef);
      }
      for (const target of claim?.assertion?.targets ?? []) refs.add(target);
    }
  }
  for (const condition of document.conditions) {
    for (const ref of condition.provenance.facts) cite(ref);
  }

  const facts = [];
  for (const ref of [...refs].sort()) {
    const sentence = describeFact(ref, feature.id);
    if (sentence !== undefined && !facts.includes(sentence)) facts.push(sentence);
  }

  // And what a browser watched. Neutral: an effect and its magnitude, never the
  // interpretation the reviewer is being asked to score.
  for (const record of runtimeByFeature.get(feature.id) ?? []) {
    for (const sentence of describeRuntimeFacts(record)) {
      if (!facts.includes(sentence)) facts.push(sentence);
    }
  }

  // Which refs an observation, rather than the source, put a sentence against.
  const observed = new Map();
  for (const record of runtimeByFeature.get(feature.id) ?? []) {
    observed.set(record.subjectRef, describeRuntimeFacts(record));
  }

  // --- Coverage, with no way out -----------------------------------------
  //
  // Four separate questions, reported separately, because "coverage" as one
  // number is what let a naming failure hide inside a passing metric.
  const CHECKABLE = new Set(['element', 'route', 'api', 'permission']);
  const cover = (ref, bucket) => {
    if (ref.includes('|')) return;
    if (!CHECKABLE.has(ref.split(':')[0])) return;
    coverage[bucket].required += 1;

    // Two ways a reviewer can check a reference, and the gate accepts either:
    // the structure says so, or a browser was watched doing it. The second is
    // what makes `invoices.list.open` scoreable at all — a row link the
    // interface never names, whose only description is what it did.
    const sentence = describeFact(ref, feature.id);
    const structural = sentence !== undefined && facts.includes(sentence);
    const behavioural = (observed.get(ref) ?? []).some((line) => facts.includes(line));
    if (structural || behavioural) coverage[bucket].covered += 1;
    else coverage.missing.push(`${feature.id} (${bucket}): ${ref}`);
  };

  for (const ref of [...required].sort()) cover(ref, 'proposition');

  // A step that tells a user to press something. The control has to exist, and
  // the name the sentence uses has to be the name the interface uses.
  for (const step of document.steps) {
    if (step.origin === 'synthetic-entry') continue;
    if (step.kind !== 'action') continue;
    for (const ref of step.provenance.facts) cover(ref, 'actionStep');

    const named = controlNameOf(step.proposition);
    if (named === undefined) continue;
    coverage.controlName.required += 1;
    const backed = facts.some((entry) => entry.includes(`"${named}"`));
    if (backed) coverage.controlName.covered += 1;
    else
      coverage.missing.push(
        `${feature.id} (controlName): the step names "${named}" and no fact establishes it`,
      );
  }

  // The title, when there is one. A withheld title needs nothing.
  if (document.title !== undefined) {
    coverage.title.required += 1;
    const backed = facts.some((entry) => entry.includes(`"${document.title.text}"`));
    if (backed) coverage.title.covered += 1;
    else
      coverage.missing.push(
        `${feature.id} (title): "${document.title.text}" has no fact behind it`,
      );
  }

  items.push({
    reviewId: null,
    featureId: feature.id,
    userContext: { screen: screenOf(feature.id), goal: 'Understand or use this feature' },
    productOutput: {
      title: document.title?.text ?? null,
      summary: document.summary?.text ?? null,
      purpose: document.purpose?.text ?? null,
      steps: document.steps.map((step) => realiseInstruction(step.proposition)).filter(Boolean),
      conditions: document.conditions.map((c) => tryRealise(c.proposition)).filter(Boolean),
      questions: document.questions.map((question) => question.text),
    },
    knownSupportedFacts: facts,
    // Said out loud rather than left as an empty array. An absent section reads
    // as a failed check; this reads as what it is.
    factsNote:
      facts.length === 0
        ? 'No independently checkable facts were available for this item. This says nothing about whether the output is correct — score correctness as "not_assessable".'
        : null,
    usefulness: null,
    correctness: null,
    clarity: null,
    actionability: null,
    naturalLanguage: null,
    flags: [],
    note: '',
  });

  key.push({
    featureId: feature.id,
    band: dataset.candidates.find((entry) => (entry.id ?? entry) === feature.id)?.band ?? null,
    completeness: document.completeness,
    taskCompletion: document.taskCompletion,
    hasVerifiedCapability: model.claims.some(
      (claim) =>
        claim.featureId === feature.id &&
        claim.type === 'capability' &&
        claim.status === 'structurally_verified',
    ),
    hasWorkflow: document.steps.length > 0,
    stepCount: document.steps.length,
    taskStepCount: document.steps.filter((step) => step.origin !== 'synthetic-entry').length,
    // What Closed Loop #6 changed, recorded per feature so the scores can be
    // correlated against it afterwards. Never shown to the reviewer.
    recoveredTargets: document.actionRecoveries.map((entry) => ({
      rule: entry.rule,
      from: entry.from,
      relationship: entry.relationship,
      actionSurface: entry.actionSurface,
      control: entry.control,
    })),
    title: document.title?.text ?? null,
    titleOrigin: document.titleEvidence?.origin ?? null,
    titleWithheld: document.title === undefined,
    languagePropositions: document.languagePropositions.length,
    withheldLanguage: document.withheldLanguage.length,
    hasCompiledPurpose: document.purpose !== undefined,
    questionCount: document.questions.length,
    entryStepSuppressed: document.diagnostics.some(
      (entry) => entry.code === 'REDUNDANT_ENTRY_STEP',
    ),
    diagnostics: document.diagnostics.map((entry) => entry.code),
  });
}

const pct = (b) => (b.required === 0 ? '—' : `${((b.covered / b.required) * 100).toFixed(1)}%`);
console.log('\nReview fact coverage — no exclusions\n');
console.log(
  `  factual propositions   ${String(coverage.proposition.covered).padStart(3)}/${String(coverage.proposition.required).padEnd(3)}  ${pct(coverage.proposition)}`,
);
console.log(
  `  action steps           ${String(coverage.actionStep.covered).padStart(3)}/${String(coverage.actionStep.required).padEnd(3)}  ${pct(coverage.actionStep)}`,
);
console.log(
  `  control names          ${String(coverage.controlName.covered).padStart(3)}/${String(coverage.controlName.required).padEnd(3)}  ${pct(coverage.controlName)}`,
);
console.log(
  `  titles                 ${String(coverage.title.covered).padStart(3)}/${String(coverage.title.required).padEnd(3)}  ${pct(coverage.title)}`,
);
if (coverage.missing.length > 0) {
  console.log('\nFAIL — an emitted surface has no fact a reviewer could check it against:\n');
  for (const entry of coverage.missing.slice(0, 30)) console.log(`  \u2717 ${entry}`);
  console.log('');
  process.exit(1);
}

// Nothing is written past this point when only the coverage question was asked.
//
// This exit used to sit *below* the three `writeFileSync` calls, so
// `test:review-fact-coverage` rewrote the issued package on every run — and it
// rewrote it with the current compiler's output, which is how Round 6's
// artefact acquired a Closed Loop #8 title of `null` where the reviewer had been
// shown `Search`. `test:artifact-integrity` could not catch it: the rewrite is
// deterministic, so once it had happened the before-and-after hashes agreed.
// A gate that quietly edits the evidence it is checking is worse than no gate.
if (CHECK_ONLY) {
  console.log(`\nPASS — every emitted proposition has a fact a reviewer can check it against.\n`);
  process.exit(0);
}

const shuffled = shuffle(items, seededRandom(SEED));
shuffled.forEach((item, index) => {
  item.reviewId = `R${String(index + 1).padStart(2, '0')}`;
});

const RUBRIC = {
  usefulness: {
    0: 'Useless. Accurate or not, this would not meaningfully help a user — repeats technical identifiers, or contains no understandable purpose or actionable guidance.',
    1: 'Minimally useful. The user can roughly understand what the feature is, but guidance is incomplete, awkward, or too technical.',
    2: 'Useful. A normal end user could understand the feature and get meaningful help. Accurate, understandable, sufficiently actionable.',
    3: 'Excellent. Clear, concise, natural and genuinely helpful. Explains the purpose well and provides strong supported guidance without unnecessary technical language.',
  },
  correctness: {
    not_assessable:
      'No checkable facts were supplied for this item. Use this rather than 0 — it is not a judgement about the output.',
    0: 'Says something untrue of the application, judged against knownSupportedFacts.',
    1: 'Acceptable: nothing untrue, but imprecise or overreaching in places.',
    2: 'Strong: everything it says is supported by the facts supplied.',
  },
  dimensions: {
    scale: { 0: 'poor', 1: 'acceptable', 2: 'strong' },
    clarity: 'Would a non-technical user understand it on one read?',
    actionability: 'Could a user act on it, or does it only describe?',
    naturalLanguage: 'Does it read like a person wrote it for a user?',
  },
  flags: [
    'too_technical',
    'too_vague',
    'missing_capability',
    'missing_workflow',
    'incorrect_fact',
    'irrelevant_information',
    'repetitive',
    'good_as_is',
  ],
};

const artefact = {
  package: 'human-review-round-8',
  gateVersion: 'v2',
  scoredBy: null,
  /**
   * Who reviewed, as a kind. Mandatory at import, and the field the formal gate
   * turns on: a capable model produces useful independent evidence and does not
   * close the Human Usefulness Gate.
   */
  reviewerType: null,
  scoredAt: null,
  instructions: [
    'Judge the output as if you were an end user encountering this help inside an application.',
    'Do not award points because the output is technically safe, evidence-backed, or generated through an impressive architecture.',
    'The only question is whether the resulting help is correct and useful.',
    'Score every item. Leave nothing null.',
    'Score correctness as "not_assessable" when no checkable facts were supplied — do NOT score it 0. Zero means you found something untrue.',
    '"knownSupportedFacts" lists what the application genuinely does, so you can judge correctness without reading source code. It is not part of the output being scored.',
    'An item that is accurate but tells a user nothing is not a good item. Say so with a low usefulness score.',
    'Silence is a deliberate choice in this system. A feature that says less than you expected may be correct to do so — judge whether what IS said helps, and whether what is missing was needed.',
    'Set "reviewerType" to "human" or "non_human_independent". The formal Human Usefulness Gate closes only on a human review.',
  ],
  rubric: RUBRIC,
  itemCount: shuffled.length,
  items: shuffled,
};

writeFileSync(
  path.join(BENCH, 'human-review-round-8.json'),
  `${JSON.stringify(artefact, null, 2)}\n`,
);
writeFileSync(
  path.join(BENCH, 'human-review-round-8.key.json'),
  `${JSON.stringify(
    {
      warning:
        'Do NOT give this file to the reviewer. It holds the variables the scores will be correlated against. Open it only after scores are imported.',
      seed: SEED,
      shuffleAlgorithm: 'mulberry32 + Fisher-Yates',
      order: shuffled.map((item) => ({ reviewId: item.reviewId, featureId: item.featureId })),
      hidden: key,
    },
    null,
    2,
  )}\n`,
);

const md = [
  '# Human review — Round 8',
  '',
  '> Judge the output as if you were an end user encountering this help inside an application.',
  '>',
  '> Do not award points because the output is technically safe, evidence-backed, or generated',
  '> through an impressive architecture. **The only question is whether the resulting help is',
  '> correct and useful.**',
  '',
  'Silence is a deliberate choice in this system. A feature that says less than you expected may be',
  'correct to do so — judge whether what **is** said helps, and whether what is missing was needed.',
  '',
  '## Usefulness, 0–3',
  '',
  ...Object.entries(RUBRIC.usefulness).map(([score, text]) => `- **${score}** — ${text}`),
  '',
  '## Correctness',
  '',
  ...Object.entries(RUBRIC.correctness).map(([score, text]) => `- **${score}** — ${text}`),
  '',
  '## Three more dimensions, 0–2 each',
  '',
  '`0` poor · `1` acceptable · `2` strong',
  '',
  `- **clarity** — ${RUBRIC.dimensions.clarity}`,
  `- **actionability** — ${RUBRIC.dimensions.actionability}`,
  `- **naturalLanguage** — ${RUBRIC.dimensions.naturalLanguage}`,
  '',
  '## Flags',
  '',
  RUBRIC.flags.map((entry) => `\`${entry}\``).join(' · '),
  '',
  '---',
  '',
];

for (const item of shuffled) md.push(...renderReviewItem(item));

writeFileSync(path.join(BENCH, 'human-review-round-8.md'), `${md.join('\n')}\n`);

const withFacts = shuffled.filter((item) => item.knownSupportedFacts.length > 0).length;
console.log(`\nWrote ${shuffled.length} blinded review items (gate v2).`);
console.log(`  items carrying checkable facts: ${withFacts}/${shuffled.length}`);
console.log('  benchmarks/provider-reality-check/human-review-round-8.json');
console.log('  benchmarks/provider-reality-check/human-review-round-8.md');
console.log('  benchmarks/provider-reality-check/human-review-round-8.key.json  (do not share)');
console.log(`Seed: ${SEED}\n`);
