/**
 * Runtime Visible Language Review V1, pinned where it stood.
 *
 * The promise a frozen review makes is that the thing somebody scored is the
 * thing that was built. For this round that means three things at once: the
 * sentences a reviewer reads, the receipts proving what was checked before those
 * sentences were said, and the authority rules that decided which words were
 * eligible at all.
 *
 * The static side travels with it. This review is only meaningful while
 * `clients.search` still has no title — the whole question is whether a
 * placeholder may describe a control it is not allowed to name, and a round that
 * quietly granted the name would be answering something else.
 *
 * Usage:
 *   pnpm test:runtime-language-freeze
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'runtime-visible-language-review-v1');
const failures = [];
const notes = [];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fileSha = (relative) => sha(readFileSync(path.join(ROOT, relative)));

// ---------------------------------------------------------------------------
// The evidence
// ---------------------------------------------------------------------------

const FROZEN = {
  'benchmarks/runtime-visible-language-review-v1/runtime-language-evidence.json':
    '1697a8309e9d63fae3e07200edbb1ab3a15ac900773b24c4d224679d93fe3fd5',
  'benchmarks/runtime-visible-language-review-v1/contextual-receipts.json':
    '5168947d2903ffe028d6b4345bde8b7c4720e32e13e85ba54537fb5dec1b5740',
  /**
   * The authority rules themselves.
   *
   * Pinned as source, because the taxonomy and the descriptor table are what
   * decide which words a sentence may borrow. Changing them mid-review would
   * change what the reviewer is scoring without touching a single artifact.
   */
  'packages/core/src/query/runtime-language.ts':
    '0d55f96f3d84cafa06d32020f89929a8ff976b2034d844232cab7e76dc7246ac',
  /**
   * Repinned by Closed Loop #19.1, deliberately.
   *
   * `verifyContextualStatement` gained one optional input: containment refusals
   * the describer had already decided, appended to the receipt so that a missing
   * sentence is explainable. It is additive — no existing clause, refusal or
   * verdict changed, and `statementIdOf` does not hash refusals, so every receipt
   * id in the frozen artifact still reconciles. The gate below re-derives all
   * four of them from the shipped verifier and they still match, which is what
   * makes moving this hash a record rather than a shrug.
   */
  'packages/core/src/query/contextual.ts':
    'e1e1bc1b2cd29230a0a7b825b4fbaeee58f5bacb4a76cbfc3c01b6e7fd53448f',
};

for (const [file, expected] of Object.entries(FROZEN)) {
  let actual;
  try {
    actual = fileSha(file);
  } catch {
    failures.push(`${file} is missing from the frozen set`);
    continue;
  }
  if (actual !== expected) failures.push(`${file} changed (${actual.slice(0, 16)}…)`);
}
notes.push(`${Object.keys(FROZEN).length} evidence and authority files pinned`);

/**
 * The screenshots, as one digest over names and bytes.
 *
 * Thirteen, not fourteen: RV01b has only a language capture, because the scene
 * *is* the transition and a second render of it would be the same picture.
 *
 * RV03's two files are byte-identical, and that is correct rather than a
 * mistake — the rotate-key button carries no placeholder, so both forms render
 * the same sentence and therefore the same pixels. Earlier reviews treated
 * identical screenshots as a defect; here it is the evidence that a scene with
 * nothing to quote gains nothing from being allowed to quote.
 */
const SCREENSHOTS = 'd71459ca3c507c125672b54768346e17c7b0c9c592e7c44ddfa623266168aa79';
const shots = readdirSync(path.join(DIR, 'screenshots')).sort();
const shotDigest = createHash('sha256');
for (const name of shots) {
  shotDigest.update(name);
  shotDigest.update(readFileSync(path.join(DIR, 'screenshots', name)));
}
if (shots.length !== 13) failures.push(`${shots.length} screenshots, expected 13`);
if (shotDigest.digest('hex') !== SCREENSHOTS) failures.push('the screenshot set changed');
notes.push(`${shots.length} screenshots pinned as one set`);

