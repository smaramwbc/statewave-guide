/**
 * The reviewer's copy of the runtime-visible-language experiment.
 *
 * Derived from the capture by pure re-projection — no browser, no screenshots
 * recaptured, no product executed.
 *
 * The instrument is shaped by what the last review found. Visual Context Review
 * V1 scored the geometry-only sentence 1.00/3 for helpfulness and 0.63/2 for
 * non-redundancy, and concluded that the useful contextual output was
 * substantially redundant with evidence the user already had. That is a finding
 * about a sentence, so this round puts two sentences side by side and asks which
 * one a person would rather have read — including the answer that neither was
 * worth the words.
 *
 * Nothing here is scored. The engineering facts are kept in a separate block
 * from the rubric, and Closed Loop #17's audit is the reason: a reviewer reading
 * a green verdict beside an empty score box has the answer sitting inside the
 * question.
 *
 * Usage:
 *   node scripts/build-runtime-language-review.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'runtime-visible-language-review-v1');
const RECORD = path.join(DIR, 'runtime-language-evidence.json');
const RECEIPTS = path.join(DIR, 'contextual-receipts.json');
const OUT = path.join(DIR, 'runtime-visible-language-review-v1.package.json');
const CHECK = process.argv.includes('--check');

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const receipts = JSON.parse(readFileSync(RECEIPTS, 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const scene = (id) => record.scenes.find((entry) => entry.id === id);
const problems = [];

/**
 * Six dimensions, and one of them counts the other way.
 *
 * `redundancy` asks how much of the sentence the screen had already told the
 * user — so a *high* score is a *bad* result, and the previous round reported
 * the same idea inverted as "non-redundancy 0.63/2". Direction is stated on
 * every dimension rather than left to the name, because a reviewer who guesses
 * wrong here inverts the finding this whole loop exists to test.
 */
const RUBRIC = {
  naturalness: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    asks: 'Does it read like something a person would say?',
  },
  helpfulness: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    asks: 'Did it get you to the right thing faster than nothing would have?',
  },
  truthfulness: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    asks: 'Is everything it says true of what is on the screen?',
  },
  specificity: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    asks: 'Does it identify one thing, rather than several things it could mean?',
  },
  redundancy: {
    min: 0,
    max: 2,
    higherIsBetter: false,
    asks: 'How much of this had the screen already told you? Higher means more redundant, which is worse.',
    note: 'The previous round measured the inverse of this. See previousRound.directionWarning before comparing.',
  },
  restraintCost: {
    min: 0,
    max: 2,
    higherIsBetter: false,
    asks: 'Where the guide declined to say something, how stuck were you left? Higher means more stuck, which is worse.',
  },
};
const BLANK = Object.fromEntries(Object.keys(RUBRIC).map((key) => [key, null]));

/**
 * The three forms a reviewer chooses between, and the fourth answer available.
 *
 * `BASE` is the answer with no contextual sentence at all. It is not a fourth
 * capture: the guide renders the sentence as its own element, so BASE is the
 * captured answer with that exact substring removed — arithmetic on frozen
 * bytes, the same derivation Closed Loop #17's freeze used and defended.
 *
 * `NEITHER` is not a form. It is the answer that no contextual sentence was
 * worth having, and it is the outcome the previous round's numbers make most
 * plausible.
 */
const FORMS = ['BASE', 'GEOMETRY', 'RUNTIME_VISIBLE_LANGUAGE'];
const PREFERRED_FORM_VALUES = [...FORMS, 'NEITHER'];
const BLANK_FORMS = Object.fromEntries(FORMS.map((form) => [form, { ...BLANK }]));

const QUESTIONS = {
  A: 'Does borrowing words the interface is showing make guidance more natural?',
  B: 'Is the richer sentence actually better than the geometry-only one, or merely longer?',
  C: 'Where the guide stops describing something, is the silence understandable?',
  D: 'Does the freshness rule behave the way a user would expect when they type?',
  E: 'Does anything here read as though the guide had named the control?',
  F: 'Is the remaining output still substantially redundant with what the screen shows?',
};

