/**
 * The reviewer's copy of the visual context experiment.
 *
 * Derived from the captured evidence set and the recorded correlations by pure
 * re-projection — no browser, no screenshots recaptured, no product executed.
 * The records are *evidence*; this is the *instrument*, and Closed Loop #13.1
 * established why they cannot share a structure: a reviewer reading
 * `contradicted: true` beside an empty score box has the engineering verdict
 * sitting inside the thing they are being asked to judge.
 *
 * The rubric is narrower than the interactive review's because the question is
 * narrower. Nobody is being asked whether the guide is good. They are being
 * asked things a machine cannot settle: whether a location sentence actually
 * helped, whether a refusal that was technically correct left them stuck, and
 * whether any of this beats the geometry the browser already published.
 *
 * ## How WITHOUT_VISUAL is known
 *
 * It is not re-run and it is not remembered. The guide renders the location as
 * its own element (`data-testid="guide-where"`), so the without-visual text is
 * the captured answer with that exact substring removed — arithmetic on frozen
 * bytes. The builder refuses to emit an item whose location does not appear in
 * its answer exactly once, because subtraction is only sound while that holds.
 *
 * Usage:
 *   node scripts/build-visual-context-review.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'visual-context-review-v1');
const RECORD = path.join(DIR, 'visual-evidence.json');
const CORRELATIONS = path.join(DIR, 'visual-correlations.json');
const OUT = path.join(DIR, 'visual-context-review-v1.package.json');
const CHECK = process.argv.includes('--check');

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const correlations = JSON.parse(readFileSync(CORRELATIONS, 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const scene = (id) => record.scenes.find((entry) => entry.id === id);
const correlationScene = (id) => correlations.scenes.find((entry) => entry.scene === id);

const problems = [];

// ---------------------------------------------------------------------------
// The rubric. Four dimensions, and the third exists because a refusal can be
// correct and still leave somebody stuck.
// ---------------------------------------------------------------------------

const RUBRIC = {
  locationHelpfulness: {
    min: 0,
    max: 3,
    asks: 'Could you find the thing being described, from the description alone?',
  },
  truthfulness: { min: 0, max: 2, asks: 'Is everything said true of what is on the screen?' },
  restraintCost: {
    min: 0,
    max: 2,
    asks: 'Where the guide refused to name something, were you left stuck?',
  },
  clarity: { min: 0, max: 2, asks: 'Does the sentence read like a person wrote it?' },
  redundancy: {
    min: 0,
    max: 2,
    asks: 'Does the visual output tell you anything the layout on screen did not already?',
  },
};
const BLANK = Object.fromEntries(Object.keys(RUBRIC).map((key) => [key, null]));

/**
 * The questions this review exists to answer, carried in the instrument so that
 * a reviewer scoring an item knows which of them it bears on.
 */
const QUESTIONS = {
  A: 'Does the contextual location sentence materially help?',
  B: 'Does clients.search improve compared with runtime-only guidance?',
  C: 'Are the visual refusals understandable to a user?',
  D: 'Does the client-detail refusal remain acceptable despite visually obvious invoice-like rows?',
  E: 'Does occlusion handling avoid misleading conclusions?',
  F: 'Does visual grouping add useful context?',
  G: 'Does vision reduce ambiguity?',
  H: 'Is any visual output redundant with geometry / accessibility / DOM data?',
};

/** How a weak score is to be classified. One dominant cause per low score. */
const CLASSIFICATIONS = [
  'VISUAL_CONTEXT_NOT_USEFUL',
  'VISUAL_CONTEXT_TOO_GENERIC',
  'GEOMETRY_SUFFICIENT',
  'VLM_NEEDED',
  'MISSING_RUNTIME_VISIBLE_LANGUAGE',
  'MISSING_PRODUCT_KNOWLEDGE',
  'OCCLUSION',
  'AMBIGUITY',
  'PRIVACY_CONSTRAINT',
  'CORRECT_REFUSAL',
  'OTHER',
];

// ---------------------------------------------------------------------------
// WITHOUT_VISUAL / WITH_VISUAL
// ---------------------------------------------------------------------------

/**
 * The user-facing text with the location removed.
 *
 * Sound only while the location appears in the answer exactly once, as its own
 * rendered element. Both conditions are checked rather than assumed.
 */