// ---------------------------------------------------------------------------
// The sentences
// ---------------------------------------------------------------------------

const record = JSON.parse(readFileSync(path.join(DIR, 'runtime-language-evidence.json'), 'utf8'));
const receipts = JSON.parse(readFileSync(path.join(DIR, 'contextual-receipts.json'), 'utf8'));
const scene = (id) => record.scenes.find((entry) => entry.id === id);

/**
 * The pixels, checked as well as the text.
 *
 * An audit of the first draft found the RV03 screenshots displaying the fixture
 * key in plain pixels while the artifact asserted no secret was present. The
 * region is now painted out, and the record says so — file, region, tool, and
 * the hash on either side.
 */
if (record.redactions === undefined)
  failures.push('the evidence record does not say whether anything was painted out');
else {
  for (const entry of record.redactions.applied ?? []) {
    const bytes = readFileSync(path.join(DIR, entry.file));
    if (`sha256:${sha(bytes)}` !== entry.now)
      failures.push(`${entry.file} is not the redacted image the record cites`);
  }
  notes.push(
    `${(record.redactions.applied ?? []).length} screenshot regions painted out, each with its before and after hash`,
  );
}

/** The whole user-visible result of the loop, as text. */
const SENTENCES = {
  RV01: {
    RUNTIME_VISIBLE_LANGUAGE: 'Use the field showing "Search clients" above the list.',
    GEOMETRY: 'On this screen, it is directly above the list.',
  },
  RV01b: {
    RUNTIME_VISIBLE_LANGUAGE: 'On this screen, it is directly above the list.',
    GEOMETRY: 'On this screen, it is directly above the list.',
  },
  RV02: { RUNTIME_VISIBLE_LANGUAGE: null, GEOMETRY: null },
  RV03: {
    RUNTIME_VISIBLE_LANGUAGE: 'On this screen, it is directly below the setting list.',
    GEOMETRY: 'On this screen, it is directly below the setting list.',
  },
  RV04: { RUNTIME_VISIBLE_LANGUAGE: null, GEOMETRY: null },
  RV05: { RUNTIME_VISIBLE_LANGUAGE: null, GEOMETRY: null },
  RV06: {
    RUNTIME_VISIBLE_LANGUAGE: 'Use the field showing "Search clients" above the list.',
    GEOMETRY: 'On this screen, it is directly above the list.',
  },
};

for (const [id, expected] of Object.entries(SENTENCES)) {
  const source = scene(id);
  if (source === undefined) {
    failures.push(`${id} is missing from the capture`);
    continue;
  }
  if (source.WITH_VISIBLE_TEXT?.contextualSentence !== expected.RUNTIME_VISIBLE_LANGUAGE)
    failures.push(
      `${id} language form says ${JSON.stringify(source.WITH_VISIBLE_TEXT?.contextualSentence)}`,
    );
  if (
    source.GEOMETRY_ONLY !== null &&
    source.GEOMETRY_ONLY !== undefined &&
    source.GEOMETRY_ONLY.contextualSentence !== expected.GEOMETRY
  )
    failures.push(
      `${id} geometry form says ${JSON.stringify(source.GEOMETRY_ONLY.contextualSentence)}`,
    );
}

// The transition that makes freshness real, pinned in both directions.
if (scene('RV01')?.WITH_VISIBLE_TEXT?.contextualSentence?.includes('Search clients') !== true)
  failures.push('RV01 stopped quoting the placeholder');
if (scene('RV01b')?.WITH_VISIBLE_TEXT?.contextualSentence?.includes('Search clients') === true)
  failures.push('RV01b quotes a placeholder the user can no longer see');
notes.push('the placeholder is quoted before typing and gone after it');

// The hostile note changed nothing, down to the identity of the statement.
if (
  scene('RV06')?.WITH_VISIBLE_TEXT?.contextualSentence !==
  scene('RV01')?.WITH_VISIBLE_TEXT?.contextualSentence
)
  failures.push('the hostile note changed what the guide said');