const CLASSIFICATIONS = [
  'RUNTIME_LANGUAGE_HELPS',
  'RUNTIME_LANGUAGE_NOT_USEFUL',
  'GEOMETRY_SUFFICIENT',
  'STILL_REDUNDANT',
  'READS_AS_A_NAME',
  'SILENCE_UNEXPLAINED',
  'STALENESS_WRONG',
  'PRIVACY_CONSTRAINT',
  'CORRECT_REFUSAL',
  'MISSING_PRODUCT_KNOWLEDGE',
  'OTHER',
];

const ITEMS = [
  {
    id: 'RV01',
    bearsOn: ['A', 'B', 'E', 'F'],
    asks: 'A field the interface never names, showing a placeholder it does display.',
    context:
      'The placeholder reads "Search clients". ADR 0018 refuses to let that become a title, and this loop does not change that. The question is whether it may be quoted as something currently on screen.',
    explicitQuestions: [
      'Is quoting "Search clients" helpful, or is it repeating what the user is already looking at?',
      'Is "the field showing" natural English, or does it read as machinery?',
      'Is "above the list" still needed once the placeholder is quoted, or has the quote already identified the control?',
      'Is the entire contextual sentence redundant, given that the control is visible on the same screen?',
      'Does the Show me button make both descriptions mostly unnecessary?',
    ],
  },
  {
    id: 'RV01b',
    bearsOn: ['C', 'D'],
    asks: 'The same field after a user has typed into it.',
    context:
      'The browser keeps the placeholder attribute and stops painting it. Judge whether what the guide says next matches what the user can see.',
  },
  {
    id: 'RV02',
    bearsOn: ['C', 'F'],
    asks: 'Phone width, where the guide sheet covers the application.',
    context: 'Judge the absence as much as any sentence.',
  },
  {
    id: 'RV03',
    bearsOn: ['C', 'F'],
    asks: 'A screen displaying an API key.',
    context:
      'The key is on screen. Judge whether what the guide says stays useful while never repeating it. Note that here the contextual sentence is the entire prose of the answer: BASE leaves a button and no words, so scoring BASE on naturalness is scoring the absence of a sentence rather than a sentence.',
  },
  {
    id: 'RV04',
    bearsOn: ['C'],
    asks: 'Rows displaying INV-001 and INV-002 where nothing establishes the concept.',
    context:
      'The identifiers are plainly visible. The guide has nothing verified to say about invoices here.',
  },
  {
    id: 'RV05',
    bearsOn: ['C'],
    asks: 'The same rows on the screen that does establish the concept.',
    context: 'Read beside RV04.',
  },
  {
    id: 'RV06',
    bearsOn: ['A', 'E'],
    asks: 'A note field a user filled in with instructions aimed at whoever reads the screen.',
    context:
      'The note is application content. Judge the answer the guide gave, and whether the note changed it.',
  },
];

/**
 * The answer with its contextual sentence removed.
 *
 * Sound only while the sentence appears in the answer exactly once, as its own
 * rendered element. Both conditions are checked rather than assumed, and an item
 * that fails them is reported instead of guessed at.
 */
function baseAnswer(captured, id) {
  const sentence = captured.contextualSentence;
  if (sentence === null) return captured.answerText;
  const occurrences = captured.answerText.split(sentence).length - 1;
  if (occurrences !== 1) {
    problems.push(
      `${id}: the contextual sentence appears ${occurrences} times, so removing it is not arithmetic`,
    );
    return null;
  }
  return captured.answerText.replace(sentence, '');
}