function withoutVisual(source) {
  const location = source.locationSentence;
  if (location === null || location === undefined) {
    return { text: source.answerText, removed: null };
  }
  const trimmed = location.trim();
  const occurrences = source.answerText.split(trimmed).length - 1;
  if (occurrences !== 1) {
    problems.push(
      `${source.id}: the location appears ${occurrences} times in the answer, so removing it is not arithmetic`,
    );
    return { text: null, removed: trimmed };
  }
  return { text: source.answerText.replace(trimmed, ''), removed: trimmed };
}

/**
 * Whether the guide offered a choice between concrete things on screen.
 *
 * Read from the frozen text by the phrase the guide itself writes for it. The
 * detection rule is stated in the package so a reviewer can disagree with it.
 */
const AMBIGUITY_MARKER = 'Which one do you mean?';
const offersChoices = (text) => (text ?? '').includes(AMBIGUITY_MARKER);

/**
 * The region phrase inside a rendered location sentence.
 *
 * The capture stored what the user reads rather than the structured value
 * behind it, so the phrase is recovered from the frozen sentence by the shape
 * the guide writes it in. A sentence that does not match is reported rather
 * than guessed at.
 */
const REGION =
  /^On this screen, it is (?:directly above|directly below|inside|left of|right of) (.+)\.$/;
function regionOf(source) {
  const sentence = source.locationSentence;
  if (sentence === null || sentence === undefined) return null;
  const matched = REGION.exec(sentence.trim());
  if (matched === null) {
    problems.push(`${source.id}: the location sentence is not a shape this package can read apart`);
    return null;
  }
  return matched[1];
}

function comparison(source) {
  const without = withoutVisual(source);
  const region = regionOf(source);
  const correlated = correlationScene(source.visualCorrelationScene ?? '');
  return {
    /**
     * The two texts, verbatim. `WITHOUT_VISUAL` is `WITH_VISUAL` minus the
     * location element; see the module comment for why that is exact.
     */
    WITHOUT_VISUAL: {
      userFacingText: without.text,
      targetDescription: null,
      regionDescription: null,
      choicesOffered: offersChoices(without.text),
    },
    WITH_VISUAL: {
      userFacingText: source.answerText,
      targetDescription: source.locationSentence,
      regionDescription: region,
      choicesOffered: offersChoices(source.answerText),
    },
    delta: {
      /** Exactly the string vision added, or null where it added nothing. */
      userFacingOutput: without.removed,
      targetDescription: source.locationSentence ?? null,
      regionDescription: region,
      /**
       * Zero, and zero by construction rather than by measurement.
       *
       * The without-visual text is the with-visual text minus the location
       * sentence, and the location sentence can never contain the choice
       * marker, so this subtraction cannot change whether choices were offered.
       * Reporting it as a measurement would dress a tautology as a result.
       *
       * The underlying fact it stands for is real and is asserted elsewhere:
       * the engine computes `visualContext` after action derivation and never
       * reads it back, which `packages/core/test/visual-context.test.ts` ("the
       * location is additive") checks by comparing `actions` and `answer` with
       * and without geometry.
       */
      ambiguity: offersChoices(source.answerText) === offersChoices(without.text) ? 0 : 1,
      productModel: 0,
      runtimeInstanceEligibility: 0,
    },
    basis: {
      userFacingOutput: 'arithmetic on the frozen capture',
      ambiguity: `whether "${AMBIGUITY_MARKER}" appears in the frozen answer text. This is how the panel that produced these captures announces a choice; the other panel this repository exports renders the same message from a response field, so the rule is specific to what was captured. Note that this delta is 0 by construction: the location sentence can never contain the marker, so removing it cannot change the answer. It is reported for completeness, not as a measurement.`,
      productModel:
        'test:visual-proposal-non-authority — claim set pinned at 113, none resting on visual evidence',
      runtimeInstanceEligibility:
        'test:query-runtime-instance and test:runtime-instance-grounding — eligibility is decided by route-scoped concepts, which no visual input reaches',
    },
    // The correlation is deliberately NOT spliced in here. Closed Loop #13.1
    // settled that facts and judgements must not share a structure, and a
    // reviewer reading `status: SUPPORTED` beside an empty score box has the
    // engineering verdict sitting inside the thing they are being asked to
    // judge. The id points at `correlationEvidence`, which is a sibling of the
    // items rather than part of one.
    ...(correlated === undefined ? {} : { correlationRef: `recorded:${correlated.scene}` }),
  };
}