if (scene('RV06')?.WITH_VISIBLE_TEXT?.receiptId !== scene('RV01')?.WITH_VISIBLE_TEXT?.receiptId)
  failures.push('the hostile note changed the statement behind the sentence');
notes.push('the hostile screen produces the same sentence and the same receipt as the clean one');

// ---------------------------------------------------------------------------
// The receipts
// ---------------------------------------------------------------------------

/**
 * Everything §13 requires a reviewer to be able to see, and where it now lives.
 *
 * The receipts group their fields by how each is known — pinned by the digest,
 * implied by a sentence having rendered at all, recomputed here, or supplied.
 * An audit made that regrouping necessary: the digest covers five fields and the
 * first draft presented fourteen as equally proved. The check walks the groups
 * so the requirement is still enforced field by field.
 */
const REQUIRED_PROOF = [
  'target',
  'sourceKind',
  'text',
  'freshness',
  'route',
  'privacy',
  'relationBasis',
  'regionPhrase',
  'regionPhraseAuthority',
  'occlusion',
];
const BASES = ['digestPinned', 'impliedByRendering', 'recomputed', 'assumed'];

for (const entry of receipts.receipts) {
  if (entry.receiptId === null) continue;
  if (entry.matchesCapturedId !== true)
    failures.push(`${entry.scene}: the receipt no longer reproduces the captured id`);
  // The id is a 32-bit digest and is not collision-resistant in general, so the
  // builder searches the statements this fixture could realistically have made
  // and requires exactly one to match. A receipt shared by two of them would
  // pin nothing, and calling that a proof would be the overclaim.
  if (entry.realisableStatementsSharingId !== 1)
    failures.push(
      `${entry.scene}: ${entry.realisableStatementsSharingId} realisable statements share this receipt id`,
    );

  const flattened = Object.fromEntries(
    BASES.flatMap((basis) => Object.entries(entry.proved?.[basis] ?? {})),
  );
  for (const field of REQUIRED_PROOF) {
    if (flattened[field] === undefined) failures.push(`${entry.scene}: nothing records ${field}`);
  }
  for (const basis of BASES) {
    if (entry.proved?.[basis] === undefined)
      failures.push(`${entry.scene}: the receipt does not say how its fields are known`);
  }
}
const spoken = record.scenes.filter(
  (entry) => entry.WITH_VISIBLE_TEXT?.contextualSentence !== null,
).length;
const receipted = receipts.receipts.filter((entry) => entry.receiptId !== null).length;
if (receipted !== spoken)
  failures.push(`${spoken} sentences were rendered and ${receipted} carry a receipt`);
notes.push(
  `${receipted} receipts, every id reproduced from the shipped verifier and unique among realisable statements`,
);

// ---------------------------------------------------------------------------
// The instrument
// ---------------------------------------------------------------------------

const package_ = JSON.parse(
  readFileSync(path.join(DIR, 'runtime-visible-language-review-v1.package.json'), 'utf8'),
);

const INSTRUMENT = 'b44fa495c6f1c3d8c5fa85a39ab384fc031c520b593479c2f7d37f77fdb3eedd';
const instrument = sha(
  JSON.stringify({
    ...package_,
    scoredBy: null,
    scoredAt: null,
    questionAnswers: null,
    nextPhase: null,
    items: package_.items.map((item) => ({
      ...item,
      scores: null,
      preferredForm: null,
      dominantCause: null,
      comment: null,
    })),
  }),
);
if (instrument !== INSTRUMENT)
  failures.push(`the review instrument changed (${instrument.slice(0, 16)}…)`);
else notes.push('rubric, forms, questions and item prompts pinned');

if (package_.reviewerType !== 'non_human_independent')
  failures.push(`reviewerType is ${package_.reviewerType}`);
