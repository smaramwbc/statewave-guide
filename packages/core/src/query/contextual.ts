/**
 * Verification for the sentences that describe *now*.
 *
 * Closed Loop #17 shipped one user-facing string that no verifier ever saw. Every
 * other sentence this system produces — titles, purposes, summaries, conditions,
 * step text — is checked against compiled guidance and dropped if it does not
 * match. The location sentence was computed after that check and added
 * afterwards, and the freeze record had to disclose it.
 *
 * The fix is not to push transient text through the static verifier. Those two
 * verifiers answer different questions and share no evidence: the static one
 * asks *does the ProductModel say this*, and for a sentence about what is on
 * screen the honest answer is always no. Sending contextual statements there
 * would either fail everything or, far worse, teach that verifier to accept
 * things the ProductModel never said.
 *
 * So there are two paths, and this is the second one. It proves a different set
 * of things — geometry, freshness, privacy, where the words came from — and it
 * issues a receipt saying which. A sentence with no receipt does not render.
 *
 * ## The receipt is the point
 *
 * Not the boolean. A receipt records what was proved and how, so a sentence that
 * reached a user can be explained afterwards without re-deriving anything: this
 * relation came from bounding boxes, this noun came from the ProductModel, these
 * words came from a placeholder in this snapshot, this target was not covered by
 * the panel. When one of those is missing the receipt says so and the sentence
 * loses that clause rather than the whole system losing its nerve.
 *
 * @packageDocumentation
 */

import type { RuntimeLanguageSource, RuntimeLanguageTrust } from './runtime-language.js';

/** The spatial relations geometry can settle. */
export type ContextualRelation = 'above' | 'below' | 'left-of' | 'right-of' | 'inside';

/**
 * What the guide proposes to say about the here and now.
 *
 * Structured rather than a string, so the verifier can check the parts and the
 * renderer can compose them. Closed Loop #17 built the sentence in the panel,
 * which is precisely why nothing could verify it.
 */
export interface ContextualStatement {
  targetSemanticId: string;
  /** What kind of thing the target currently is, in ordinary words. */
  targetNoun: 'field' | 'button' | 'link' | 'control';
  /** Where it sits, when geometry or the document proved it. */
  relation?: {
    kind: ContextualRelation;
    regionSemanticId: string;
    /** `the list`, or `the client list` when the product earned the noun. */
    regionPhrase: string;
    /** Whether the noun in that phrase is generic or a product concept. */
    regionAuthority: 'GENERIC' | 'PRODUCT_NOUN';
  };
  /**
   * Words the interface is showing, when a source with descriptor authority
   * supplied them. The form is fixed at `SHOWING`: the sentence may say the
   * control *shows* this text and may never say it is *named* it.
   */
  visibleText?: {
    text: string;
    sourceKind: RuntimeLanguageSource;
    form: 'SHOWING';
  };
  /** Whether the guide's own panel is covering the target right now. */
  occludedByGuide: boolean;
  route: string | undefined;
  snapshotId: string | undefined;
}

/**
 * What was proved, clause by clause.
 *
 * Every field is a fact about this statement in this snapshot. `refusals` names
 * whatever was proposed and rejected, which is the part worth reading when a
 * sentence came out shorter than expected.
 */
export interface ContextualReceipt {
  /** Stable within a snapshot, so a rendered sentence can be traced back. */
  statementId: string;
  verified: boolean;
  relation: 'PROVED_BY_GEOMETRY' | 'PROVED_BY_DOCUMENT' | 'ABSENT';
  target: 'MOUNTED' | 'ABSENT';
  textSource: RuntimeLanguageSource | 'NONE';
  textTrust: RuntimeLanguageTrust | 'NONE';
  freshness: 'CURRENT_SNAPSHOT' | 'STALE' | 'NOT_APPLICABLE';
  route: 'MATCHED' | 'UNKNOWN';
  privacy: 'SAFE' | 'WITHHELD';
  regionPhraseAuthority: 'GENERIC' | 'PRODUCT_NOUN' | 'ABSENT';
  occlusion: 'CLEAR' | 'COVERED_BY_GUIDE';
  refusals: readonly string[];
}