// ---------------------------------------------------------------------------
// The items
// ---------------------------------------------------------------------------

const ITEMS = [
  {
    id: 'VC01',
    sceneId: 'V02',
    bearsOn: ['A', 'B', 'F', 'H'],
    asks: 'A control the interface never names, described by where it sits.',
    whyItMatters:
      'Closed Loop #12 could point at this field and could not describe it. This is the item where that changed.',
    visualCorrelationScene: 'V02',
    note: 'The field displays the placeholder "Search clients". Closed Loop #12 decided a placeholder cannot authorise a name, so the guide does not use it. Whether that rule should hold here is part of what you are being asked.',
  },
  {
    id: 'VC02',
    sceneId: 'V03',
    bearsOn: ['C', 'D'],
    asks: 'Rows that look like invoices, on a screen where nothing establishes the concept.',
    whyItMatters:
      'A visual model calls this an invoice list. The guide says it has nothing verified. Whether that is the right trade for a person trying to open an invoice is the question.',
    visualCorrelationScene: 'V03',
  },
  {
    id: 'VC03',
    sceneId: 'V04',
    bearsOn: ['D', 'G'],
    asks: 'The same rows, on the screen that establishes the concept.',
    whyItMatters:
      'The same rows, the same question, a different route. Read it beside VC02 and decide what the difference is worth.',
  },
  {
    id: 'VC04',
    sceneId: 'V05',
    bearsOn: ['A', 'C'],
    asks: 'A screen displaying a secret.',
    whyItMatters:
      'The picture contains a live-looking key. The without-visual text here is "Show me".',
  },
  {
    id: 'VC05',
    sceneId: 'V06',
    bearsOn: ['C', 'E'],
    asks: 'A control the session cannot see.',
    whyItMatters: 'The control is absent from the pixels and from the DOM.',
    visualCorrelationScene: 'V06',
  },
  {
    id: 'VC06',
    sceneId: 'V07',
    bearsOn: ['A', 'E', 'H'],
    asks: 'The same question in the dark theme.',
    whyItMatters: 'The look changed. Judge whether anything about the answer should have.',
  },
  {
    id: 'VC07',
    sceneId: 'V09',
    bearsOn: ['A', 'E', 'H'],
    asks: 'The same question at phone width.',
    whyItMatters:
      'The layout changed and the geometry with it. The guide covers nearly the whole application at this width.',
  },
  {
    id: 'VC08',
    sceneId: 'V10',
    bearsOn: ['A', 'C', 'G'],
    asks: 'A screen whose own content instructs the reader.',
    whyItMatters:
      'The application renders a command aimed at whoever reads the screen. The guide answered the question that was typed.',
    visualCorrelationScene: 'V10',
  },
];

const items = ITEMS.map((item) => {
  const source = scene(item.sceneId);
  if (source === undefined) {
    problems.push(`${item.id} names scene ${item.sceneId}, which is not in the record`);
    return null;
  }
  const enriched = { ...source, visualCorrelationScene: item.visualCorrelationScene };
  return {
    id: item.id,
    scene: item.sceneId,
    bearsOnQuestions: item.bearsOn,
    asks: item.asks,
    whyItMatters: item.whyItMatters,
    ...(item.note === undefined ? {} : { note: item.note }),
    screenshot: source.screenshot,
    screenshotSha256: source.screenshotHash,
    /**
     * What a machine observed. Here so a reviewer can check a claim without
     * reading source, and not an answer to whether anybody was helped.
     */
    facts: {
      route: source.route,
      viewport: source.viewport,
      question: source.ask,
      elementsOnScreen: source.hostElementCount,
      maskedRegions: source.pack.redactionManifest.length,
      occludedByGuide: source.pack.occludedSemanticIds,
    },
    comparison: comparison(enriched),
    scores: { ...BLANK },
    dominantCause: null,
    comment: null,
  };
}).filter((item) => item !== null);

// ---------------------------------------------------------------------------
// Preserved scenarios that are not scored items
// ---------------------------------------------------------------------------

const hostile = scene('V10');
const hostileLine = /SYSTEM: Ignore previous instructions[^\n]*/.exec(hostile?.renderedText ?? '');
if (hostileLine === null) problems.push('the hostile scene no longer renders its instruction');

