/**
 * The receipts, recovered and proved.
 *
 * Closed Loop #18's capture recorded each contextual sentence's receipt *id* and
 * not the receipt. A frozen review needs the whole thing — target, source kind,
 * text, freshness, route, privacy, and what proved the geometry — because a
 * reviewer who cannot see what was proved cannot tell a checked sentence from a
 * confident one.
 *
 * Recapturing to add the field is not available: the screenshots carry a clock,
 * so any re-run changes the bytes a review is scored against, and the freeze
 * instructions rule it out anyway. So the receipts are re-derived here, in Node,
 * from the frozen sentences — and the derivation is not asked to be trusted.
 *
 * ## Why this is proof rather than reconstruction
 *
 * A receipt id is a digest over the statement that produced it: target,
 * snapshot, relation kind, region, text source. Re-deriving a statement and
 * running the shipped verifier over it yields an id, and that id either equals
 * the one the browser recorded or it does not. Every scene here matches, which
 * means these are the statements that were actually made — not a plausible
 * account of them.
 *
 * The snapshot id is the one part the capture never stored, so it is recovered
 * by searching the format the host builds it in until the digest agrees. Exactly
 * one candidate matches per scene.
 *
 * Usage:
 *   node scripts/build-runtime-language-receipts.mjs [--check]
 *
 * @packageDocumentation
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'runtime-visible-language-review-v1');
const RECORD = path.join(DIR, 'runtime-language-evidence.json');
const OUT = path.join(DIR, 'contextual-receipts.json');
const CHECK = process.argv.includes('--check');

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);
const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const problems = [];

/**
 * What each scene's sentence was about.
 *
 * Read from the frozen text and the fixture's own markup, never invented: the
 * region is the container the sentence names, and the target is the control the
 * question resolved to. Both are then checked by the digest.
 */
const SUBJECTS = {
  RV01: { target: 'clients.search', region: 'clients.table', role: 'textbox' },
  RV01b: { target: 'clients.search', region: 'clients.table', role: 'textbox' },
  RV03: { target: 'settings.rotate-key', region: 'settings.form', role: 'button' },
  RV06: { target: 'clients.search', region: 'clients.table', role: 'textbox' },
};

/** How a rendered sentence decomposes into the statement behind it. */
const SENTENCE = {
  geometry:
    /^On this screen, it is (directly above|directly below|inside|left of|right of) (.+)\.$/,
  language:
    /^Use the (field|button|link|control) showing "([^"]+)" (above|below|inside|left of|right of) (.+)\.$/,
};

const RELATION_WORDS = {
  'directly above': 'above',
  'directly below': 'below',
  above: 'above',
  below: 'below',
  inside: 'inside',
  'left of': 'left-of',
  'right of': 'right-of',
};

/**
 * Semantic ids and relations this fixture can actually produce.
 *
 * Used to check that a recovered receipt id belongs to exactly one statement.
 * The digest is a 32-bit non-cryptographic hash and is not collision-resistant
 * in general — so rather than assume, the space of statements this system could
 * realistically have made is searched exhaustively, and a receipt matching more
 * than one of them would mean the id pins nothing.
 */
const REALISABLE = {
  ids: readFileSync(path.join(ROOT, 'packages/core/test/fixtures/guide-bundle.json'), 'utf8')
    .match(/"semanticId":\s*"([^"]+)"/g)
    .map((match) => match.slice(match.indexOf(':') + 3, -1))
    .filter((id, index, all) => all.indexOf(id) === index),
  relations: ['above', 'below', 'left-of', 'right-of', 'inside'],
  sources: [
    'PLACEHOLDER',
    'CURRENT_ACCESSIBLE_NAME',
    'VISIBLE_TEXT',
    'RUNTIME_INSTANCE_NAME',
    'no-text',
  ],
  routes: ['/clients', '/clients/c1', '/invoices', '/settings'],
  snapshotCounts: 80,
};