/** A deterministic handle for a statement, so a receipt can name it. */
function statementIdOf(statement: ContextualStatement): string {
  const parts = [
    statement.targetSemanticId,
    statement.snapshotId ?? 'no-snapshot',
    statement.relation?.kind ?? 'no-relation',
    statement.relation?.regionSemanticId ?? '',
    statement.visibleText?.sourceKind ?? 'no-text',
  ];
  // A short non-cryptographic digest. This identifies a sentence within one
  // snapshot; it is not a security boundary and does not need to be one.
  let hash = 0;
  for (const character of parts.join('|')) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `ctx_${(hash >>> 0).toString(36)}`;
}

export interface ContextualVerification {
  receipt: ContextualReceipt;
  /** The statement as it survived verification. Absent when nothing survived. */
  statement?: ContextualStatement;
}

/**
 * Check a proposed contextual statement and issue its receipt.
 *
 * Clauses are dropped individually. A statement whose text failed freshness
 * still gets to keep its geometry, because "directly above the list" is true
 * whether or not the placeholder is still showing — and a system that threw the
 * whole sentence away every time one clause expired would be silent most of the
 * time for no reason.
 *
 * What is never partial: an unmounted target, or a target the panel is sitting
 * on top of. Both mean the sentence would be describing something the user
 * cannot act on, and half of that sentence is not better than none.
 */
export function verifyContextualStatement(input: {
  statement: ContextualStatement;
  visibleSemanticIds: readonly string[] | undefined;
  snapshotId: string | undefined;
  route: string | undefined;
  /** Language entries that survived freshness, for the target element. */
  freshTextSnapshotIds: readonly string[];
  textTrust: RuntimeLanguageTrust | 'NONE';
  textPrivacy: 'SAFE' | 'WITHHELD' | 'NOT_APPLICABLE';
  relationProof: 'GEOMETRY' | 'DOCUMENT' | 'NONE';
}): ContextualVerification {
  const { statement } = input;
  const refusals: string[] = [];

  const mounted =
    input.visibleSemanticIds === undefined ||
    input.visibleSemanticIds.includes(statement.targetSemanticId);
  if (!mounted) refusals.push('the target is not on screen in this snapshot');

  // Closed Loop #17 found the panel covering five delete buttons while the DOM
  // reported them visible. Describing where something is, to somebody who
  // cannot see it because of us, is worse than saying nothing.
  if (statement.occludedByGuide) {
    refusals.push('the guide panel is covering the target');
  }

  let visibleText = statement.visibleText;
  let textSource: ContextualReceipt['textSource'] = 'NONE';
  let textTrust: ContextualReceipt['textTrust'] = 'NONE';
  let freshness: ContextualReceipt['freshness'] = 'NOT_APPLICABLE';
  let privacy: ContextualReceipt['privacy'] = 'SAFE';

  if (visibleText !== undefined) {
    textSource = visibleText.sourceKind;
    textTrust = input.textTrust;
    freshness =
      input.snapshotId !== undefined && !input.freshTextSnapshotIds.includes(input.snapshotId)
        ? 'STALE'
        : 'CURRENT_SNAPSHOT';
    privacy = input.textPrivacy === 'WITHHELD' ? 'WITHHELD' : 'SAFE';

    if (input.textTrust !== 'HOST_UI') {
      refusals.push(`${visibleText.sourceKind} is content rather than interface chrome`);
      visibleText = undefined;
    } else if (freshness === 'STALE') {
      refusals.push('the text was read from a different snapshot');
      visibleText = undefined;
    } else if (privacy === 'WITHHELD') {
      refusals.push('the text is not repeatable');
      visibleText = undefined;
    } else if (visibleText.form !== 'SHOWING') {
      refusals.push('only a showing-form descriptor is authorised');
      visibleText = undefined;
    }
  }

  let relation = statement.relation;
  if (relation !== undefined && input.relationProof === 'NONE') {
    refusals.push('nothing proved the spatial relation');
    relation = undefined;
  }
  if (relation !== undefined && relation.kind === 'inside' && input.relationProof !== 'DOCUMENT') {
    refusals.push('containment was claimed by coordinates rather than by the document');
    relation = undefined;
  }

  const receipt: ContextualReceipt = {
    statementId: statementIdOf(statement),
    verified:
      mounted &&
      !statement.occludedByGuide &&
      (relation !== undefined || visibleText !== undefined),
    relation:
      relation === undefined
        ? 'ABSENT'
        : input.relationProof === 'DOCUMENT'
          ? 'PROVED_BY_DOCUMENT'
          : 'PROVED_BY_GEOMETRY',
    target: mounted ? 'MOUNTED' : 'ABSENT',
    textSource,
    textTrust,
    freshness,
    route: input.route === undefined ? 'UNKNOWN' : 'MATCHED',
    privacy,
    regionPhraseAuthority: relation?.regionAuthority ?? 'ABSENT',
    occlusion: statement.occludedByGuide ? 'COVERED_BY_GUIDE' : 'CLEAR',
    refusals,
  };

  if (!receipt.verified) return { receipt };
  return {
    receipt,
    statement: {
      ...statement,
      ...(relation === undefined ? {} : { relation }),
      ...(visibleText === undefined ? {} : { visibleText }),
    },
  };
}

