/**
 * The blinded review package for Round 3, and the instrument fixes it needed.
 *
 * Round 2's package had a flaw that its own results exposed. Six features
 * produced no checkable facts, because their only owned node is an unlabelled
 * display element and the fact renderer had nothing to say about one. The
 * reviewer scored correctness **0** on all six, unanimously — and then flagged
 * `incorrect_fact` on none of them. They were not saying the output was wrong.
 * They were saying they could not tell, and zero was the only box available.
 *
 * So gate v2 makes two changes and leaves everything else alone:
 *
 * - **Correctness gains `not_assessable`.** A reviewer who cannot check a claim
 *   says so, and that answer is excluded from the correctness mean rather than
 *   counted as a failure. Usefulness scoring is untouched, because usefulness
 *   was never the confounded measure.
 * - **An empty fact list says what it means.** Instead of an absent section,
 *   the item carries "No independently checkable facts were available for this
 *   item" — which is a statement about our evidence, not about the output.
 *
 * Section 27's other request is handled too: an unlabelled element can still
 * support a neutral structural fact — *the screen contains a read-only code
 * display* — drawn from the tag the indexer actually recorded. What it may not
 * support is a guess at what the element is *for*.
 *
 * No provider is called. Guidance is compiled from the frozen Round 2
 * ProductModel, which is the whole point: the only variable that moved between
 * rounds is the presentation.
 *
 * Usage:
 *   node scripts/build-human-review-3.mjs [--seed 20260827]
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
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
const SEED = Number(flag('seed', '20260828'));

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

const captured = JSON.parse(readFileSync(path.join(BENCH, 'round-2-product-model.json'), 'utf8'));
const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const model = captured.model;

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

const items = [];
const key = [];

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

  const facts = [];
  for (const ref of [...refs].sort()) {
    const sentence = describeFact(ref, feature.id);
    if (sentence !== undefined && !facts.includes(sentence)) facts.push(sentence);
  }

  items.push({
    reviewId: null,
    featureId: feature.id,
    userContext: { screen: screenOf(feature.id), goal: 'Understand or use this feature' },
    productOutput: {
      title: document.title.text,
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
    diagnostics: document.diagnostics.map((entry) => entry.code),
  });
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
  package: 'human-review-round-4',
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
  path.join(BENCH, 'human-review-round-4.json'),
  `${JSON.stringify(artefact, null, 2)}\n`,
);
writeFileSync(
  path.join(BENCH, 'human-review-round-4.key.json'),
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
  '# Human review — Round 4',
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

for (const item of shuffled) {
  md.push(`## ${item.reviewId}`, '');
  md.push(`**Screen:** ${item.userContext.screen}  `);
  md.push(`**Goal:** ${item.userContext.goal}`, '');
  md.push('### What the product says', '');
  md.push(`**${item.productOutput.title}**`, '');
  if (item.productOutput.summary) md.push(item.productOutput.summary, '');
  if (item.productOutput.purpose) md.push(`_${item.productOutput.purpose}_`, '');
  if (item.productOutput.steps.length > 0) {
    md.push('Steps:', '');
    item.productOutput.steps.forEach((step, index) => md.push(`${index + 1}. ${step}`));
    md.push('');
  }
  for (const condition of item.productOutput.conditions) md.push(`- ${condition}`);
  if (item.productOutput.conditions.length > 0) md.push('');
  if (item.productOutput.questions.length > 0) {
    md.push('Questions it answers:', '');
    for (const question of item.productOutput.questions) md.push(`- ${question}`);
    md.push('');
  }
  md.push('### What the application actually does', '');
  if (item.knownSupportedFacts.length === 0) {
    md.push(`_${item.factsNote}_`, '');
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

writeFileSync(path.join(BENCH, 'human-review-round-4.md'), `${md.join('\n')}\n`);

const withFacts = shuffled.filter((item) => item.knownSupportedFacts.length > 0).length;
console.log(`\nWrote ${shuffled.length} blinded review items (gate v2).`);
console.log(`  items carrying checkable facts: ${withFacts}/${shuffled.length}`);
console.log('  benchmarks/provider-reality-check/human-review-round-4.json');
console.log('  benchmarks/provider-reality-check/human-review-round-4.md');
console.log('  benchmarks/provider-reality-check/human-review-round-4.key.json  (do not share)');
console.log(`Seed: ${SEED}\n`);