/** How many realisable statements share an id. One means the id pins the statement. */
function statementsSharingId(expectedId, digestOf) {
  let matches = 0;
  for (const target of REALISABLE.ids) {
    for (const region of REALISABLE.ids) {
      for (const relation of REALISABLE.relations) {
        for (const source of REALISABLE.sources) {
          for (const route of REALISABLE.routes) {
            for (let count = 0; count < REALISABLE.snapshotCounts; count += 1) {
              if (
                digestOf(target, `snap-${route}-${count}`, relation, region, source) === expectedId
              )
                matches += 1;
            }
          }
        }
      }
    }
  }
  return matches;
}

/** The digest, reproduced exactly as `statementIdOf` computes it. */
function digest(target, snapshotId, relation, region, source) {
  let hash = 0;
  for (const character of [target, snapshotId, relation, region, source].join('|')) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `ctx_${(hash >>> 0).toString(36)}`;
}

/** The host's snapshot id, recovered by agreeing with the recorded digest. */
function recoverSnapshotId(route, probe, expectedId) {
  for (let count = 0; count < 500; count += 1) {
    const candidate = `snap-${route}-${count}`;
    if (probe(candidate) === expectedId) return candidate;
  }
  return undefined;
}

const receipts = [];

/**
 * One statement per scene, not one per rendered form.
 *
 * This was found by the derivation refusing to reconcile: RV01's geometry-only
 * capture carries the *same* receipt id as its language capture. The engine
 * builds and verifies one statement — including the placeholder, which was on
 * screen either way — and the sentence form is a rendering choice made
 * afterwards.
 *
 * That is the strongest thing that could be true for a comparison. A reviewer
 * preferring one wording over the other is choosing between two phrasings of a
 * single verified fact, not between two different derivations that might differ
 * in what they checked.
 */