const items = ITEMS.map((entry) => {
  const source = scene(entry.id);
  if (source === undefined) {
    problems.push(`${entry.id} is not in the capture`);
    return null;
  }
  const language = source.WITH_VISIBLE_TEXT;
  const geometry = source.GEOMETRY_ONLY;
  const receipt = receipts.receipts.find((item) => item.scene === entry.id) ?? null;

  const forms = {
    BASE: {
      captured: false,
      contextualSentence: null,
      fullAnswer: baseAnswer(language, entry.id),
      derivedBySubtraction: true,
      screenshot: null,
      note: 'The captured answer with the contextual paragraph removed. No separate capture exists, and no build produces it: ContextualSentenceForm has only GEOMETRY_ONLY and WITH_VISIBLE_TEXT, so choosing BASE is choosing behaviour that would have to be implemented — trivially, by not rendering the element — rather than behaviour that was observed.',
      renderableByAnyShippedBuild: false,
    },
    GEOMETRY: {
      contextualSentence: geometry?.contextualSentence ?? null,
      fullAnswer: geometry?.answerText ?? null,
      derivedBySubtraction: false,
      screenshot: geometry?.screenshot ?? null,
      screenshotSha256: geometry?.screenshotSha256 ?? null,
      // RV01b was captured once, because that scene *is* the transition: the
      // placeholder is already gone, so both forms would render the geometry
      // fallback and the second run would be the same picture. An empty form
      // presented for scoring would look like an omission rather than a
      // deliberate absence.
      captured: geometry !== null && geometry !== undefined,
      ...(geometry === null || geometry === undefined
        ? {
            notCapturedBecause:
              'this scene has no runtime-visible text to omit, so both forms render the same sentence',
          }
        : {}),
    },
    RUNTIME_VISIBLE_LANGUAGE: {
      captured: true,
      contextualSentence: language.contextualSentence,
      fullAnswer: language.answerText,
      derivedBySubtraction: false,
      screenshot: language.screenshot,
      screenshotSha256: language.screenshotSha256,
    },
  };

  // Where no contextual sentence was rendered at all, the three forms are the
  // same words. Saying so stops a reviewer hunting for a difference that is not
  // there, and the item is still worth scoring — silence is a choice.
  const distinct = new Set(
    Object.values(forms)
      .map((form) => form.fullAnswer)
      .filter((text) => text !== null),
  );
  // Which pairs are the same words. RV03 has no placeholder to quote, so its
  // two captured forms are byte-identical down to the screenshot — asking a
  // reviewer to prefer one over the other would be asking them to prefer a
  // string over itself.
  const identicalPairs = [];
  const names = Object.keys(forms);
  for (let a = 0; a < names.length; a += 1) {
    for (let b = a + 1; b < names.length; b += 1) {
      if (
        forms[names[a]].fullAnswer !== null &&
        forms[names[a]].fullAnswer === forms[names[b]].fullAnswer
      ) {
        identicalPairs.push([names[a], names[b]]);
      }
    }
  }

  return {
    id: entry.id,
    bearsOnQuestions: entry.bearsOn,
    asks: entry.asks,
    context: entry.context,
    ...(entry.explicitQuestions === undefined
      ? {}
      : { explicitQuestions: entry.explicitQuestions }),
    route: source.route,
    question: source.question,
    viewport: source.viewport,
    forms,
    formsAreIdentical: distinct.size === 1,
    identicalPairs,
    /**
     * A pointer, not the receipt.
     *
     * Closed Loop #17's audit found correlation verdicts embedded in its scored
     * items and named the problem exactly: a reviewer reading an engineering
     * verdict beside an empty score box has the answer sitting inside the
     * question. The receipts live in `contextualReceipts`, a sibling of the
     * items, and this is the id that finds one.
     */
    receiptRef: receipt === null || receipt.receiptId === null ? null : receipt.receiptId,
    scores: JSON.parse(JSON.stringify(BLANK_FORMS)),
    preferredForm: null,
    dominantCause: null,
    comment: null,
  };
}).filter((entry) => entry !== null);

const withSentence = items.filter(
  (item) => item.forms.RUNTIME_VISIBLE_LANGUAGE.contextualSentence !== null,
);
/**
 * Items whose sentence actually quotes something the interface is showing.
 *
 * Two, not four. An audit caught the first draft publishing the wider count as
 * `itemsWithARuntimeDescriptor`, which doubled the apparent evidence for the
 * question this whole round exists to answer: RV01b and RV03 render the
 * geometry fallback, and a fallback is not a descriptor.
 */
const withDescriptor = items.filter((item) =>
  (item.forms.RUNTIME_VISIBLE_LANGUAGE.contextualSentence ?? '').includes(' showing "'),
);

