/**
 * What a user interface may ask for, and what it gets back.
 *
 * This is the only boundary between an application's UI and everything eleven
 * closed loops built behind it. Nothing on the far side of it — the
 * ApplicationGraph, FeatureScope, claim opportunities, the verifier, the effect
 * taxonomy, the capability registry, vision proposals, the DOM — appears in any
 * type declared here, and that exclusion is the contract's main job. A UI that
 * could reach an ApplicationGraph would eventually interpret one, and product
 * truth would start being decided in a component.
 *
 * Two smaller rules follow from the same idea:
 *
 *   - **Targets are semantic ids and verified routes.** Never a CSS selector, an
 *     XPath, a coordinate, or anything a model produced. A selector is an
 *     instruction to go and find something; a semantic id is a name for
 *     something already known to exist.
 *   - **Actions are a closed set, and none of them changes anything.** Navigate,
 *     highlight, scroll, focus, open a guide step. A guide that can press
 *     buttons is a different product with a different risk profile, and adding
 *     `click` here would mean every sentence in this repository about refusing
 *     to invent behaviour is suddenly load-bearing on someone's data.
 *
 * @packageDocumentation
 */

/** The version of this contract. Present on every response. */
import type { ContextualReceipt } from './contextual.js';
import type { RuntimeVisibleLanguage } from './runtime-language.js';

export const GUIDE_QUERY_CONTRACT_VERSION = 1 as const;

/**
 * What a question is asking for, as an execution category.
 *
 * A closed taxonomy, deliberately. A language model may later decide *which*
 * of these a sentence belongs to — that is classification, and it is the kind
 * of judgement a model is good at. It may not add a seventh, because a new
 * intent is new execution semantics, and execution semantics are not something
 * a model is allowed to invent at runtime.
 */
export type GuideQueryIntent =
  /** "What does this do?" — describe a feature. */
  | 'EXPLAIN'
  /** "How do I …?" — the steps for a task. */
  | 'HOW_TO'
  /** "Where is …?" — locate something. */
  | 'WHERE_IS'
  /** "Why can't I …?" — a condition that is not met. */
  | 'WHY_UNAVAILABLE'
  /** "Show me …" — point at it in the running application. */
  | 'SHOW_ME'
  /** Nothing in the taxonomy fits. */
  | 'UNKNOWN';

export const GUIDE_QUERY_INTENTS: readonly GuideQueryIntent[] = [
  'EXPLAIN',
  'HOW_TO',
  'WHERE_IS',
  'WHY_UNAVAILABLE',
  'SHOW_ME',
  'UNKNOWN',
];

/**
 * One concrete thing on the screen right now.
 *
 * The distinction this type exists to keep: **`invoice` is a product concept and
 * `INV-001` is a runtime instance**, and collapsing them is how a guide starts
 * asserting that a particular row is a particular kind of thing forever. A
 * concept is compiled from verified evidence and lives in the ProductModel. An
 * instance is observed, belongs to one snapshot, and never enters it.
 *
 * Everything here is scoped to the snapshot that produced it. After a
 * navigation, or after the list re-renders, a reference is re-resolved or
 * refused — never approximated to whatever is nearest.
 */
export interface RuntimeInstanceRef {
  /** The semantic id the instance is addressable by, right now. */
  semanticId: string;
  /**
   * A within-snapshot handle, because a name is not identity.
   *
   * Two rows can carry the same accessible name. When they do, the name cannot
   * pick between them, and the contract says so rather than guessing.
   */
  ref: string;
  /** The collection it belongs to, when it belongs to one. */
  containerSemanticId?: string;
  /**
   * What the interface displays for it, when privacy allows showing that.
   *
   * Absent for anything that looks like a secret. Absence removes the *label*,
   * not the addressability: an instance with no displayable name can still be
   * pointed at, it just cannot be offered as a choice.
   */
  runtimeAccessibleName?: string;
  /** The feature that owns its semantic id, when the bundle knows one. */
  ownerFeatureId?: string;
  route: string;
  /** The snapshot this reference belongs to. Comparing it is the freshness test. */
  snapshotId?: string;
}