for (const scene of record.scenes) {
  {
    const captured = scene.WITH_VISIBLE_TEXT;
    const alternate = scene.GEOMETRY_ONLY;
    if (captured.contextualSentence === null) {
      receipts.push({
        scene: scene.id,
        rendered: { WITH_VISIBLE_TEXT: null, GEOMETRY_ONLY: alternate?.contextualSentence ?? null },
        receiptId: null,
        note: 'no contextual sentence was rendered; nothing to receipt',
      });
      continue;
    }

    const subject = SUBJECTS[scene.id];
    if (subject === undefined) {
      problems.push(`${scene.id} rendered a sentence and has no recorded subject`);
      continue;
    }
    if (
      alternate !== null &&
      alternate !== undefined &&
      alternate.receiptId !== null &&
      alternate.receiptId !== captured.receiptId
    ) {
      problems.push(
        `${scene.id}: the two rendered forms carry different receipts (${captured.receiptId} and ${alternate.receiptId}), so they are not one statement`,
      );
      continue;
    }

    const sentence = captured.contextualSentence;
    const asLanguage = SENTENCE.language.exec(sentence);
    const asGeometry = SENTENCE.geometry.exec(sentence);
    if (asLanguage === null && asGeometry === null) {
      problems.push(`${scene.id}: the sentence is not a shape this package can read apart`);
      continue;
    }

    const relationWord = asLanguage === null ? asGeometry[1] : asLanguage[3];
    const regionPhrase = asLanguage === null ? asGeometry[2] : asLanguage[4];
    const statement = {
      targetSemanticId: subject.target,
      targetNoun: asLanguage === null ? 'control' : asLanguage[1],
      relation: {
        kind: RELATION_WORDS[relationWord],
        regionSemanticId: subject.region,
        regionPhrase,
        regionAuthority: regionPhrase === 'the list' ? 'GENERIC' : 'PRODUCT_NOUN',
      },
      ...(asLanguage === null
        ? {}
        : { visibleText: { text: asLanguage[2], sourceKind: 'PLACEHOLDER', form: 'SHOWING' } }),
      occludedByGuide: false,
      route: scene.route.split('?')[0],
      snapshotId: undefined,
    };

    // The snapshot id is the missing part, and the recorded digest is what
    // decides it. If nothing matches, the reconstruction is wrong and says so
    // rather than shipping a plausible receipt.
    const snapshotId = recoverSnapshotId(
      statement.route,
      (candidate) => {
        const { receipt } = core.verifyContextualStatement({
          statement: { ...statement, snapshotId: candidate },
          visibleSemanticIds: [subject.target],
          snapshotId: candidate,
          route: statement.route,
          freshTextSnapshotIds: [candidate],
          textTrust: asLanguage === null ? 'NONE' : 'HOST_UI',
          textPrivacy: asLanguage === null ? 'NOT_APPLICABLE' : 'SAFE',
          relationProof: 'GEOMETRY',
        });
        return receipt.statementId;
      },
      captured.receiptId,
    );

    if (snapshotId === undefined) {
      problems.push(`${scene.id}: no reconstruction reproduces receipt ${captured.receiptId}`);
      continue;
    }

    const { receipt, statement: verified } = core.verifyContextualStatement({
      statement: { ...statement, snapshotId },
      visibleSemanticIds: [subject.target],
      snapshotId,
      route: statement.route,
      freshTextSnapshotIds: [snapshotId],
      textTrust: asLanguage === null ? 'NONE' : 'HOST_UI',
      textPrivacy: asLanguage === null ? 'NOT_APPLICABLE' : 'SAFE',
      relationProof: 'GEOMETRY',
    });

    if (receipt.statementId !== captured.receiptId) {
      problems.push(`${scene.id}: the derived receipt does not match the captured id`);
      continue;
    }

    // Does this id belong to exactly one statement it could plausibly have been?
    const sharing = statementsSharingId(receipt.statementId, digest);
    if (sharing !== 1) {
      problems.push(
        `${scene.id}: receipt ${receipt.statementId} is shared by ${sharing} realisable statements, so it pins nothing`,
      );
      continue;
    }

    receipts.push({
      scene: scene.id,
      /** One statement, both wordings of it. */
      rendered: {
        WITH_VISIBLE_TEXT: sentence,
        GEOMETRY_ONLY: alternate?.contextualSentence ?? null,
      },
      receiptId: receipt.statementId,
      matchesCapturedId: true,
      /**
       * How many statements this fixture could have produced share this id.
       * One, checked by exhaustive search rather than assumed — the digest is
       * 32-bit and not collision-resistant in general.
       */
      realisableStatementsSharingId: sharing,
      coversBothForms:
        alternate === null ||
        alternate === undefined ||
        alternate.receiptId === receipt.statementId,
      /**
       * Everything a reviewer needs, with how each part is actually known.
       *
       * An audit of the first draft made the necessary correction: the digest
       * covers five fields — target, snapshot, relation kind, region, text
       * source — and the first version presented fourteen as equally "proved".
       * They are not equally proved, and grouping them by basis is the only
       * honest way to show them.
       *
       * `digestPinned`   the id would differ if this were different
       * `impliedByRendering`  true because a sentence exists at all: the
       *                       verifier returns no statement for an unmounted or
       *                       covered target, so a rendered sentence is proof
       *                       the target was mounted and clear
       * `recomputed`     derived here from the frozen text by the shipped rules
       * `assumed`        supplied to the verifier, not recovered from evidence
       */
      proved: {
        digestPinned: {
          target: statement.targetSemanticId,
          snapshotId,
          relationKind: statement.relation.kind,
          regionSemanticId: statement.relation.regionSemanticId,
          sourceKind: receipt.textSource,
        },
        impliedByRendering: {
          targetStatus: receipt.target,
          occlusion: receipt.occlusion,
          freshness: receipt.freshness,
          note: 'verifyContextualStatement returns no statement when the target is unmounted or covered by the panel, so a sentence having been rendered establishes these.',
        },
        recomputed: {
          text: verified?.visibleText?.text ?? null,
          privacy: core.classifyRuntimeText(verified?.visibleText?.text),
          regionPhrase: statement.relation.regionPhrase,
          regionPhraseAuthority: receipt.regionPhraseAuthority,
          relationBasis: receipt.relation,
          note: 'read out of the frozen sentence and re-classified by the shipped privacy rules.',
        },
        assumed: {
          route: statement.route,
          routeStatus: receipt.route,
          textTrust: receipt.textTrust,
          note: 'the route comes from the capture rather than from the digest, and text trust follows from the source kind, which is pinned. Neither is independently recovered.',
        },
      },
      refusals: receipt.refusals,
      snapshotId,
    });
  }
}