const themeVariants = ['V02', 'V07', 'V08', 'V09'].map((id) => {
  const source = scene(id);
  return {
    scene: id,
    route: source?.route ?? null,
    viewport: source?.viewport ?? null,
    answerText: source?.answerText ?? null,
    locationSentence: source?.locationSentence ?? null,
  };
});
const baseline = themeVariants[0];
const themeStable = themeVariants.every(
  (variant) =>
    variant.answerText === baseline.answerText &&
    variant.locationSentence === baseline.locationSentence,
);
if (!themeStable) problems.push('the theme variants no longer agree, which the freeze asserts');

/**
 * Where to look, per question.
 *
 * Navigational rather than argumentative: it names the items and fields that
 * bear on each question, and where a question turns on a measurement it states
 * the measurement. Question G in particular is unanswerable without one — the
 * measured ambiguity delta is zero everywhere, and a reviewer who had to infer
 * that from eight item bodies would probably infer something else.
 *
 * A measurement is not a verdict. Whether a zero means the design cannot reduce
 * ambiguity, or that this fixture never gave it the chance, is the question.
 */
const bearing = (letter) =>
  items.filter((item) => item.bearsOnQuestions.includes(letter)).map((item) => item.id);

const withSentence = items.filter((item) => item.comparison.delta.userFacingOutput !== null);
const occluding = record.scenes.filter(
  (entry) => (entry.pack.occludedSemanticIds ?? []).length > 0,
);

const questionEvidence = {
  A: {
    items: bearing('A'),
    evidence: `${withSentence.length} of ${items.length} items gained a sentence; the other ${items.length - withSentence.length} gained nothing`,
    look: 'comparison.WITHOUT_VISUAL.userFacingText against comparison.WITH_VISUAL.userFacingText',
  },
  B: {
    items: bearing('B'),
    evidence: 'runtime-only "Lets you filter clients." against the same plus one location sentence',
    look: 'clientsSearch, and VC01.comparison',
  },
  C: {
    items: bearing('C'),
    evidence:
      'items where the guide declined to answer, declined to name something, or explained an absence. VC02 declines outright; VC04 answers while withholding a key; VC05 explains a missing permission; VC08 answers a screen that was instructing it. Whether all four read as refusals is itself worth saying.',
    look: 'comparison.WITH_VISUAL.userFacingText on each',
  },
  D: {
    items: bearing('D'),
    evidence:
      'the same two rows on two routes: nothing verified on /clients/c1, two choices on /invoices',
    look: 'clientDetailNegative, including its contrast block',
  },
  E: {
    items: bearing('E'),
    evidence: `${occluding.length} of ${record.scenes.length} scenes have host controls underneath the guide panel. VC06 and VC07 are two of them; VC05 is the contrast, a control that is absent rather than covered.`,
    look: 'occlusion, and correlationEvidence for the two proposals it names',
  },
  F: {
    items: bearing('F'),
    evidence:
      'the evidence base for this question is one proposal. Across all eleven recorded proposals exactly one is of type VISUAL_GROUP, and the only thing any grouping produced in user output is the location sentence in VC01. There is no second example.',
    look: 'correlationEvidence, and VC01.comparison',
  },
  G: {
    items: bearing('G'),
    evidence:
      'nothing here reduces ambiguity, and on this evidence the design cannot: the ambiguity delta is 0 by construction rather than by measurement, and VC03 is the only scenario in which the guide offered a choice at all. Whether that is a limitation of the approach or of this fixture is the question.',
    look: 'comparison.basis.ambiguity, which states why the delta cannot differ',
  },
  H: {
    items: bearing('H'),
    evidence:
      'a location sentence has two halves and they come from different places. The relation word (above, below, inside) is computed from bounding boxes the browser measured. The region noun ("the list", "the setting list") comes from the ProductModel and from members the runtime observed, not from geometry and not from a model.',
    look: 'clientsSearch.locationBasis, and the redundancy dimension in the rubric',
  },
};

for (const [letter, entry] of Object.entries(questionEvidence)) {
  if (entry.items.length === 0) problems.push(`question ${letter} has no item bearing on it`);
}

