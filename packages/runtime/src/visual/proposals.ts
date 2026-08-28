/**
 * What a visual model is allowed to say, and the shape it must say it in.
 *
 * **Vision proposes. Evidence decides what survives.** A proposal is a
 * hypothesis about how a screen looks to a person; it is never a fact about what
 * the product does. Nothing here can become a `ProductClaim`, a title, a
 * synonym, a safe action, or a sentence a user reads.
 *
 * The taxonomy is closed for the same reason the capability registry is: a
 * free-form field is an invitation to smuggle a claim through as prose, and a
 * type a verifier does not know about is a type nothing checks. A provider that
 * returns something outside this list has its output discarded and the discard
 * recorded.
 *
 * Vision is **orthogonal** to the other evidence classes, not above or below
 * them. There is deliberately no ordering in which a confident visual proposal
 * outranks a runtime observation — the eligibility predicates are unchanged and
 * vision is not one of their inputs.
 *
 * @packageDocumentation
 */

/** Where a piece of evidence came from. Orthogonal classes, never a ladder. */
export type EvidenceClass = 'STATIC' | 'RUNTIME_OBSERVED' | 'RUNTIME_BEHAVIOR' | 'VISUAL_PROPOSAL';

/**
 * The kinds of thing vision may propose.
 *
 * Every one is about *appearance*: how the screen is arranged, what looks
 * grouped, what changed, where attention seems to be. None is about behaviour,
 * capability, permission, or data type — those have owners already.
 */
export type VisualProposalType =
  /** "This looks like a list of clients." */
  | 'SCREEN_PURPOSE'
  /** "This region looks like a toolbar." */
  | 'REGION_PURPOSE'
  /** "These controls appear to belong together." */
  | 'VISUAL_GROUP'
  /** "This control appears to act on that region." */
  | 'CONTROL_RELATION'
  /** "This input appears to belong to that form." */
  | 'FIELD_RELATION'
  /** "These rows appear to be one collection." */
  | 'COLLECTION_RELATION'
  /** "This control appears disabled / selected / expanded." */
  | 'VISIBLE_STATE'
  /** "This part of the screen changed." */
  | 'CHANGE_REGION'
  /** "A user would probably be looking here." */
  | 'USER_ATTENTION'
  /** "A person might call this the client search field." */
  | 'VISUAL_LABEL_CANDIDATE';

export const VISUAL_PROPOSAL_TYPES: readonly VisualProposalType[] = [
  'SCREEN_PURPOSE',
  'REGION_PURPOSE',
  'VISUAL_GROUP',
  'CONTROL_RELATION',
  'FIELD_RELATION',
  'COLLECTION_RELATION',
  'VISIBLE_STATE',
  'CHANGE_REGION',
  'USER_ATTENTION',
  'VISUAL_LABEL_CANDIDATE',
];

/** Where a proposal came from, in enough detail to re-run it. */
export interface VisualProvenance {
  provider: string;
  /** Fixture id or model id. Recorded fixtures name themselves. */
  model: string;
  /** sha256 of the exact image bytes the provider was given, after redaction. */
  screenshotHash: string;
  /** The crop, when the provider saw one. */
  region?: { x: number; y: number; width: number; height: number };
  route: string;
  snapshotId: string;
  /** What was masked before the provider saw anything. */
  redactionManifest: readonly RedactionEntry[];
  /** Semantic ids visible in the frame the provider was given. */
  visibleSemanticIds: readonly string[];
}

/** One thing removed from provider input, and why. */
export interface RedactionEntry {
  semanticId?: string;
  region: { x: number; y: number; width: number; height: number };
  classification: RedactionClass;
  /** What replaced it, when something did. Never the original. */
  placeholder?: string;
}

/**
 * How sensitive a thing is *for provider input*.
 *
 * A stricter question than what a user may see on their own screen. `INV-001` is
 * fine in the guide because the user is looking at it already; sending it to a
 * third party is a different decision with a different answer, and a customer's
 * email is unnecessary for understanding a layout.
 */
export type RedactionClass =
  'SECRET' | 'CREDENTIAL' | 'SENSITIVE_VALUE' | 'PERSONAL_INSTANCE_VALUE' | 'SAFE_UI_LABEL';

/** One hypothesis about how the screen looks. */
export interface TypedVisualProposal {
  id: string;
  type: VisualProposalType;
  /**
   * The model's own words, for developer diagnostics only.
   *
   * Never rendered to a user. Closed Loop #17's language invariant is that the
   * number of provider-authored sentences reaching a person is zero, and the
   * only way to keep that structural is for this field to have exactly one
   * consumer: the inspector.
   */
  statement: string;
  /** Semantic ids the proposal is about, as the provider referenced them. */
  targetSemanticIds: readonly string[];
  /** Diagnostic only. Never an input to any eligibility decision. */
  confidence?: number;
  provenance: VisualProvenance;
}

/** Whether a proposal is one this system knows how to check. */
export function isKnownProposalType(value: string): value is VisualProposalType {
  return (VISUAL_PROPOSAL_TYPES as readonly string[]).includes(value);
}
