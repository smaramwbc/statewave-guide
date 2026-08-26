/**
 * Builds the blinded package a human scores Round 2 usefulness from.
 *
 * Everything this script removes, it removes for one reason: a reviewer who can
 * see how the pipeline judged its own output will score the judgement instead of
 * the output. Six things are therefore absent from the reviewer's copy.
 *
 * - **Which provider and model produced it.** A name carries a prior.
 * - **Whether a claim was structurally verified or semantically grounded.** This
 *   is the important one. The whole architecture exists to make that
 *   distinction, and showing it invites a reviewer to award points for it. The
 *   question being asked is not "did the machinery work", it is "would this help
 *   anyone".
 * - **The difficulty band.** `easy`, `hard` and `refusal` are our expectations,
 *   and an expectation shown to a reviewer is an instruction.
 * - **The gold set.** It is the answer key.
 * - **Every internal metric**, and any Round 1 output to compare against.
 * - **Scope and opportunity counts.** Implementation, and flattering.
 *
 * Those hidden variables are not discarded: they go to
 * `human-review-round-2.key.json`, which exists so the correlations in the
 * milestone brief can be run *after* scores arrive without the reviewer ever
 * having seen the variables being correlated against.
 *
 * No provider is called. Everything here is read from artefacts already on disk
 * and from a local index of the fixture.
 *
 * Usage:
 *   node scripts/build-human-review.mjs [--seed 20260826]
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import {
  buildEvidencePack,
  computeFeatureScope,
  discoverFeatureCandidates,
  planClaimOpportunities,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * The shuffle seed, recorded rather than chosen at run time.
 *
 * A random order nobody can reproduce is not a blind, it is a lost result: the
 * mapping from review position back to feature has to survive to be correlated.
 */
const SEED = Number(flag('seed', '20260826'));

/** mulberry32. Small, seeded, and identical on every machine. */
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

/** Fisher-Yates, driven by the seeded generator. */
function shuffle(items, random) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