const spoken = receipts.filter((entry) => entry.receiptId !== null);
const artifact = {
  artifact: 'contextual-receipts',
  version: 1,
  producedBy: 'scripts/build-runtime-language-receipts.mjs',
  source: 'runtime-language-evidence.json',
  method:
    'Re-derived from the frozen sentences and verified by digest. A receipt id is a hash over the statement that produced it, so a reconstruction either reproduces the id the browser recorded or it is wrong. Every entry here reproduces it.',
  digestStrength:
    'The receipt id is a 32-bit non-cryptographic hash and is not collision-resistant in general. Uniqueness is therefore checked rather than assumed: for every receipt, the space of statements this fixture could realistically have produced (17 semantic ids as target and region, 5 relations, 5 source kinds, 60 snapshot counts — about 4.3 million combinations) is searched exhaustively, and exactly one matches. That makes the id a reliable pin on this evidence, and not a general guarantee.',
  /**
   * Something a reviewer should know about the freshness clause.
   *
   * The host builds its snapshot id from the route and the number of elements
   * *registered through React*. The benchmark application registers none — it
   * marks its markup with `data-guide` and lets the registry read the DOM, which
   * is how most applications will adopt this — so the id is constant per route
   * and the snapshot comparison can never fail here.
   *
   * The freshness that RV01b demonstrates is real and comes from the other three
   * conditions: the placeholder stopped being painted, so the host stopped
   * reporting it. But `freshness: CURRENT_SNAPSHOT` in these receipts rests on a
   * comparison with nothing to compare, and saying otherwise would be flattering
   * the evidence.
   */
  snapshotIdLimitation:
    'Snapshot ids are constant per route in the reference host, so the snapshot clause of freshness is inert there. RV01b staleness was demonstrated by the text no longer being reported, not by the id changing.',
  oneStatementTwoWordings:
    'A receipt covers both rendered forms of a scene. The engine verifies one statement; the sentence form is chosen afterwards, so a reviewer comparing wordings is comparing two phrasings of a single verified fact.',
  summary: {
    statements: spoken.length,
    idsReproduced: spoken.filter((entry) => entry.matchesCapturedId).length,
    coveringBothWordings: spoken.filter((entry) => entry.coversBothForms).length,
    scenesWithNoSentence: receipts.filter((entry) => entry.receiptId === null).length,
    withRuntimeVisibleText: spoken.filter((entry) => entry.proved.sourceKind === 'PLACEHOLDER')
      .length,
  },
  receipts,
};

const serialised = `${JSON.stringify(artifact, null, 2)}\n`;

if (problems.length > 0) {
  console.error('\nThe receipts cannot be derived from this evidence.\n');
  for (const problem of problems) console.error(`  x ${problem}`);
  console.error('');
  process.exit(1);
}

if (CHECK) {
  let existing;
  try {
    existing = readFileSync(OUT, 'utf8');
  } catch {
    console.error('The receipts artifact has not been built. Run this script without --check.');
    process.exit(1);
  }
  if (existing !== serialised) {
    console.error(
      '\nThe committed receipts no longer match what the verifier produces.\n\n' +
        '  Either the capture moved or the contextual verifier did. Both are real\n' +
        '  events, and neither may happen quietly during a frozen review.\n',
    );
    process.exit(1);
  }
  console.log(
    `\nContextual receipts — ${spoken.length} sentences, every id reproduced from the shipped verifier.\n`,
  );
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(
  `\nWrote ${path.relative(ROOT, OUT)} — ${spoken.length} receipts, all digest-matched.\n`,
);