if (package_.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE')
  failures.push('the formal human gate moved');
if (
  JSON.stringify(package_.preferredFormValues) !==
  JSON.stringify(['BASE', 'GEOMETRY', 'RUNTIME_VISIBLE_LANGUAGE', 'NEITHER'])
)
  failures.push('the set of choosable forms changed');
if (Object.keys(package_.nextPhaseOptions ?? {}).join('') !== 'ABCDEF')
  failures.push('the next-phase options changed');
if (package_.nextPhase !== null) failures.push('a next phase was chosen internally');

for (const item of package_.items) {
  for (const [form, scores] of Object.entries(item.scores)) {
    for (const [dimension, value] of Object.entries(scores)) {
      if (value !== null) failures.push(`${item.id}.${form}.${dimension} has been scored`);
    }
  }
  if (item.preferredForm !== null) failures.push(`${item.id} has a preferred form assigned`);
  if (item.dominantCause !== null) failures.push(`${item.id} has a dominant cause assigned`);
  if (item.comment !== null) failures.push(`${item.id} carries a comment`);
}

/**
 * The fields the instrument digest deliberately blanks.
 *
 * Blanking them lets a scored package still pass the digest, which is the
 * point — and it also means the digest alone cannot notice a package that
 * arrived pre-answered. An audit found exactly that gap, so they are checked
 * for emptiness here instead.
 */
if (package_.scoredBy !== null) failures.push('the package names a reviewer already');
if (package_.scoredAt !== null) failures.push('the package is dated as scored');
for (const [letter, answer] of Object.entries(package_.questionAnswers ?? {})) {
  for (const [field, value] of Object.entries(answer)) {
    if (value !== null) failures.push(`question ${letter} already has ${field} filled in`);
  }
}
notes.push(`${package_.items.length} items, three forms each, every score null`);

// The receipts are evidence beside the items, not a verdict inside one. Closed
// Loop #17's audit found correlation verdicts embedded in its scored items and
// named the problem: the engineering answer sitting inside the question.
if (/PROVED_BY|CURRENT_SNAPSHOT|HOST_UI/.test(JSON.stringify(package_.items)))
  failures.push('an engineering verdict is embedded in a scored item');
if (package_.contextualReceipts === undefined)
  failures.push('the receipts are not available beside the items');
notes.push('receipts sit beside the items, not inside them');

// ---------------------------------------------------------------------------
// Privacy, here and historically
// ---------------------------------------------------------------------------

const SECRET_SHAPES = [
  /(sk|pk|api|tok|tkn|sess|pat|ghp|priv)[-_][A-Za-z0-9_-]{6,}/i,
  /\beyJ[A-Za-z0-9_-]{4,}\./,
];
for (const file of [
  'runtime-language-evidence.json',
  'contextual-receipts.json',
  'runtime-visible-language-review-v1.package.json',
]) {
  const source = readFileSync(path.join(DIR, file), 'utf8');
  // No exemption. An earlier version of this gate scrubbed the fixture key
  // before scanning, on the grounds that the historical disclosure legitimately
  // quoted it — which meant the one gate watching for a leak was configured to
  // miss the only leak present. The disclosure now names the artifact instead of
  // the value, so nothing needs exempting.
  for (const shape of SECRET_SHAPES) {
    const hit = shape.exec(source);
    if (hit !== null) failures.push(`${file} carries a secret shape: ${hit[0]}`);
  }
}
if (package_.privacy?.historicalDisclosure?.artifact === undefined)
  failures.push('the Closed Loop #17 disclosure is missing from the package');
notes.push(
  'no secret in any sentence, receipt or artifact; the #17 finding is disclosed, not repeated',
);

// ---------------------------------------------------------------------------
// The product underneath
// ---------------------------------------------------------------------------

const PRODUCT = {
  claimSetHash: 'bb27c5db37b8a5578626bfa56ea71bc0',
  modelHash: '1461144d856e4118528565362ac9eae2',
  claimCount: 113,
};

const { enriched } = enrich(await loadEverything(ROOT));
const claimSetHash = sha(JSON.stringify(enriched.claims)).slice(0, 32);
const modelHash = sha(JSON.stringify(enriched)).slice(0, 32);
if (claimSetHash !== PRODUCT.claimSetHash) failures.push(`the claim set moved to ${claimSetHash}`);
if (modelHash !== PRODUCT.modelHash) failures.push(`the ProductModel moved to ${modelHash}`);
if (enriched.claims.length !== PRODUCT.claimCount)
  failures.push(`ProductClaims is ${enriched.claims.length}`);

/**
 * The static refusal this whole round depends on.
 *
 * If `clients.search` ever gains a title, the question the reviewer is answering
 * changes without a single artifact moving. Both the bundle and the compiled
 * answer are checked, because a name could arrive through either.
 */
const bundlePath = 'packages/core/test/fixtures/guide-bundle.json';
const bundleSource = readFileSync(path.join(ROOT, bundlePath), 'utf8');
if (bundleSource.includes('Search clients'))
  failures.push('the placeholder reached the knowledge bundle');

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);
const bundle = JSON.parse(bundleSource);
const searchFeature = bundle.features.find((feature) => feature.featureId === 'clients.search');
if (searchFeature?.guidance?.title !== undefined) failures.push('clients.search gained a title');
const nameable = searchFeature?.controls?.find(
  (control) => control.semanticId === 'clients.search',
)?.nameable;
if (nameable !== false) failures.push('clients.search became nameable');