const source = JSON.parse(readFileSync(path.join(BENCH, 'review-round-2.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));

const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const edgeById = new Map(graph.relationships.map((edge) => [edge.id, edge]));

const candidates = discoverFeatureCandidates(graph);
const knownFeatureIds = new Set(candidates.map((entry) => entry.id));

/**
 * What the application demonstrably does, for one feature.
 *
 * Recomputed here rather than read from the run, and deliberately so: these are
 * the facts the graph establishes, which is exactly what a reviewer needs to
 * judge correctness against. They are a property of the code, not of anything a
 * model said about it, so no provider is involved and the same 21 features
 * produce the same list every time.
 */
function establishedFacts(featureId) {
  const candidate = candidates.find((entry) => entry.id === featureId);
  if (candidate === undefined) return [];
  const pack = buildEvidencePack(graph, candidate);
  const scope = computeFeatureScope({
    featureId,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const plan = planClaimOpportunities({ candidate, knownFeatureIds, pack, graph, scope });

  const refs = [];
  for (const entry of scope.entries()) {
    if (entry.scope === 'OWNED') refs.push(entry.nodeId);
  }
  for (const opportunity of plan) refs.push(...opportunity.targets);

  const sentences = [];
  for (const ref of refs) {
    const sentence = describeFact(ref);
    if (sentence !== undefined && !sentences.includes(sentence)) sentences.push(sentence);
  }
  return sentences;
}

/**
 * One graph fact, in a sentence a reviewer can check without opening the source.
 *
 * Deliberately mechanical rather than generated. The point of this section is to
 * let someone judge correctness, so it must not itself be a piece of writing
 * that could be wrong.
 *
 * Components and functions are omitted on purpose. `ClientForm` and
 * `submitClient` are how the application is built, and a reviewer asked whether
 * help is useful to an end user should be shown what an end user can see: the
 * controls, the screens, the requests and the permissions.
 */
function describeFact(ref) {
  const node = nodeById.get(ref);
  if (node !== undefined) {
    switch (node.kind) {
      case 'element': {
        const label = node.label;
        // An unlabelled control is a real thing a reviewer may still need to
        // know about, but naming it by its identifier would be putting the
        // technical vocabulary back that this section exists to keep out.
        return label === undefined ? undefined : `The screen has a control labelled "${label}".`;
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

  const edge = edgeById.get(ref);
  if (edge === undefined) return undefined;
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  const from = source?.label;
  switch (edge.type) {
    case 'submits_to':
      return from === undefined
        ? 'A form on this screen can be submitted.'
        : `Submitting "${from}" sends its form.`;
    case 'calls_api':
      return target === undefined
        ? undefined
        : `Doing this sends a ${target.method} request to ${target.path}.`;
    case 'requires_permission':
      return target === undefined
        ? undefined
        : `Using this requires the "${target.permission}" permission.`;
    case 'navigates_to':
      return target === undefined
        ? undefined
        : `${from === undefined ? 'This' : `"${from}"`} takes the user to ${target.path}.`;
    case 'opens':
      return from === undefined ? undefined : `"${from}" opens a dialog.`;
    default:
      return undefined;
  }
}

/**
 * Where a reviewer would be standing when they met this feature.
 *
 * Derived from the graph rather than from the gold set: the gold set is the
 * answer key, and reading it here — even for something as small as a screen
 * name — would put a corner of it in front of the reviewer.
 */
function screenOf(featureId) {
  const head = featureId.split('.')[0] ?? featureId;
  const route = graph.nodes.find((node) => node.kind === 'route' && node.path === `/${head}`);
  if (route?.componentName !== undefined) {
    return route.componentName.replace(/Page$/, '');
  }
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/** The generated title, taken from the rendered page's heading. */
function titleOf(document) {
  const match = /^# (.+)$/m.exec(document ?? '');
  return match?.[1]?.trim() ?? null;
}

/** The generated description: the paragraph under the heading. */
function descriptionOf(document) {
  const lines = (document ?? '').split('\n');
  const heading = lines.findIndex((line) => line.startsWith('# '));
  if (heading === -1) return null;
  for (let index = heading + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? '';
    if (line === '') continue;
    if (line.startsWith('_') || line.startsWith('<!--') || line.startsWith('#')) break;
    return line;
  }
  return null;
}

const items = [];
const key = [];

for (const entry of source.features) {
  // Questions and facts come from the structured claims, never from the
  // rendered page: that page states verification status on every row.
  const questions = entry.acceptedClaims
    .filter((claim) => claim.type === 'user_question')
    .map((claim) => claim.text);

  const facts = establishedFacts(entry.featureId);

  const purpose = entry.acceptedClaims.find((claim) => claim.type === 'purpose')?.text ?? null;

  items.push({
    reviewId: null, // assigned after the shuffle, so it carries no ordering
    featureId: entry.featureId,
    userContext: {
      screen: screenOf(entry.featureId),
      goal: 'Understand or use this feature',
    },
    productOutput: {
      title: titleOf(entry.renderedDocument),
      description: descriptionOf(entry.renderedDocument),
      purpose,
      questions,
      workflow: entry.workflow ?? [],
    },
    knownSupportedFacts: facts,
    usefulness: null,
    correctness: null,
    clarity: null,
    actionability: null,
    naturalLanguage: null,
    flags: [],
    note: '',
  });

  // Everything the reviewer must not see, kept for the post-scoring analysis.
  key.push({
    featureId: entry.featureId,
    band: entry.band,
    hasVerifiedCapability: entry.acceptedClaims.some(
      (claim) => claim.type === 'capability' && claim.status === 'structurally_verified',
    ),
    hasWorkflow: (entry.workflow ?? []).length > 0,
    claimCount: entry.acceptedClaims.length,
    composition: entry.acceptedClaims.reduce((counts, claim) => {
      counts[claim.type] = (counts[claim.type] ?? 0) + 1;
      return counts;
    }, {}),
    structurallyVerified: entry.acceptedClaims.filter(
      (claim) => claim.status === 'structurally_verified',
    ).length,
    semanticallyGrounded: entry.acceptedClaims.filter(
      (claim) => claim.status === 'semantically_grounded',
    ).length,
    refusedCount: (entry.refusedClaims ?? []).length,
    opportunitiesOffered: (entry.opportunitiesOffered ?? []).length,
  });
}

const shuffled = shuffle(items, seededRandom(SEED));
shuffled.forEach((item, index) => {
  item.reviewId = `R${String(index + 1).padStart(2, '0')}`;
});

const REVIEWER_INSTRUCTIONS = [
  'Judge the output as if you were an end user encountering this help inside an application.',
  'Do not award points because the output is technically safe, evidence-backed, or generated through an impressive architecture.',
  'The only question is whether the resulting help is correct and useful.',
  'Score every item. Leave nothing null.',
  '"knownSupportedFacts" lists what the application genuinely does, so you can judge correctness without reading source code. It is not part of the output being scored.',
  'An item that is accurate but tells a user nothing is not a good item. Say so with a low score.',
];

const RUBRIC = {
  usefulness: {
    0: 'Useless. Accurate or not, this would not meaningfully help a user — repeats technical identifiers, says "use clients.create", or contains no understandable purpose or actionable guidance.',
    1: 'Minimally useful. The user can roughly understand what the feature is, but guidance is incomplete, awkward, or too technical.',
    2: 'Useful. A normal end user could understand the feature and get meaningful help. Accurate, understandable, sufficiently actionable.',
    3: 'Excellent. Clear, concise, natural and genuinely helpful. Explains the purpose well and provides strong supported guidance without unnecessary technical language.',
  },
  dimensions: {
    scale: { 0: 'poor', 1: 'acceptable', 2: 'strong' },
    correctness:
      'Does it say anything untrue of the application, judged against knownSupportedFacts?',
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
  package: 'human-review-round-2',
  gateVersion: 'v1',
  scoredBy: null,
  scoredAt: null,
  instructions: REVIEWER_INSTRUCTIONS,
  rubric: RUBRIC,
  itemCount: shuffled.length,
  items: shuffled,
};

writeFileSync(
  path.join(BENCH, 'human-review-round-2.json'),
  `${JSON.stringify(artefact, null, 2)}\n`,
);

writeFileSync(
  path.join(BENCH, 'human-review-round-2.key.json'),
  `${JSON.stringify(
    {
      warning:
        'Do NOT give this file to the reviewer. It holds the variables the scores will be correlated against, and the difficulty bands. Open it only after scores are imported.',
      seed: SEED,
      shuffleAlgorithm: 'mulberry32 + Fisher-Yates',
      order: shuffled.map((item) => ({ reviewId: item.reviewId, featureId: item.featureId })),
      hidden: key,
    },
    null,
    2,
  )}\n`,
);

// --- The readable copy ------------------------------------------------------

const md = [
  '# Human review — Round 2',
  '',
  '> Judge the output as if you were an end user encountering this help inside an application.',
  '>',
  '> Do not award points because the output is technically safe, evidence-backed, or generated',
  '> through an impressive architecture. **The only question is whether the resulting help is',
  '> correct and useful.**',
  '',
  'Record your scores in `human-review-round-2.json` — every item, no nulls left — then run',
  '`pnpm benchmark:human-review --file <your-copy>.json`.',
  '',
  '## Usefulness, 0–3',
  '',
  ...Object.entries(RUBRIC.usefulness).map(([score, text]) => `- **${score}** — ${text}`),
  '',
  '## Four dimensions, 0–2 each',
  '',
  '`0` poor · `1` acceptable · `2` strong',
  '',
  `- **correctness** — ${RUBRIC.dimensions.correctness}`,
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

for (const item of shuffled) {
  md.push(`## ${item.reviewId}`, '');
  md.push(`**Screen:** ${item.userContext.screen}  `);
  md.push(`**Goal:** ${item.userContext.goal}`, '');
  md.push('### What the product says', '');
  md.push(`**${item.productOutput.title ?? '(no title)'}**`, '');
  if (item.productOutput.description) md.push(item.productOutput.description, '');
  if (item.productOutput.purpose) md.push(`_${item.productOutput.purpose}_`, '');
  if (item.productOutput.questions.length > 0) {
    md.push('Questions it answers:', '');
    for (const question of item.productOutput.questions) md.push(`- ${question}`);
    md.push('');
  }
  if (item.productOutput.workflow.length > 0) {
    md.push('Steps:', '');
    for (const step of item.productOutput.workflow) md.push(`- ${step}`);
    md.push('');
  } else {
    md.push('_No steps were produced for this feature._', '');
  }
  md.push('### What the application actually does', '');
  if (item.knownSupportedFacts.length === 0) {
    md.push('_Nothing was established about this feature._', '');
  } else {
    for (const fact of item.knownSupportedFacts) md.push(`- ${fact}`);
    md.push('');
  }
  md.push(
    '| usefulness | correctness | clarity | actionability | naturalLanguage |',
    '| --- | --- | --- | --- | --- |',
    '|  |  |  |  |  |',
    '',
    'Flags: ',
    '',
    'Note: ',
    '',
    '---',
    '',
  );
}

writeFileSync(path.join(BENCH, 'human-review-round-2.md'), `${md.join('\n')}\n`);

console.log(`Wrote ${shuffled.length} blinded review items.`);
console.log(`  benchmarks/provider-reality-check/human-review-round-2.json`);
console.log(`  benchmarks/provider-reality-check/human-review-round-2.md`);
console.log(`  benchmarks/provider-reality-check/human-review-round-2.key.json  (do not share)`);
console.log(`Seed: ${SEED}`);