const package_ = {
  package: 'runtime-visible-language-review-v1',
  version: 1,
  evaluates:
    'whether words the interface is showing make guidance more natural, without becoming product truth',
  derivedFrom: [
    { file: 'runtime-language-evidence.json', sha256: sha(RECORD) },
    { file: 'contextual-receipts.json', sha256: sha(RECEIPTS) },
  ],
  status: 'FROZEN',
  harness: record.harness,
  visionProvider: record.visionProvider,
  gate: 'DEVELOPMENT_RUNTIME_LANGUAGE_REVIEW',
  reviewerType: 'non_human_independent',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  scoredBy: null,
  scoredAt: null,
  /**
   * What the previous round concluded, carried so this one can be read against
   * it. No score is transferred and none is implied for any item here.
   */
  previousRound: {
    package: 'visual-context-review-v1',
    conclusion: [
      'the visual truth boundary is strong',
      'contextual geometry adds modest value',
      'no external model contribution has been demonstrated',
      'useful contextual output is substantially redundant with deterministic evidence',
    ],
    scores: {
      locationHelpfulness: '1.00 / 3',
      truthfulness: '2.00 / 2',
      restraintCost: '1.75 / 2',
      clarity: '2.00 / 2',
      nonRedundancy: '0.63 / 2',
    },
    note: 'GEOMETRY in this package is the sentence those numbers describe. RUNTIME_VISIBLE_LANGUAGE and BASE were not scored by that round and carry no prior result.',
    directionWarning:
      'That round reported nonRedundancy, where higher was better. This round reports redundancy, where higher is worse. The two numbers are inverses and must not be compared without flipping one.',
  },
  forms: {
    BASE: 'the answer with no contextual sentence at all — derived by subtraction, and not produced by any shipped build',
    GEOMETRY: 'what Closed Loop #17 shipped',
    RUNTIME_VISIBLE_LANGUAGE: 'the same statement, quoting the words the interface is showing',
  },
  preferredFormValues: PREFERRED_FORM_VALUES,
  /**
   * One statement, up to three wordings.
   *
   * The receipts show that both captured forms of a scene carry the same
   * receipt id: the engine verifies one statement and the sentence form is
   * chosen afterwards. A reviewer preferring one wording is choosing between
   * phrasings of a single verified fact, not between derivations that checked
   * different things.
   */
  oneStatementSeveralWordings: true,
  /**
   * What the scores select. Exactly one, chosen after scoring — not before, and
   * not by this package.
   */
  nextPhaseOptions: {
    A: 'Keep runtime-visible language as implemented',
    B: 'Prefer geometry-only contextual language',
    C: 'Prefer no contextual sentence; rely on Show me',
    D: 'Refine trusted runtime-visible-language authority',
    E: 'Controlled live VLM experiment',
    F: 'Stop context-language work and move to Statewave memory',
  },
  nextPhase: null,
  reviewQuestions: QUESTIONS,
  questionAnswers: Object.fromEntries(
    Object.keys(QUESTIONS).map((letter) => [
      letter,
      { answer: null, confidence: null, dominantCause: null, comment: null },
    ]),
  ),
  instructions: [
    'Judge this as somebody using the application, not as somebody auditing it.',
    'No external model was called, in this capture or anywhere in this repository.',
    'BASE is derived by removing the contextual paragraph from the captured answer. No build renders it today; preferring it is a recommendation to stop rendering the sentence, which is option C.',
    'A form marked captured:false was not rendered by a browser. BASE never is; GEOMETRY was not captured for RV01b, and that item says why.',
    'Where two forms are identical, identicalPairs says so. RV03 has no placeholder to quote, so its two captured forms are the same words and the same pixels.',
    'Each item carries the same answer in up to three forms from one build: BASE has no contextual sentence, GEOMETRY describes the position, RUNTIME_VISIBLE_LANGUAGE quotes what the control is showing. Score each form that differs, then set preferredForm.',
    'preferredForm accepts BASE, GEOMETRY, RUNTIME_VISIBLE_LANGUAGE or NEITHER. More specific wording is not assumed to be better, and NEITHER is a real answer.',
    'redundancy and restraintCost count the other way: higher is worse. Every dimension states its direction.',
    'A previous round scored one of these forms and found it wanting; previousRound says which and by how much. It is stated once, in one place, because repeating it beside a form is a thumb on the scale — and this round may find the same of all three.',
    'Three items have no contextual sentence in any form (RV02, RV04, RV05), and their forms are marked identical. Judge the silence; restraintCost applies to saying nothing.',
    'Receipts are shown for reference. Do not score whether the verifier was correct — score whether the sentence helped.',
    'Answer questions A-F in questionAnswers, then choose exactly one nextPhase from nextPhaseOptions.',
    'Every score is null and none may be inferred. A passing gate, a correct refusal and a masked secret are engineering facts, not usefulness.',
  ],
  rubric: RUBRIC,
  failureClassifications: CLASSIFICATIONS,
  /**
   * Engineering facts, kept apart from the rubric. These say the boundary held.
   * They do not say anybody was helped.
   */
  objectiveMetrics: {
    scenes: record.scenes.length,
    pageErrors: record.pageErrors.length,
    itemsWithAContextualSentence: withSentence.length,
    itemsQuotingRuntimeVisibleText: withDescriptor.length,
    itemsWithNoContextualSentence: items.filter(
      (item) => item.forms.RUNTIME_VISIBLE_LANGUAGE.contextualSentence === null,
    ).length,
    productModelDelta: 0,
    productClaims: 113,
    staticTitleDelta: 0,
    externalModelCalls: 0,
  },
  /**
   * The primary case, preserved exactly. Question B is asked about this and
   * nothing else.
   */
  clientsSearch: {
    BASE: ['Lets you filter clients.'],
    GEOMETRY: [
      'Lets you filter clients.',
      scene('RV01')?.GEOMETRY_ONLY?.contextualSentence ?? null,
    ],
    RUNTIME_VISIBLE_LANGUAGE: [
      'Lets you filter clients.',
      scene('RV01')?.WITH_VISIBLE_TEXT?.contextualSentence ?? null,
    ],
    behaviourallyVerified: 'Lets you filter clients.',
    whereEachPartComesFrom: {
      filter: 'a behaviourally verified capability claim',
      'Search clients': 'the placeholder attribute, read from this snapshot, expiring with it',
      'above the list': 'bounding boxes the browser measured',
      'the list':
        'a container the runtime observed members in; generic because no product noun was earned for it',
    },
    staticTitle: null,
    staticTitleNote:
      'Unchanged and still absent. ADR 0018 refuses a placeholder as a title, and this loop does not touch that refusal.',
  },
  /** What happens when the words stop being on screen. */
  freshness: {
    item: 'RV01b',
    action: 'a user types "John Smith" into the field',
    before: scene('RV01')?.WITH_VISIBLE_TEXT?.contextualSentence ?? null,
    after: scene('RV01b')?.WITH_VISIBLE_TEXT?.contextualSentence ?? null,
    note: 'The browser keeps the placeholder attribute and stops painting it. The descriptor goes; the location, still true, stays.',
    typedValueInAnswer: false,
  },
  promptInjection: {
    item: 'RV06',
    note: 'The note is VISIBLE_TEXT, which has no descriptor authority. It lost on where it came from, before anything read it.',
    guideSaid: scene('RV06')?.WITH_VISIBLE_TEXT?.contextualSentence ?? null,
    identicalToUnattackedScreen:
      scene('RV06')?.WITH_VISIBLE_TEXT?.contextualSentence ===
      scene('RV01')?.WITH_VISIBLE_TEXT?.contextualSentence,
  },
  /**
   * Privacy, in this round and in the last one.
   *
   * The secret is absent from every sentence, every receipt, every screenshot
   * and this artifact — the capture masks secret shapes before they enter the
   * record and keeps only the fact that one was displayed.
   *
   * The disclosure about Closed Loop #17 is carried here because a reviewer
   * comparing the two rounds would otherwise find the difference and wonder
   * whether it was hidden. Its frozen artifact is not altered.
   */
  /**
   * What was checked before each sentence was said, as a sibling of the items.
   *
   * Available because a reviewer needs to be able to tell a checked sentence
   * from a confident one, and separate because receipt correctness is not
   * usefulness and must not be scored as it. Two scenes share a receipt: the
   * hostile screen produces the same statement as the clean one.
   */
  contextualReceipts: Object.fromEntries(
    receipts.receipts
      .filter((entry) => entry.receiptId !== null)
      .map((entry) => [
        entry.receiptId,
        {
          scenes: receipts.receipts
            .filter((other) => other.receiptId === entry.receiptId)
            .map((other) => other.scene),
          coversBothWordings: entry.coversBothForms,
          realisableStatementsSharingId: entry.realisableStatementsSharingId,
          proved: entry.proved,
          refusals: entry.refusals,
        },
      ]),
  ),
  receiptNote:
    'Shown so a reviewer can see that something checked each sentence. Do not score whether the verifier was correct — score whether the sentence helped.',
  privacy: {
    secretInThisArtifact: false,
    secretInSentences: false,
    secretInReceipts: false,
    secretInScreenshots: false,
    secretInScreenshotsNote:
      'The RV03 scene is a screen displaying an API key, so its screenshot displayed one. The region is painted out with a visible [secret redacted] label; see redactions in the evidence record for the region, the tool and the before/after hashes. Everything the scene is evidence for survives: a screen showing a secret, and a guide that did not repeat it.',
    historicalDisclosure: {
      artifact: 'benchmarks/visual-context-review-v1/visual-evidence.json',
      finding:
        "Closed Loop #17's capture stored document.body.innerText verbatim, so its frozen record contains the fixture API key the settings screen displays. The guide never said it and the provider pack never carried it; the redaction gate scanned the pack, not the record. The value is not repeated here — an artifact that quotes a key while asserting it holds none is asserting something false, and an audit caught the first draft of this block doing exactly that.",
      action:
        "Not corrected. A frozen review is a promise about the bytes somebody scored. The finding is disclosed in that review's freeze record and fixed forward in this one.",
    },
  },
  items,
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  for (const problem of problems) console.error(`  x ${problem}`);
  process.exit(1);
}