/**
 * A description of something *on this screen right now*.
 *
 * Not a name. `clients.search` has no supported name and never will until the
 * interface displays one — but a person looking at it can be told where it is,
 * and "the field above the client list" is a true statement about the current
 * layout rather than a claim about the product.
 *
 * Deterministically rendered from geometry and verified relations. A visual
 * model's own sentence never appears here, or anywhere a user reads: the whole
 * point of the taxonomy upstream is that vision emits typed proposals and this
 * layer writes the words.
 *
 * Transient. Valid for the snapshot that produced it and never persisted, never
 * promoted to a title or a synonym.
 */
export interface GuideVisualContext {
  /** Where the target sits, on this screen — a location, not a name. */
  targetDescription?: string;
  /** How to refer to the region it sits in. */
  regionDescription?: string;
  /**
   * The sentence as the guide would say it, in both forms this loop compares.
   *
   * `geometryOnly` is what Closed Loop #17 shipped. `withVisibleText` adds words
   * the interface is currently showing, when a source with descriptor authority
   * supplied them. A host renders one; the review reads both, because the
   * independent review of #17 scored the geometry-only sentence 1.00/3 for
   * helpfulness and 0.63/2 for non-redundancy, and assuming the richer one is
   * better would be repeating the mistake that produced those numbers.
   */
  sentences?: {
    geometryOnly?: string;
    withVisibleText?: string;
  };
  /**
   * What was proved, clause by clause.
   *
   * Present on every contextual sentence that reaches a user. Closed Loop #17
   * disclosed that the location sentence was the only user-facing string no
   * verifier saw; a rendered sentence without a receipt is now a gate failure
   * rather than a footnote.
   */
  receipt?: ContextualReceipt;
}

/** One thing the user may pick, offered from what is on screen. */
export interface GuideRuntimeChoice {
  /** The runtime name, shown as-is. Never decorated into a sentence. */
  label: string;
  instance: RuntimeInstanceRef;
}

/**
 * What the UI knows about where the user currently is.
 *
 * Every field is optional: the contract answers without any of it, less well.
 * Semantic ids only — an application that wanted to pass a selector would be
 * telling this layer to go looking for something, and this layer does not look
 * for things.
 */
export interface GuideQueryContext {
  /** The route the application believes it is on. */
  route?: string;
  /** Identity of the runtime snapshot the other fields came from. */
  snapshotId?: string;
  /** The application build the snapshot came from, for freshness. */
  applicationVersion?: string;
  /** The semantic id of the element the user has focused. */
  focusedSemanticId?: string;
  /** The semantic id the application considers selected. */
  selectedSemanticId?: string;
  /** Semantic ids currently rendered and visible. */
  visibleSemanticIds?: readonly string[];
  /** Semantic ids rendered but disabled. */
  disabledSemanticIds?: readonly string[];
  /**
   * Concrete items observed on screen right now.
   *
   * Supplied by the host from what it is actually rendering. Nothing here is
   * remembered between questions by this layer, and nothing reaches the
   * ProductModel.
   */
  runtimeInstances?: readonly RuntimeInstanceRef[];
  /**
   * Geometry for what is on screen, supplied by the host.
   *
   * Bounding boxes prove "above" and "inside" exactly, so those relations are
   * computed rather than asked of a model. Absent geometry simply means no
   * spatial description is offered.
   */
  elementBoxes?: Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;
  /**
   * What really contains what, from the document rather than from coordinates.
   *
   * A modal dialog overlapping a table is *inside* its rectangle and is not in
   * it. Geometry settles above and below; only this settles inside.
   */
  elementContainers?: Readonly<Record<string, readonly string[]>>;
  /**
   * What kind of thing each element currently is, as the browser reports it.
   *
   * Used only to choose an ordinary noun — "field", "button" — for a sentence
   * about the current screen. It is transient like everything else here and does
   * not describe the product.
   */
  elementRoles?: Readonly<Record<string, string>>;
  /**
   * Elements the guide's own panel is currently sitting on top of.
   *
   * Closed Loop #17 found the panel covering five delete buttons that the DOM
   * still reported as visible. Describing where something is, to somebody who
   * cannot see it because of us, is worse than saying nothing.
   */
  occludedSemanticIds?: readonly string[];
  /**
   * Words the interface is showing right now, with where each came from.
   *
   * Presentation evidence, and nothing else. It never reaches feature
   * resolution: a string on screen cannot change which feature a question is
   * about, or an application could steer the guide by rendering text.
   */
  runtimeVisibleLanguage?: readonly RuntimeVisibleLanguage[];
  /**
   * The instance the user picked, for this interaction only.
   *
   * Session-local: the UI holds it while the conversation is open and it is
   * gone on reload. It is context, in the same sense the route is context — not
   * a fact about the product.
   */
  selectedInstanceRef?: string;
  locale?: string;
}