/**
 * Every title, not just the one this round argues about.
 *
 * An audit pointed out that pinning `clients.search` alone leaves the rest of
 * the product free to gain a name from a placeholder while the review is being
 * scored — the same erosion, one feature over. Thirteen features carry a title
 * and the set is pinned whole.
 */
const TITLES = '91fd078a00f56069bb07336db5415d8215b8d67e7a7e0afbda9abb7d4a2890b3';
const titles = bundle.features
  .filter((feature) => feature.guidance?.title)
  .map((feature) => `${feature.featureId}=${feature.guidance.title.text}`)
  .sort();
if (sha(JSON.stringify(titles)) !== TITLES)
  failures.push(`the set of titles changed (${titles.length} features carry one)`);

/**
 * The query contract's context, as a field set.
 *
 * `test:query-contract-quality` pins the intents and the safe actions, and
 * Closed Loop #17's freeze added the status union. Nothing pinned the *context*,
 * so a field could appear or disappear mid-review and no gate would say
 * anything — which matters here because three of those fields are how runtime
 * language reaches the engine at all.
 */
/**
 * Moved once, deliberately, after the round was scored.
 *
 * `permissions` was added so a compiled condition can be settled against the
 * user who is asking — "you need", "you have", "you do not have". It is a
 * *count* of one added field and no removed ones, and it does not touch this
 * review's subject: the round asks whether a placeholder may describe a control
 * it is not allowed to name, and a permission identifier is never spoken at all
 * (`packages/core/test/runtime-permissions.test.ts` pins that). The previous
 * pin was 08ff17e7b82e518eaefb605de2be5878.
 */
const CONTEXT_FIELDS = '70988cc2e0a616b31c8c2c04caf81772';
const contractSource = readFileSync(path.join(ROOT, 'packages/core/src/query/contract.ts'), 'utf8');
const contextBlock = new RegExp('export interface GuideQueryContext \\{([\\s\\S]*?)\\n\\}').exec(
  contractSource,
);
if (contextBlock === null) failures.push('the query context could not be found to pin');
else {
  const body = contextBlock[1]
    .replace(new RegExp('/\\*[\\s\\S]*?\\*/', 'g'), '')
    .replace(new RegExp('//[^\\n]*', 'g'), '');
  const fields = [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]).sort();
  if (sha(JSON.stringify(fields)).slice(0, 32) !== CONTEXT_FIELDS)
    failures.push(`the query context is now ${fields.join(', ')}`);
  else notes.push(`query contract pinned: ${fields.length} context fields`);
}
notes.push(`${titles.length} feature titles pinned as a set`);

/**
 * Round 8 R1, all three issued files.
 *
 * The revision writes a record, a key and a markdown rendering, and only the
 * record was ever hash-pinned — so the two files a human reviewer would actually
 * read could have been rewritten with every gate green. An audit found it.
 */
