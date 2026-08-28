/**
 * Visual Context Review V1, pinned where it stood.
 *
 * A frozen review is a promise that the thing a reviewer scored is the thing
 * that was built. Every hash here is that promise written down: the ten
 * screenshots, the evidence set, the recorded proposals, the correlations they
 * produce, the shape of the pack a provider would be handed, and the sentences
 * a user actually read.
 *
 * A changed hash is not automatically wrong. It is a statement that something
 * moved during a review round, which must be a deliberate act with a reason
 * rather than a side effect — the distinction Closed Loop #15 learned the
 * expensive way, and Closed Loop #17 nearly repeated.
 *
 * The product pins travel with it. A visual review is only meaningful while the
 * product it describes is standing still, so the claim set, the query contract,
 * runtime instance grounding, Interactive Review V2 and Round 8 R1 are all
 * checked here too. Freezing the pictures and letting the product move would
 * produce a review of something that no longer exists.
 *
 * Usage:
 *   pnpm test:visual-context-freeze
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { enrich, loadEverything } from './lib/runtime-integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'visual-context-review-v1');
const failures = [];
const notes = [];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fileSha = (relative) => sha(readFileSync(path.join(ROOT, relative)));

// ---------------------------------------------------------------------------
// The evidence, byte for byte
// ---------------------------------------------------------------------------

/**
 * The capture, as issued.
 *
 * Screenshots are included individually rather than as a directory digest so a
 * failure names the scene. A reviewer who is told "something changed" has to go
 * looking; one told "V05 changed" already knows it is the secret.
 */