/** The two phrasings this loop compares. */
export type ContextualSentenceForm = 'GEOMETRY_ONLY' | 'WITH_VISIBLE_TEXT';

/**
 * How a relation reads in a sentence.
 *
 * `directly` earns its place when the location is the only thing identifying
 * the target — "it is directly above the list" is doing all the work. Once the
 * sentence already says which control it means, the intensifier is noise, so
 * the descriptor form drops it. Both are equally true of the same two
 * rectangles.
 */
function relationWords(kind: ContextualRelation, emphatic: boolean): string {
  switch (kind) {
    case 'above':
      return emphatic ? 'directly above' : 'above';
    case 'below':
      return emphatic ? 'directly below' : 'below';
    case 'inside':
      return 'inside';
    default:
      return kind.replace('-', ' ');
  }
}

/**
 * The sentence itself, composed here rather than in a renderer.
 *
 * Closed Loop #17 built this string in the panel, which is how it ended up as
 * the one user-facing sentence nothing could check. Composing it beside the
 * verifier means the phrasing rules — *showing*, never *named*; a noun the
 * runtime reported, never one invented — are testable in the same place they are
 * enforced.
 */
export function renderContextualSentence(
  statement: ContextualStatement,
  form: ContextualSentenceForm,
): string | undefined {
  const relation = statement.relation;
  const emphatic = (words: boolean) =>
    relation === undefined
      ? undefined
      : `${relationWords(relation.kind, words)} ${relation.regionPhrase}`;

  if (form === 'GEOMETRY_ONLY') {
    const where = emphatic(true);
    return where === undefined ? undefined : `On this screen, it is ${where}.`;
  }

  const showing = statement.visibleText;
  if (showing === undefined) {
    const where = emphatic(true);
    return where === undefined ? undefined : `On this screen, it is ${where}.`;
  }
  const where = emphatic(false);

  // `showing`, never `named`. The difference is the whole authority rule: one
  // describes what a person can read at this moment, the other asserts an
  // identity the ProductModel has not given.
  const described = `the ${statement.targetNoun} showing "${showing.text}"`;
  return where === undefined ? `Use ${described}.` : `Use ${described} ${where}.`;
}