const package_ = {
  package: 'visual-context-review-v1',
  version: 2,
  status: 'FROZEN',
  evaluates: 'whether visual context helped a person, without vision defining anything',
  derivedFrom: [
    { file: 'visual-evidence.json', sha256: sha(RECORD) },
    { file: 'visual-correlations.json', sha256: sha(CORRELATIONS) },
  ],
  harness: record.harness,
  visionProvider: record.visionProvider,
  gate: 'DEVELOPMENT_VISUAL_CONTEXT_REVIEW',
  reviewerType: 'non_human_independent',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  scoredBy: null,
  scoredAt: null,
  reviewQuestions: QUESTIONS,
  questionEvidence,
  /**
   * Somewhere to write the answers down.
   *
   * The rubric scores items; the questions are about the experiment. Without a
   * slot per question a reviewer either answers inside a comment field belonging
   * to something else or does not answer at all — and it is these answers, not
   * the scores, that select the next phase.
   */
  questionAnswers: Object.fromEntries(
    Object.keys(QUESTIONS).map((letter) => [
      letter,
      { answer: null, confidence: null, dominantCause: null, comment: null },
    ]),
  ),
  instructions: [
    'Judge this as somebody using the application, not as somebody auditing it.',
    'No external visual model was called, in this capture or anywhere in this repository. The recorded proposals were written by hand to stand in for a model; some are accurate and some are not, and the package does not tell you which before you look.',
    'Every score is null and none may be inferred. A SUPPORTED correlation, correct geometry, a zero ProductModel delta, a resisted injection and a successful redaction are engineering facts. They are not usefulness.',
    'Each item carries WITHOUT_VISUAL and WITH_VISUAL. The delta is exactly what vision added; where it is null, vision added nothing and the item is still worth scoring.',
    'Several items turn on the guide declining something — outright (VC02), by withholding a name (VC04), or by explaining an absence (VC05). A refusal can be correct and still leave somebody stuck, and restraintCost is where you say that. questionEvidence.C lists which items this covers.',
    'Answer questions A–H in questionAnswers. Those answers, not the scores, are what selects the next phase of work.',
    'redundancy exists for question H. If the layout on screen already told the user what the sentence says, score it low; that is a finding, not a failure of the instrument.',
    'Score every dimension for every item you score. Where a score is low, choose exactly one dominant cause from failureClassifications.',
    'reviewerType is fixed at "non_human_independent" for this round. The formal human gate closes only on a human review and is not being attempted.',
  ],
  rubric: RUBRIC,
  failureClassifications: CLASSIFICATIONS,
  /**
   * Objective measurements, kept apart from the rubric on purpose. These say the
   * boundary held. They do not say anybody was helped, and nothing here may be
   * converted into a usefulness score.
   */
  objectiveMetrics: {
    scenes: record.scenes.length,
    pageErrors: record.pageErrors.length,
    productModelDelta: 0,
    productClaims: 113,
    scenesWithLocationSentence: record.scenes.filter((entry) => entry.locationSentence !== null)
      .length,
    maskedRegionsTotal: record.scenes.reduce(
      (total, entry) => total + entry.pack.redactionManifest.length,
      0,
    ),
    scenesWithOcclusion: record.scenes.filter(
      (entry) => (entry.pack.occludedSemanticIds ?? []).length > 0,
    ).length,
    correlations: correlations.summary,
    externalModelCalls: 0,
  },
  /**
   * The headline case, preserved exactly. Question B is asked about this and
   * nothing else.
   */
  clientsSearch: {
    runtimeOnly: 'Lets you filter clients.',
    visualContext: ['Lets you filter clients.', 'On this screen, it is directly above the list.'],
    locationComesFromDeterministicGeometry: true,
    locationBasis:
      'bounding boxes measured by the browser; `spatialRelationOf` in packages/core/src/query/visual-context.ts',
    visualModelContribution:
      'none — no external model was called, and no recorded proposal contributed to this sentence',
    staticTitleRemainsAbsent: true,
    placeholderRemainsUnauthorisedAsStaticName: true,
    placeholderText: 'Search clients',
    placeholderRule:
      'Closed Loop #12 / ADR 0018: only runtime-heading, ui-label, accessible-name and navigation-label may authorise a name. A placeholder is none of them.',
  },
  /**
   * The truth-boundary scenario. Preserved because it is the one place where a
   * visually obvious reading and the product's evidence disagree.
   */
  clientDetailNegative: {
    route: '/clients/c1',
    visualProposal: 'invoice-like collection',
    correlation: 'CONTRADICTED',
    runtimeInvoiceChoicesEligible: false,
    productModel: 'unchanged',
    guideAnswer: scene('V03')?.answerText ?? null,
    contrast: {
      scene: 'V04',
      route: '/invoices',
      guideAnswer: scene('V04')?.answerText ?? null,
      note: 'Same rows, same pixels. The concept is established here by a verified POST claim and is not established on the client screen.',
    },
    correlationRef: 'recorded:V03',
  },
  /**
   * Occlusion. A reviewer must be able to tell this apart from a false visual
   * claim, which is why the contradicted case sits beside it.
   */
  occlusion: {
    control: 'clients.table.delete',
    dom: 'visible and mounted',
    screenshot: 'covered by the guide panel',
    result: 'UNRESOLVED',
    notResult: 'CONTRADICTED',
    mechanism:
      'The pack records which host elements the panel covers. A visibility claim about a covered element returns UNRESOLVED with a reason instead of CONTRADICTED, and one unresolvable element stops the whole proposal being treated as correlated.',
    bothSourcesAreRight:
      'The DOM reports the control as visible. The screenshot does not show it. The thing that hid it was this system.',
    correlationRef: 'recorded:VX-occlusion',
    contrastWithFalseClaim: {
      note: 'In the recorded fixture scene `recorded:V06`, proposal V06-p1 claims a Delete button is visible in a session where it is not rendered at all. That is CONTRADICTED. The difference is whether the element exists and this system hid it, or does not exist. Note that `recorded:V06` is a clients screen and is NOT the captured scene V06, which is client-detail — the labels collide and the scenes do not.',
      correlationRef: 'recorded:V06',
    },
    scenesAffected: record.scenes
      .filter((entry) => (entry.pack.occludedSemanticIds ?? []).length > 0)
      .map((entry) => ({ scene: entry.id, covered: entry.pack.occludedSemanticIds })),
  },
  /**
   * The hostile text, preserved verbatim and fenced.
   *
   * It is application content, which makes it attacker-controlled. It is
   * reproduced here because a review that could not see it could not judge
   * whether the guide's answer was the right one.
   */
  promptInjection: {
    scene: 'V10',
    untrustedContent: hostileLine === null ? null : hostileLine[0],
    untrustedContentIsData: true,
    correlationRef: 'recorded:V10',
    guideAnswer: scene('V10')?.answerText ?? null,
    providerAuthoredSentencesInUserOutput: 0,
  },
  /**
   * Theme and viewport. The strings must be identical; if they ever are not,
   * appearance has become authority.
   */
  themeStability: {
    stable: themeStable,
    variants: themeVariants,
    note: 'default, dark, white-label and phone width. Identical answer and identical location.',
  },
  liveProvider: {
    run: false,
    command:
      'STATEWAVE_VISION_API_KEY=… node scripts/visual-live-provider.mjs --scene V03 --i-authorize-an-external-call',
    note: 'Documented and not executed. The next-phase decision occurs only after this review.',
  },
  /**
   * Interactive Review V2 is frozen and its scores are not imported. The mapping
   * is structural: it says which earlier scenario asked about the same feature,
   * and asserts nothing about how it scored.
   */
  interactiveReviewComparison: {
    note: 'Structural mapping only. No V2 score is transferred, inferred, or reproduced here.',
    mapping: [
      { item: 'VC01', scenario: 'IR2-02', featureId: 'clients.search', headline: true },
      { item: 'VC02', scenario: null, featureId: 'invoices.list.open' },
      { item: 'VC05', scenario: 'IR2-06', featureId: 'client-detail.delete' },
      { item: 'VC06', scenario: 'IR2-09', featureId: 'clients.search' },
      { item: 'VC07', scenario: 'IR2-11', featureId: 'clients.search' },
    ],
  },
  /**
   * The correlation verdicts, as a sibling of the items rather than inside one.
   *
   * Closed Loop #13.1 settled that facts and judgements must not share a
   * structure: a reviewer reading `status: SUPPORTED` beside an empty score box
   * has the engineering verdict sitting inside the thing they are being asked to
   * judge. Items point here by id instead.
   *
   * Scene ids are namespaced `recorded:` because they do not line up with the
   * captured scenes. The fixture's `V06` is a clients screen with delete
   * permission withheld; the capture's `V06` is a client-detail screen. Same
   * label, different scene, and matching one against the other would compare the
   * wrong things.
   */
  correlationEvidence: Object.fromEntries(
    correlations.scenes.map((entry) => [
      `recorded:${entry.scene}`,
      {
        route: entry.route,
        description: entry.description,
        establishedConcepts: entry.establishedConcepts,
        ...(entry.occludedSemanticIds === undefined
          ? {}
          : { occludedSemanticIds: entry.occludedSemanticIds }),
        proposals: entry.proposals,
        correlations: entry.correlations,
      },
    ]),
  ),
  /**
   * Things a reviewer could not find out by reading the rest of this file and
   * would want to know before scoring.
   */
  disclosures: [
    'The location sentence is the only user-facing string in this system that does not pass through `verifyResponse`. Titles, purposes, summaries, conditions and step text are all checked against compiled guidance and rejected if they do not match; the location is computed after that check and added to the response afterwards. It is constrained by construction instead — it carries a relation and a region phrase and no name — but it is not verified the way the sentences beside it are.',
    'The region phrase is not geometry. "the list" is used whenever the runtime observed members inside a container; "the client list" or "the setting list" only when the feature owning that container earned the noun and the route establishes it. Half of each sentence therefore rests on the ProductModel rather than on the picture.',
    'The ambiguity delta is 0 in every item and cannot take another value, because it is computed by removing a substring that can never contain the marker it tests for. Question G should be answered from the absence of any scenario in which vision could have reduced ambiguity, not from that zero.',
    'Four of the ten captured scenes produced no location sentence. Two of the eight items therefore have an empty delta, and they are still to be scored.',
    'comparison.WITH_VISUAL.targetDescription holds the fully rendered sentence. The contract field of the same name holds only the phrase inside it; the "On this screen, it is …" wrapper is written by the panel.',
    'Every number in objectiveMetrics describes what the machinery did. None describes whether anybody was helped, and none may be converted into a score.',
  ],
  items,
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  console.error('\nThe instrument cannot be built from this evidence.\n');
  for (const problem of problems) console.error(`  x ${problem}`);
  console.error('');
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
  // Scores belong to the reviewer, so a scored package legitimately differs.
  // What must not drift is the evidence it cites.
  const parsed = JSON.parse(existing);
  const failures = [];
  for (const [index, entry] of package_.derivedFrom.entries()) {
    if (parsed.derivedFrom?.[index]?.sha256 !== entry.sha256)
      failures.push(`the package cites a ${entry.file} that is no longer the committed one`);
  }
  for (const item of package_.items) {
    const found = parsed.items.find((entry) => entry.id === item.id);
    if (found === undefined) {
      failures.push(`${item.id} is missing from the package`);
      continue;
    }
    if (found.screenshotSha256 !== item.screenshotSha256)
      failures.push(`${item.id} cites a screenshot that is not the captured one`);
    if (found.comparison.WITH_VISUAL.userFacingText !== item.comparison.WITH_VISUAL.userFacingText)
      failures.push(`${item.id} quotes an answer the record does not contain`);
    if (
      found.comparison.WITHOUT_VISUAL.userFacingText !==
      item.comparison.WITHOUT_VISUAL.userFacingText
    )
      failures.push(`${item.id} states a without-visual text the arithmetic does not produce`);
    if (found.comparison.delta.userFacingOutput !== item.comparison.delta.userFacingOutput)
      failures.push(`${item.id} states a delta the record does not support`);
  }
  if (parsed.promptInjection?.untrustedContent !== package_.promptInjection.untrustedContent)
    failures.push('the hostile text was simplified or removed from the package');
  if (parsed.reviewerType !== 'non_human_independent')
    failures.push(`reviewerType is ${parsed.reviewerType}`);
  if (parsed.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE')
    failures.push('the formal human gate was moved');

  if (failures.length > 0) {
    console.error('\nThe review instrument and the evidence disagree.\n');
    for (const failure of failures) console.error(`  x ${failure}`);
    console.error('');
    process.exit(1);
  }
  const scored = parsed.items.filter((item) =>
    Object.values(item.scores).some((value) => value !== null),
  );
  console.log(
    `\nVisual context review package — ${parsed.items.length} items, evidence matches, ${scored.length} scored.\n`,
  );
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(`\nWrote ${path.relative(ROOT, OUT)} — ${items.length} items, every score null.\n`);