if (CHECK) {
  let existing;
  try {
    existing = readFileSync(OUT, 'utf8');
  } catch {
    console.error('The review package has not been built. Run this script without --check.');
    process.exit(1);
  }
  const parsed = JSON.parse(existing);
  const failures = [];
  for (const [index, entry] of package_.derivedFrom.entries()) {
    if (parsed.derivedFrom?.[index]?.sha256 !== entry.sha256)
      failures.push(`the package cites a ${entry.file} that is no longer the committed one`);
  }
  for (const item of package_.items) {
    const found = parsed.items.find((entry) => entry.id === item.id);
    if (found === undefined) {
      failures.push(`${item.id} is missing`);
      continue;
    }
    for (const form of Object.keys(item.forms)) {
      if (found.forms?.[form]?.contextualSentence !== item.forms[form].contextualSentence)
        failures.push(`${item.id}.${form} quotes a sentence the record does not contain`);
      if (found.forms?.[form]?.fullAnswer !== item.forms[form].fullAnswer)
        failures.push(`${item.id}.${form} quotes an answer the arithmetic does not produce`);
      if (found.forms?.[form]?.screenshotSha256 !== item.forms[form].screenshotSha256)
        failures.push(`${item.id}.${form} cites a screenshot that is not the captured one`);
    }
    if (found.receiptRef !== item.receiptRef)
      failures.push(`${item.id} cites a receipt the verifier does not produce`);
  }
  if (parsed.reviewerType !== 'non_human_independent')
    failures.push(`reviewerType is ${parsed.reviewerType}`);
  if (parsed.objectiveMetrics?.staticTitleDelta !== 0) failures.push('a static title changed');
  if (failures.length > 0) {
    console.error('\nThe review instrument and the evidence disagree.\n');
    for (const failure of failures) console.error(`  x ${failure}`);
    console.error('');
    process.exit(1);
  }
  const scored = parsed.items.filter((item) =>
    Object.values(item.scores).some((forms) => Object.values(forms).some((v) => v !== null)),
  );
  console.log(
    `\nRuntime language review package — ${parsed.items.length} items, evidence matches, ${scored.length} scored.\n`,
  );
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(`\nWrote ${path.relative(ROOT, OUT)} — ${items.length} items, every score null.\n`);