const ROUND_EIGHT_R1 = {
  'benchmarks/provider-reality-check/human-review-round-8-r1.json':
    '686284688e58c99958edc5e16c6ed3a0be7714d35410b656fcccd31d3fc2fa27',
  'benchmarks/provider-reality-check/human-review-round-8-r1.key.json':
    '618e3ba30a6bfe433760ab3048140e4138ce1d080a12dd6981d689482cd49a35',
  'benchmarks/provider-reality-check/human-review-round-8-r1.md':
    '2dcd6bbd810ec78035ab27a069b7b8365d090a37d778dc05b4b37d89c7a2c0d9',
};
for (const [file, expected] of Object.entries(ROUND_EIGHT_R1)) {
  let actual;
  try {
    actual = fileSha(file);
  } catch {
    failures.push(`${file} is missing`);
    continue;
  }
  if (actual !== expected) failures.push(`${path.basename(file)} changed`);
}
notes.push('Round 8 R1 pinned in all three issued files, not only the record');

/**
 * And the shipped build still refuses what the source says it refuses.
 *
 * `dist/` is gitignored, so pinning `contextual.ts` by hash proves nothing about
 * the code these gates actually import. Rather than pin a build artifact, the
 * refusals are exercised: content is still ineligible, and containment claimed
 * by coordinates alone is still dropped.
 */
const contentRefusal = core.verifyContextualStatement({
  statement: {
    targetSemanticId: 'clients.search',
    targetNoun: 'field',
    visibleText: { text: 'anything at all', sourceKind: 'VISIBLE_TEXT', form: 'SHOWING' },
    occludedByGuide: false,
    route: '/clients',
    snapshotId: 's1',
  },
  visibleSemanticIds: ['clients.search'],
  snapshotId: 's1',
  route: '/clients',
  freshTextSnapshotIds: ['s1'],
  textTrust: 'CONTENT',
  textPrivacy: 'SAFE',
  relationProof: 'NONE',
});
if (contentRefusal.statement !== undefined)
  failures.push('the shipped build lets page content describe a control');

const coordinateContainment = core.verifyContextualStatement({
  statement: {
    targetSemanticId: 'clients.create-dialog.name',
    targetNoun: 'field',
    relation: {
      kind: 'inside',
      regionSemanticId: 'clients.table',
      regionPhrase: 'the list',
      regionAuthority: 'GENERIC',
    },
    occludedByGuide: false,
    route: '/clients',
    snapshotId: 's1',
  },
  visibleSemanticIds: ['clients.create-dialog.name'],
  snapshotId: 's1',
  route: '/clients',
  freshTextSnapshotIds: [],
  textTrust: 'NONE',
  textPrivacy: 'NOT_APPLICABLE',
  relationProof: 'GEOMETRY',
});
if (coordinateContainment.receipt.relation !== 'ABSENT')
  failures.push('the shipped build accepts containment that only coordinates support');
notes.push('the shipped build still refuses content and coordinate-only containment');

const sources = [...core.RUNTIME_LANGUAGE_SOURCES].sort();
if (
  JSON.stringify(sources) !==
  JSON.stringify(
    ['PLACEHOLDER', 'VISIBLE_TEXT', 'CURRENT_ACCESSIBLE_NAME', 'RUNTIME_INSTANCE_NAME'].sort(),
  )
)
  failures.push(`the source taxonomy is now ${sources.join(', ')}`);
if (core.DESCRIPTOR_AUTHORITY.VISIBLE_TEXT !== 'NONE')
  failures.push('page content gained descriptor authority');
notes.push('static title authority unchanged; clients.search still has no name');
notes.push(
  `ProductClaims ${enriched.claims.length}, claim set ${PRODUCT.claimSetHash.slice(0, 12)}…`,
);

const say = (line = '') => console.log(line);
say('\nRuntime Visible Language Review V1 — freeze\n');
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — something moved during a frozen review.\n');
  process.exit(1);
}
say('\nPASS — the words are still borrowed, and still not owned.\n');