/** A question, and where it was asked from. */
export interface GuideQueryRequest {
  query: string;
  context?: GuideQueryContext;
  /**
   * Return developer diagnostics alongside the answer.
   *
   * Off by default, and the default is the point: everything a reviewer of this
   * system wants to see — claim ids, propositions, verification reasons — is
   * exactly what a user must never be shown.
   */
  developer?: boolean;
}

/** How much of the question could be answered. */
export type GuideQueryStatus =
  /** Answered from supported guidance. */
  | 'ANSWERED'
  /** Something is known, and less than was asked. */
  | 'PARTIAL'
  /** More than one thing matches, and guessing is not allowed. */
  | 'AMBIGUOUS'
  /** Understood, and nothing verified supports an answer. */
  | 'UNSUPPORTED'
  /** The question is outside the taxonomy. */
  | 'UNKNOWN'
  /** The context supplied does not describe the application as it is now. */
  | 'STALE_CONTEXT';

/**
 * Something a guide may do to a running application.
 *
 * Closed, and everything in it is inert: it moves the user's attention, never
 * the user's data. `click`, `submit`, `create`, `delete` and their relatives are
 * absent by decision rather than by omission.
 *
 * Targets are semantic ids the bundle already knows, or routes already verified.
 */
export type GuideSafeAction =
  | { kind: 'navigate'; route: string; label?: string }
  // `instanceRef` picks *which* of several elements sharing a semantic id is
  // meant. Without it the executor resolves the first match, which after a user
  // chose the second row is confidently the wrong thing — a name is not
  // identity, and neither is a semantic id once a list repeats it.
  | { kind: 'highlight'; semanticId: string; label?: string; instanceRef?: string }
  | { kind: 'scroll'; semanticId: string; label?: string; instanceRef?: string }
  | { kind: 'focus'; semanticId: string; label?: string; instanceRef?: string }
  | { kind: 'open_guide_step'; featureId: string; stepIndex: number; label?: string };

export const GUIDE_SAFE_ACTION_KINDS: readonly GuideSafeAction['kind'][] = [
  'navigate',
  'highlight',
  'scroll',
  'focus',
  'open_guide_step',
];

/** Why a question could not be narrowed to one thing. */
export interface GuideQueryAmbiguity {
  reason: 'NO_TARGET' | 'MULTIPLE_FEATURES' | 'MULTIPLE_TARGETS' | 'NO_SCREEN_NAME';
  /** What the UI may offer, each already resolvable. */
  candidates: readonly { featureId: string; title?: string; semanticId?: string }[];
  /** A sentence a UI may show. Never names anything unsupported. */
  message: string;
}