const FROZEN = {
  'benchmarks/visual-context-review-v1/visual-evidence.json':
    'ee37f09f364da9d98f4de5ad0d5833aa73046c9cdc0f35ed8007bda2e94c1895',
  'benchmarks/visual-context-review-v1/screenshots/V01.png':
    '4f90728a0984e10de0417d4f2280660c9a2a52590beb05c125338ad204188841',
  'benchmarks/visual-context-review-v1/screenshots/V02.png':
    '02ed9b81c8642aad47518e5910266510ba26c80e0d4ca8e1299a5eb3a05fcbe6',
  'benchmarks/visual-context-review-v1/screenshots/V03.png':
    'e9a5c455a30bad6bdfa171fd20d12ff8bce2b58f6e5effc119c36277dea3e4fe',
  'benchmarks/visual-context-review-v1/screenshots/V04.png':
    'a18acd68b8326928046306af9c105746c22ce2dc1b1b49b2c04aaac50a359579',
  'benchmarks/visual-context-review-v1/screenshots/V05.png':
    'd02c7576c27371b0407e991c974af79fc51f04522ad61d6039661c7b9f9640a4',
  'benchmarks/visual-context-review-v1/screenshots/V06.png':
    'a5524fc92c70aa01e3a60108f6dbb6c27bce2614e4d29afa3b568e83b9f58dec',
  'benchmarks/visual-context-review-v1/screenshots/V07.png':
    '44c98a0728b9dfed88b81e500c37ac6774e821f20153167ab3f47d923c521fc6',
  'benchmarks/visual-context-review-v1/screenshots/V08.png':
    'f7f05b87ca1b4308510581455b93aac744ba89016053de391e7945b385052563',
  'benchmarks/visual-context-review-v1/screenshots/V09.png':
    '4fa5cad2b42d686f84b2adfe9a2c25dcb84ffb3abaeda00374112b7a7e425894',
  'benchmarks/visual-context-review-v1/screenshots/V10.png':
    '9b8ae3ef452b01fc817a0aa54e31c8a42c16c7ce0b762558f7169b9c4bc4b620',
  'packages/runtime/test/fixtures/visual-scenes.ts':
    '659500d97b876a13160c2d83bc4db52c0a371274a1ec84dbd97aee9a6a9763ca',
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
notes.push(`${Object.keys(FROZEN).length} evidence files pinned`);

// Nothing may quietly join the set either. A review of ten scenes that finds
// eleven screenshots is reviewing something else.
const shots = readdirSync(path.join(DIR, 'screenshots')).sort();
if (shots.length !== 10) failures.push(`${shots.length} screenshots, expected 10`);

// ---------------------------------------------------------------------------
// What the reviewer will read
// ---------------------------------------------------------------------------

const record = JSON.parse(readFileSync(path.join(DIR, 'visual-evidence.json'), 'utf8'));
const correlations = JSON.parse(readFileSync(path.join(DIR, 'visual-correlations.json'), 'utf8'));
const scene = (id) => record.scenes.find((entry) => entry.id === id);

/**
 * The sentences, pinned as text as well as as bytes.
 *
 * The hashes above would catch a change to these. They are named separately
 * because a hash failure says "something moved" and this says which sentence,
 * and because these particular strings are the entire user-visible result of
 * the loop.
 */
const SENTENCES = {
  V02: 'On this screen, it is directly above the list.',
  V05: 'On this screen, it is directly below the setting list.',
  V07: 'On this screen, it is directly above the list.',
  V08: 'On this screen, it is directly above the list.',
  V09: 'On this screen, it is directly above the list.',
  V10: 'On this screen, it is directly above the list.',
};
for (const [id, expected] of Object.entries(SENTENCES)) {
  const actual = scene(id)?.locationSentence;
  if (actual !== expected) failures.push(`${id} says ${JSON.stringify(actual)}`);
}
for (const entry of record.scenes) {
  if (SENTENCES[entry.id] === undefined && entry.locationSentence !== null)
    failures.push(`${entry.id} gained a location sentence`);
}

// Theme and viewport independence, as strings rather than as a claim about them.
const baseline = scene('V02');
for (const id of ['V07', 'V08', 'V09']) {
  const variant = scene(id);
  if (variant?.answerText !== baseline?.answerText)
    failures.push(`${id} no longer returns the frozen answer`);
}
notes.push('default, dark, white-label and phone width return one identical answer');

// ---------------------------------------------------------------------------
// The pack format
// ---------------------------------------------------------------------------

/**
 * The shape a provider would be handed.
 *
 * Pinned against the *source*, not against the artifact. Checking the captured
 * record's own keys looked like a format check and was not one: the record is
 * already hash-pinned above, so a key set read out of it can never disagree with
 * itself. An audit found that this whole block could not fire.
 *
 * Reading the interface declaration means a field added to or removed from
 * `VisualEvidencePack` fails here even though the frozen capture is untouched —
 * which is what "the pack format is frozen" was supposed to mean.
 */
// The declared format, which is twelve fields. Nine of them appear in the
// frozen capture; `screenshot`, `focusedSemanticId` and `selectedInstanceRef`
// were undefined in every scene and so are absent from the artifact. Pinning
// the declaration rather than the artifact is the difference between freezing
// the format and freezing one instance of it.
const PACK_KEYS = [
  'elements',
  'focusedSemanticId',
  'guideRegion',
  'occludedSemanticIds',
  'redactionManifest',
  'regions',
  'route',
  'screenshot',
  'screenshotHash',
  'selectedInstanceRef',
  'snapshotId',
  'viewport',
];
const PACK_KEYS_POPULATED = 9;
const ELEMENT_KEYS = ['box', 'disabled', 'guideOwned', 'name', 'role', 'semanticId', 'visible'];
const MANIFEST_KEYS = ['classification', 'placeholder', 'region', 'semanticId'];

/** Field names declared by an interface in a source file. */
function declaredFields(source, interfaceName) {
  const block = new RegExp(`export interface ${interfaceName} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (block === null) return undefined;
  // Strip comments first, so a field name mentioned in prose is not a field.
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1]).sort();
}

const packSource = readFileSync(
  path.join(ROOT, 'packages/runtime/src/visual/evidence-pack.ts'),
  'utf8',
);
for (const [name, expected] of [
  ['VisualEvidencePack', PACK_KEYS],
  ['VisualElement', ELEMENT_KEYS],
  ['RedactionEntry', MANIFEST_KEYS],
]) {
  const declared = declaredFields(
    name === 'RedactionEntry'
      ? readFileSync(path.join(ROOT, 'packages/runtime/src/visual/proposals.ts'), 'utf8')
      : packSource,
    name,
  );
  if (declared === undefined) failures.push(`${name} could not be found to pin`);
  else if (JSON.stringify(declared) !== JSON.stringify([...expected].sort()))
    failures.push(`${name} now declares ${declared.join(', ')}`);
}
const emitted = [...new Set(record.scenes.flatMap((entry) => Object.keys(entry.pack)))];
if (emitted.length !== PACK_KEYS_POPULATED)
  failures.push(
    `the capture populates ${emitted.length} pack fields, expected ${PACK_KEYS_POPULATED}`,
  );
notes.push(
  `pack format pinned from source: ${PACK_KEYS.length} declared, ${PACK_KEYS_POPULATED} populated in the capture`,
);

// The manifests themselves. Eleven regions were masked; a review that masked
// ten is a review of a different screenshot set.
const masked = record.scenes.reduce(
  (total, entry) => total + entry.pack.redactionManifest.length,
  0,
);
if (masked !== 11) failures.push(`${masked} masked regions, expected 11`);
const secrets = record.scenes.flatMap((entry) =>
  entry.pack.redactionManifest.filter((redaction) => redaction.classification === 'SECRET'),
);
if (secrets.length !== 1) failures.push(`${secrets.length} secrets masked, expected 1`);
notes.push(`${masked} regions masked, one of them a live-shaped key`);

// ---------------------------------------------------------------------------
// The correlations
// ---------------------------------------------------------------------------

/**
 * Two gates, two different questions, and neither is sufficient alone.
 *
 * This one reads the committed artifact and asserts the verdicts a reviewer will
 * see. `test:visual-correlations` re-derives that artifact from the pinned
 * fixture and the shipped code, and fails if they have drifted apart. So a
 * change to `correlate.ts` alone is caught there and not here; a change to the
 * committed verdicts alone is caught here and not there; a consistent change to
 * both is caught here, because these expectations are written down.
 */

const CORRELATION_VERDICTS = {
  'V02-p1': 'SUPPORTED',
  'V02-p2': 'UNRESOLVED',
  'V02-p3': 'UNRESOLVED',
  'V03-p1': 'CONTRADICTED',
  'V03-p2': 'CONTRADICTED',
  'V06-p1': 'CONTRADICTED',
  'V06-p2': 'CONTRADICTED',
  'V10-p1': 'UNRESOLVED',
  'V10-p2': 'CONTRADICTED',
  'VX-guide': 'CONTRADICTED',
  'OCC-p1': 'UNRESOLVED',
};
const verdicts = new Map(
  correlations.scenes.flatMap((entry) =>
    entry.correlations.map((result) => [result.proposalId, result.status]),
  ),
);
for (const [id, expected] of Object.entries(CORRELATION_VERDICTS)) {
  const actual = verdicts.get(id);
  if (actual !== expected) failures.push(`${id} correlates as ${actual}, frozen at ${expected}`);
}
if (verdicts.size !== Object.keys(CORRELATION_VERDICTS).length)
  failures.push(
    `${verdicts.size} correlations, expected ${Object.keys(CORRELATION_VERDICTS).length}`,
  );

const eligible = correlations.scenes
  .flatMap((entry) => entry.correlations)
  .filter((result) => result.eligibleForContextualPresentation);
if (eligible.length !== 1 || eligible[0]?.proposalId !== 'V02-p1')
  failures.push(`eligibility moved: ${eligible.map((entry) => entry.proposalId).join(', ')}`);
notes.push('11 correlations, 6 contradicted, exactly one eligible for presentation');

// The two cases a reviewer must be able to tell apart.
if (verdicts.get('OCC-p1') === 'CONTRADICTED')
  failures.push('an occluded control was scored as a false visual claim');
if (verdicts.get('V06-p1') !== 'CONTRADICTED')
  failures.push('a claim about an absent control stopped being contradicted');

// ---------------------------------------------------------------------------
// The review instrument
// ---------------------------------------------------------------------------

const package_ = JSON.parse(
  readFileSync(path.join(DIR, 'visual-context-review-v1.package.json'), 'utf8'),
);
if (package_.reviewerType !== 'non_human_independent')
  failures.push(`reviewerType is ${package_.reviewerType}`);
if (package_.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE')
  failures.push('the formal human gate moved');
if (package_.items.length !== 8) failures.push(`${package_.items.length} review items, expected 8`);

// Every score null. This is the one that would be quietest to break, because a
// filled-in score looks like progress.
for (const item of package_.items) {
  for (const [dimension, value] of Object.entries(item.scores)) {
    if (value !== null) failures.push(`${item.id}.${dimension} has been scored internally`);
  }
  if (item.dominantCause !== null) failures.push(`${item.id} has a dominant cause assigned`);
}
notes.push(`${package_.items.length} review items, every score null`);

/**
 * The instrument itself, not only the evidence it cites.
 *
 * An audit rewrote the rubric, set `truthfulness.max` to 99, deleted a
 * dimension, replaced every instruction with "Score generously." and flipped the
 * status to SCORED — and both gates stayed green, because one hashed the
 * evidence and the other compared derivations. Freezing a review means freezing
 * the questions, not just the pictures.
 *
 * Reviewer-owned fields are nulled before hashing, so a scored package still
 * passes. Everything else — rubric, instructions, questions, classifications,
 * item prompts, disclosures — is fixed.
 */
const INSTRUMENT_DIGEST = '5e66a7cde88d4a8d74bae694b4e099c66c8c7efb7738bf979329be98a2871804';
const instrumentDigest = sha(
  JSON.stringify({
    ...package_,
    scoredBy: null,
    scoredAt: null,
    questionAnswers: null,
    items: package_.items.map((item) => ({
      ...item,
      scores: null,
      dominantCause: null,
      comment: null,
    })),
  }),
);
if (instrumentDigest !== INSTRUMENT_DIGEST)
  failures.push(`the review instrument changed (${instrumentDigest.slice(0, 16)}…)`);
else notes.push('rubric, instructions, questions and item prompts pinned');

// The hostile text, still hostile.
if (!/Ignore previous instructions/i.test(package_.promptInjection?.untrustedContent ?? ''))
  failures.push('the hostile text was simplified or removed from the review package');
if (package_.liveProvider?.run !== false) failures.push('a live provider run was recorded');
if (package_.objectiveMetrics?.externalModelCalls !== 0)
  failures.push('an external model call was recorded');

// ---------------------------------------------------------------------------
// The query contract
// ---------------------------------------------------------------------------

/**
 * The response statuses, pinned from the source text.
 *
 * `test:query-contract-quality` already pins the intent taxonomy and the
 * safe-action union, both of which exist as exported arrays. The status union
 * exists only as a type, so nothing was checking it: a seventh status could
 * have appeared during a frozen review and no gate would have said anything.
 *
 * It is read out of the declaration rather than fixed by exporting a new array,
 * because a freeze is the wrong moment to add to a public API. The reading is
 * literal — union members in `packages/core/src/query/contract.ts` — so a status
 * added, removed or renamed fails here.
 */
const STATUSES = ['ANSWERED', 'PARTIAL', 'AMBIGUOUS', 'UNSUPPORTED', 'UNKNOWN', 'STALE_CONTEXT'];
const contractSource = readFileSync(path.join(ROOT, 'packages/core/src/query/contract.ts'), 'utf8');
const statusDeclaration = /export type GuideQueryStatus =([\s\S]*?);/.exec(contractSource);
if (statusDeclaration === null) {
  failures.push('the GuideQueryStatus union could not be found to pin');
} else {
  // Any quoted member, not only SCREAMING_CASE. An audit added `'Throttled'`
  // and walked past a check whose own docblock promised to catch exactly that.
  const declared = [...statusDeclaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (JSON.stringify(declared.sort()) !== JSON.stringify([...STATUSES].sort()))
    failures.push(`the status union is now ${declared.join(', ')}`);
  else
    notes.push(
      `query contract pinned: ${STATUSES.length} statuses, intents and safe actions by their own gate`,
    );
}

// The response field that carries visual context, and the two context fields
// that feed it. Their names are what the review instrument's arithmetic and
// every downstream host integration depend on.
for (const field of ['visualContext', 'elementBoxes', 'elementContainers']) {
  if (!contractSource.includes(`${field}?:`))
    failures.push(`the query contract no longer declares ${field}`);
}

// ---------------------------------------------------------------------------
// The product, standing still underneath it
// ---------------------------------------------------------------------------

const PRODUCT = {
  claimSetHash: 'bb27c5db37b8a5578626bfa56ea71bc0',
  claimCount: 113,
  /**
   * The whole model, not only its claims.
   *
   * The claim-set hash covers `enriched.claims` and nothing else, so an audit
   * mutated a feature title, deleted a workflow and added a permission with the
   * hash unmoved and the count unchanged. The user asked to freeze ProductModel
   * *and* ProductClaims; those were one pin doing half the job.
   */
  modelHash: '1461144d856e4118528565362ac9eae2',
  sources: {
    'benchmarks/provider-reality-check/round-2-product-model.json':
      'bc7d05cba30687c055c1e79ae39d5ecb4671566b8e0762e664ca10a4c8924e6e',
    'benchmarks/provider-reality-check/runtime-evidence-v1.json':
      'ce3c4bc523ce5a49b1ebd89ccb7d0004ef189372f904d7200ed0512bdc4f1321',
    'benchmarks/provider-reality-check/dataset-v1.json':
      'b029110218b35a2c9922225f3a31d48521983c35573961bbb1105cc04f9da352',
    'benchmarks/interactive-review-v2/interactive-review-v2.json':
      '36bf356f82640223f8f4a4c0612850935483d57388dfe1db9a377058ccfa1662',
  },
  /**
   * Interactive Review V2's screenshots, as one digest over names and bytes.
   *
   * Its own gates compare the package against the record and the record against
   * itself, which an audit defeated by editing both together: fabricated step
   * text reached the reviewer-facing package with all three gates green. A
   * frozen review needs an anchor outside its own derivation.
   */
  interactiveReviewV2Screenshots:
    '3b38f34279ddd2c924d53119e4a0fbb4db04dafb96f19baa86adec89183911ee',
  statuses: {
    structurally_verified: 41,
    semantically_grounded: 61,
    rejected: 4,
    behaviorally_verified: 7,
  },
  roundEightR1: '686284688e58c99958edc5e16c6ed3a0be7714d35410b656fcccd31d3fc2fa27',
};

const loaded = await loadEverything(ROOT);
const { enriched } = enrich(loaded);
const claimSetHash = sha(JSON.stringify(enriched.claims)).slice(0, 32);
const modelHash = sha(JSON.stringify(enriched)).slice(0, 32);
if (modelHash !== PRODUCT.modelHash) failures.push(`the ProductModel moved to ${modelHash}`);

for (const [file, expected] of Object.entries(PRODUCT.sources)) {
  let actual;
  try {
    actual = fileSha(file);
  } catch {
    failures.push(`${file} is missing`);
    continue;
  }
  if (actual !== expected) failures.push(`${file} changed (${actual.slice(0, 16)}…)`);
}

const v2Shots = createHash('sha256');
for (const name of readdirSync(
  path.join(ROOT, 'benchmarks/interactive-review-v2/screenshots'),
).sort()) {
  v2Shots.update(name);
  v2Shots.update(
    readFileSync(path.join(ROOT, 'benchmarks/interactive-review-v2/screenshots', name)),
  );
}
if (v2Shots.digest('hex') !== PRODUCT.interactiveReviewV2Screenshots)
  failures.push('the Interactive Review V2 screenshot set changed');

if (claimSetHash !== PRODUCT.claimSetHash)
  failures.push(`the claim set hash moved to ${claimSetHash}`);
if (enriched.claims.length !== PRODUCT.claimCount)
  failures.push(`ProductClaims is ${enriched.claims.length}`);
const statuses = {};
for (const claim of enriched.claims) statuses[claim.status] = (statuses[claim.status] ?? 0) + 1;
for (const [status, count] of Object.entries(PRODUCT.statuses)) {
  if (statuses[status] !== count)
    failures.push(`${status} is ${statuses[status]}, expected ${count}`);
}

// No claim may rest on a picture. The absence is the invariant.
const visual = enriched.claims.filter((claim) =>
  JSON.stringify(claim.evidence ?? [])
    .toLowerCase()
    .includes('visual'),
);
if (visual.length > 0) failures.push(`${visual.length} claims cite visual evidence`);

if (
  fileSha('benchmarks/provider-reality-check/human-review-round-8-r1.json') !== PRODUCT.roundEightR1
)
  failures.push('Round 8 R1 changed');
notes.push(
  `ProductClaims ${enriched.claims.length}, claim set ${PRODUCT.claimSetHash.slice(0, 12)}…`,
);

const say = (line = '') => console.log(line);
say('\nVisual Context Review V1 — freeze\n');
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — something moved during a frozen review.\n');
  process.exit(1);
}
say('\nPASS — the review and the thing it reviews are both where they were.\n');