/** One user-facing instruction. */
export interface GuideAnswerStep {
  text: string;
  /** The control it names, when the interface names one. */
  semanticId?: string;
}

/**
 * A step that was left out, and the context that made it unnecessary.
 *
 * Only entry steps are pruned. `TARGET_ALREADY_VISIBLE` remains in the union for
 * a future informational step and is currently unreachable: Closed Loop #13.1
 * established that a *task* action is never removed because its control happens
 * to be on screen — seeing a button is not the same as having pressed it, and
 * the terminal step of a procedure is the one a user most needs.
 */
export interface GuidePrunedStep {
  text: string;
  reason: 'ROUTE_ALREADY_REACHED' | 'TARGET_ALREADY_VISIBLE' | 'SCREEN_NAME_UNSUPPORTED';
  detail: string;
}

/**
 * What a UI may render.
 *
 * Everything here is either compiled guidance or a semantic identifier the UI
 * needs in order to point at something. No graph ids, no verification reasons,
 * no confidence, no `BEHAVIOR_VERIFIED`, no proposition kinds, no evidence
 * hashes — those live in {@link GuideQueryDiagnostics}, behind a flag.
 */
export interface GuideAnswer {
  /** The feature's supported title, when the interface supplies one. */
  title?: string;
  purpose?: string;
  summary?: string;
  steps: readonly GuideAnswerStep[];
  conditions: readonly string[];
  questions: readonly string[];
}

/** What came back. */
export interface GuideQueryResponse {
  contractVersion: typeof GUIDE_QUERY_CONTRACT_VERSION;
  status: GuideQueryStatus;
  intent: GuideQueryIntent;
  /** The feature this is about, when one was resolved. */
  featureId?: string;
  answer?: GuideAnswer;
  actions: readonly GuideSafeAction[];
  ambiguity?: GuideQueryAmbiguity;
  /**
   * Concrete items the question could be about, offered instead of a guess.
   *
   * Distinct from `ambiguity`, which is about *features* — two controls that
   * both read "Delete". This is about *instances*: two rows that are both
   * things the user might mean. The UI renders them the same way; the contract
   * keeps them apart because one is a question about product structure and the
   * other is about what is on screen.
   */
  runtimeChoices?: readonly GuideRuntimeChoice[];
  /**
   * Where the thing being discussed is, on the screen in front of the user.
   *
   * Presentation only, and only ever additive: removing it changes how an answer
   * reads and never what it asserts.
   */
  visualContext?: GuideVisualContext;
  /** Steps omitted because the context already satisfies them. */
  pruned: readonly GuidePrunedStep[];
  /** Present only when the request asked for it. */
  diagnostics?: GuideQueryDiagnostics;
}

/**
 * The planner's output. Never shown to anybody.
 *
 * Separated from the response so that the question "what did this decide?" and
 * the question "what may a user read?" cannot be answered by the same object.
 */
export interface GuideQueryPlan {
  intent: GuideQueryIntent;
  resolvedFeatureId?: string;
  resolvedSemanticId?: string;
  resolvedRoute?: string;
  context: GuideQueryContext;
  contextFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  ambiguity?: GuideQueryAmbiguity;
  /** How the feature was found. Diagnostic only. */
  resolutionPath?: string;
  /** The concept runtime instances were offered against, when any were. */
  runtimeConcept?: string;
  /** The instance the user chose, re-resolved against the current screen. */
  resolvedInstanceRef?: string;
}

/** Developer-only. Must never reach a user surface. */
export interface GuideQueryDiagnostics {
  plan: GuideQueryPlan;
  /** Why each action exists. */
  actionDerivation: readonly { action: GuideSafeAction; because: string }[];
  /** Guidance surfaces considered and rejected. */
  refusals: readonly { what: string; reason: string }[];
  /** Provenance for each user-facing sentence. */
  provenance: readonly { text: string; featureId: string; source: string }[];
}
