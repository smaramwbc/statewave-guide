/**
 * The Product Model: what the application *means*, as opposed to what it *is*.
 *
 * The ApplicationGraph is the technical layer — nodes, relationships, evidence,
 * all derived deterministically from source. This is the layer above it, and the
 * relationship between them is the whole design:
 *
 * > Code determines what exists. AI may explain what verified facts mean.
 *
 * Nothing here is authoritative. Every semantic claim carries {@link SemanticEvidence}
 * pointing back at the graph facts that support it, and a claim that cannot point
 * at anything is not persisted as product truth — it is recorded as rejected.
 *
 * Two rules follow from that and are enforced elsewhere in the pipeline:
 *
 * 1. A model may not invent a graph reference. Every id it emits is checked
 *    against the graph, and an unknown id fails the whole claim.
 * 2. A model does not get to state its own confidence. {@link ProductFeature.confidence}
 *    is *computed* from how much of the feature survived verification, because a
 *    number a model chose for itself measures nothing.
 *
 * @packageDocumentation
 */

/**
 * A pointer from a semantic claim back to the technical fact that supports it.
 *
 * `ref` is a canonical ApplicationGraph identifier: a node id such as
 * `element:clients.create`, or a relationship id of the form
 * `source|type|target`.
 */
export interface SemanticEvidence {
  /** Canonical graph identifier, or a serialised observed effect. */
  ref: string;
  /**
   * Where the evidence came from.
   *
   * `node` and `relationship` point into the ApplicationGraph and are true of
   * the source. `runtime`, added by Closed Loop #10, is an effect a browser was
   * watched producing — true of one run of one build against one seeded data
   * set. They share an array and must never share a label: the moment a reader
   * cannot tell "the graph proves this" from "a browser once did this", the two
   * have collapsed into one kind of evidence, and only one of them deserves the
   * weight.
   */
  kind: 'node' | 'relationship' | 'runtime';
  /** Provenance carried forward so a reader can open the file. */
  file?: string;
  line?: number;
}

/** Who produced a semantic claim. */
export interface GeneratorAttribution {
  /** Adapter name, e.g. `mock` or `anthropic`. */
  provider: string;
  /** Model identifier the provider used. */
  model: string;
  /** Version of the enrichment pipeline. */
  version?: string;
}

/**
 * The claim taxonomy.
 *
 * Deliberately small. Each member exists because it can be *checked* in a
 * specific way, not because it seemed like a useful category — a type nobody
 * can verify differently from another type is not a type, it is a label.
 *
 * The split that matters is between the first five and the last three.
 */
export type ProductClaimType =
  // --- Factual claims: assert something about the application ---------------
  /** The application can do something. Requires a capability path in the graph. */
  | 'capability'
  /** Somewhere in the application is reachable from somewhere else. */
  | 'navigation'
  /** One step of a workflow. Must point at addressable nodes. */
  | 'workflow_step'
  /** Something requires a permission. */
  | 'permission'
  /** Something is limited or required. Needs schema, test or graph evidence. */
  | 'constraint'
  // --- Language claims: interpret facts for a reader ------------------------
  /** Why someone would use this. Interpretation, not a fact. */
  | 'purpose'
  /** An alternative phrase for the same thing. Interpretation. */
  | 'synonym'
  /** A question this feature answers. Interpretation. */
  | 'user_question';

/**
 * Claim types that assert something about the application.
 *
 * These are checked structurally against the graph and can be *wrong* in a way
 * that matters. Everything else is language.
 */
export const FACTUAL_CLAIM_TYPES = [
  'capability',
  'navigation',
  'workflow_step',
  'permission',
  'constraint',
] as const satisfies readonly ProductClaimType[];

/**
 * Claim types that interpret facts rather than assert them.
 *
 * A bad `purpose` is unhelpful; a bad `capability` is a lie about the product.
 * They are never presented as structurally verified, and the distinction is
 * carried in {@link ProductClaim.status} rather than left to a reader to infer.
 */
export const LANGUAGE_CLAIM_TYPES = [
  'purpose',
  'synonym',
  'user_question',
] as const satisfies readonly ProductClaimType[];

/** True for a claim type that asserts an application fact. */
export function isFactualClaimType(type: ProductClaimType): boolean {
  return (FACTUAL_CLAIM_TYPES as readonly ProductClaimType[]).includes(type);
}

/**
 * The verbs a capability claim may assert.
 *
 * A closed set, because each one implies a *different* shape of supporting
 * evidence: `create` wants a write endpoint or a form, `delete` wants a DELETE
 * endpoint, `view` wants a route or a table. An open verb list would mean an
 * unbounded set of things the verifier has no rule for.
 */
export type CapabilityAction =
  | 'create'
  | 'view'
  | 'update'
  | 'delete'
  | 'submit'
  | 'navigate'
  | 'search'
  | 'export'
  | 'import'
  | 'send'
  // Behaviour a running application demonstrated, added by Closed Loop #10.
  // Each is here because an interaction with the fixture produced the effect its
  // rule requires — none in anticipation. `filter` is what a text box provably
  // does when a visible collection narrows and the route does not change, and it
  // is deliberately not `search`: nothing observed says where the narrowing
  // happened. `reveal` is a target absent before and present after, and asserts
  // nothing about how its contents came to be.
  | 'filter'
  | 'reveal'
  | 'open'
  | 'select';

/**
 * The machine-checkable payload of a factual claim.
 *
 * This is the change that narrows the hallucination space. Rather than checking
 * an English sentence for suspicious words — which cannot work in general — the
 * model is required to state *what it is asserting* in fields, and the verifier
 * checks the assertion against the graph.
 *
 * "Clients can be imported from CSV" is not rejected because it contains the
 * word CSV. It is rejected because it decomposes to
 * `{ subject: 'clients', action: 'import' }` and no import path exists.
 */
export interface ClaimAssertion {
  /**
   * What the claim is about, as a **typed reference to a known identity**.
   *
   * Either `feature:<featureId>` naming a candidate the pipeline itself
   * proposed, or a canonical ApplicationGraph node id. Never free text.
   *
   * This is the difference between a model *describing* a subject and a model
   * *inventing* one. Given a free-form string a model can assert something about
   * "the client import module"; given a reference it must name something that
   * already exists, and a reference that resolves to nothing is rejected with
   * {@link SemanticRejectionReason} `UNKNOWN_SUBJECT`.
   */
  subjectRef: string;
  /**
   * How the subject reads to a person.
   *
   * Free text, and deliberately powerless: it is rendered, never resolved. The
   * identity is `subjectRef`.
   */
  subjectLabel?: string;
  /** The verb, for a capability claim. */
  action?: CapabilityAction;
  /** A route path, for a navigation claim. */
  route?: string;
  /** A permission string, for a permission claim. */
  permission?: string;
  /**
   * Graph ids that must support the assertion.
   *
   * Never empty on a factual claim. The verifier checks both that these exist
   * and that they are the *right kind* of evidence for the claim's type.
   */
  targets: string[];
}

/** Why a claim was refused. */
export type SemanticRejectionReason =
  /** The claim cited no graph facts at all. */
  | 'NO_SUPPORTING_EVIDENCE'
  /** The claim cited a graph id that does not exist. */
  | 'UNKNOWN_GRAPH_REFERENCE'
  /** The claim named a route the graph does not contain. */
  /**
   * The subject is a real identity, and the wrong one for this feature.
   *
   * Never `UNKNOWN_SUBJECT`: that reason means "no such thing", and saying it
   * about something that demonstrably exists teaches a reader nothing and sends
   * them looking for a typo. This claim's problem is ownership, not existence —
   * `element:settings.form` really is a form and really does submit, but a
   * claim filed under `settings.new-key` would be read as being about the key.
   */
  | 'SUBJECT_OUT_OF_SCOPE'
  /**
   * A cited fact is real, is in this feature's evidence, and belongs to another
   * feature.
   *
   * Pack membership means a fact was *shown* to the model — a pack is a
   * neighbourhood, deliberately, so the model can see what a feature is not.
   * It has never meant the fact is this feature's.
   */
  | 'TARGET_OUT_OF_SCOPE'
  | 'UNKNOWN_ROUTE'
  /** The claim named a permission the graph does not contain. */
  | 'UNKNOWN_PERMISSION'
  /** The claim named an endpoint the graph does not contain. */
  | 'UNKNOWN_ENDPOINT'
  /** A workflow step pointed at nothing addressable. */
  | 'UNSUPPORTED_WORKFLOW_STEP'
  /** The model altered a feature id that came from a semantic identifier. */
  | 'FEATURE_ID_CHANGED'
  /** The claim asserts something the graph structure contradicts. */
  | 'CONTRADICTS_GRAPH'
  /**
   * The evidence exists but does not support *this kind* of assertion.
   *
   * The workhorse of the structured layer: a DELETE endpoint is real evidence,
   * and it still does not support "deleting a client archives it".
   */
  | 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM'
  /** The claim's `subjectRef` does not resolve to a known feature or graph node. */
  | 'UNKNOWN_SUBJECT'
  /**
   * The verifier has no rule for this assertion, so it cannot be verified.
   *
   * Distinct from "we checked and it is false". This says we did not check,
   * which is why it fails closed rather than passing by default.
   */
  | 'UNSUPPORTED_CLAIM_RULE'
  /** A capability was asserted with no path in the graph that performs it. */
  | 'UNSUPPORTED_CAPABILITY'
  /** A constraint was asserted with no schema, test or graph basis. */
  | 'UNSUPPORTED_CONSTRAINT'
  /** The response did not satisfy its schema. */
  | 'SCHEMA_VIOLATION';

/**
 * How a factual assertion resolved against the verification matrix.
 *
 * Every factual claim must land on exactly one of these. There is deliberately
 * no fourth "accepted because it had targets" outcome — a generic fallback is
 * how a verifier stops verifying anything.
 */
export type ClaimVerificationOutcome =
  /** A rule exists for this assertion and the graph satisfies it. */
  | 'SUPPORTED_VERIFICATION_RULE'
  /**
   * The assertion is well-formed, but no verifier knows how to check it.
   * Fails closed: it never becomes `structurally_verified`.
   */
  | 'EXPLICITLY_UNSUPPORTED'
  /** A rule exists and the graph does not satisfy it. */
  | 'REJECTED_INVALID';

/**
 * What verification established about a claim.
 *
 * Three states, not two, because "we checked this against the graph" and "this
 * is a sentence we allowed through" are different guarantees and collapsing them
 * would be the single most misleading thing this model could do.
 */
export type ProductClaimStatus =
  /**
   * A factual claim whose assertion was checked against the graph and holds.
   * The strong guarantee.
   */
  | 'structurally_verified'
  /**
   * A factual claim whose assertion was checked against an *observed* run and
   * holds.
   *
   * Deliberately not folded into `structurally_verified`, because the two are
   * different guarantees and saying so is the whole point. Structural
   * verification is a proof about the program: it holds for every run, and it
   * holds because the code cannot do otherwise. Behavioural verification is a
   * report about one run under a known `RuntimeContext` — this route, these
   * permissions, this fixture state — and generalising it is exactly the error
   * that would make it worthless.
   *
   * Both are *verified*, and consumers that mean "verified" should say so
   * through {@link isVerifiedClaim} rather than by naming one of them. What a
   * consumer may not do is print "structurally verified" over something a
   * browser was watching.
   */
  | 'behaviorally_verified'
  /**
   * A language claim that references only real evidence and contradicts nothing.
   * It is *grounded*, not proven — no claim is made that the sentence is true,
   * only that it is attached to facts that exist.
   */
  | 'semantically_grounded'
  /** Refused. Persisted anyway, so the refusal stays visible. */
  | 'rejected';

/**
 * Whether a claim's assertion was checked and held, by either route.
 *
 * The predicate exists so that "was this verified?" has one answer in one place.
 * Before Closed Loop #10 the question was spelled `status === 'structurally_verified'`
 * in thirty-five places, and adding a second kind of verification by editing
 * thirty-five comparisons is how one of them gets missed.
 */
export function isVerifiedClaim(claim: Pick<ProductClaim, 'status'>): boolean {
  return claim.status === 'structurally_verified' || claim.status === 'behaviorally_verified';
}

/**
 * One atomic piece of generated product knowledge.
 *
 * Knowledge is broken into claims rather than kept as one generated document so
 * a single assertion can be superseded, re-verified or retracted without
 * discarding everything else. See
 * `docs/adr/0009-semantic-knowledge-is-claim-based.md`.
 */
export interface ProductClaim {
  /** Deterministic id: `${featureId}#${type}:${ordinal}`. Never random. */
  id: string;
  featureId: string;
  type: ProductClaimType;
  /**
   * The generated language.
   *
   * For a factual claim this is a *rendering* of {@link assertion}, not the
   * claim itself. The assertion is what was verified; the text is what a person
   * reads.
   */
  text: string;
  /** Present on every factual claim, absent on language claims. */
  assertion?: ClaimAssertion;
  /** Graph facts supporting it. */
  evidence: SemanticEvidence[];
  status: ProductClaimStatus;
  /** How the assertion resolved. Absent on language claims. */
  outcome?: ClaimVerificationOutcome;
  /** Present when `status` is `rejected`. */
  rejection?: { reason: SemanticRejectionReason; detail: string };
  /**
   * The conditions a behavioural claim was observed under.
   *
   * Present exactly when `status` is `behaviorally_verified`. A run establishes
   * what happened on *one* screen, with *one* set of permissions, against *one*
   * seeded data set — and a claim that forgets which is a claim that reads as
   * universal. "You can delete a client", observed as an administrator, is a
   * fact about administrators.
   *
   * Structural rather than imported: the runtime package depends on this one.
   */
  runtimeContext?: {
    route: string;
    fixtureState: string;
    permissions: readonly string[];
    featureFlags: Readonly<Record<string, boolean>>;
  };
  /** The interaction trace a behavioural claim came from, so it can be re-run. */
  runtimeTraceId?: string;
  /**
   * What this claim was true *of*.
   *
   * Enough for a durable store to supersede one claim when the graph changes,
   * rather than replacing a whole generated manual. Deliberately not shaped to
   * any particular memory API — it records the facts a supersession decision
   * needs, and nothing about how that decision is made.
   */
  provenance: ClaimProvenance;
  generatedBy?: GeneratorAttribution;
}

/** The version of the world a claim was made about. */
export interface ClaimProvenance {
  /** Hash of the ApplicationGraph the claim was derived from. */
  graphHash: string;
  /** Version of the analysed application, when known. */
  applicationVersion?: string;
  /** Git commit of the analysed application, when known. */
  commit?: string;
  /**
   * Fingerprint of just this claim's supporting facts.
   *
   * A change here means this claim specifically is stale, even when the rest of
   * the feature is untouched.
   */
  dependencyFingerprint: string;
}

/** One step of a workflow. Must point at something addressable. */
export interface ProductWorkflowStep {
  /** 1-based position. */
  index: number;
  /** What the user does, in their language. */
  text: string;
  /**
   * Graph ids this step refers to — typically an element or a component.
   *
   * Never empty in an accepted workflow. A step a user cannot be pointed at is
   * a sentence, not an instruction.
   */
  targets: string[];
  evidence: SemanticEvidence[];
}

/** An ordered path through a feature, expressed for a person. */
/**
 * Where a workflow's step order came from.
 *
 * `ownership-path` means the graph proved it: each step sits further along the
 * feature's own behaviour path than the one before, so "first this, then that"
 * is a fact rather than a narrative. `unknown` means the graph does not order
 * these steps, and the renderer must say so.
 *
 * The distinction exists because an invented sequence is worse than an
 * unordered list. A list a reader can scan costs them a moment; an order that
 * is wrong sends them to the wrong control first and teaches them the product
 * works in a way it does not.
 */
export type WorkflowOrderBasis = 'ownership-path' | 'unknown';

export interface ProductWorkflow {
  /** Deterministic id: `${featureId}#workflow`. */
  id: string;
  featureId: string;
  title: string;
  steps: ProductWorkflowStep[];
  /** Whether the graph proved this order, or only supplied the set. */
  orderBasis: WorkflowOrderBasis;
  evidence: SemanticEvidence[];
  generatedBy?: GeneratorAttribution;
}

/** How a feature's identifier was arrived at. */
export type ProductFeatureIdOrigin =
  /** Taken from a `data-guide` semantic identifier. Authoritative; never renamed. */
  | 'semantic-id'
  /** Derived deterministically from stable graph identities. Provisional. */
  | 'derived';

/** A permission, lifted from the graph rather than generated. */
export interface ProductPermission {
  /** The permission string, e.g. `clients:create`. */
  id: string;
  /** Graph ids that require it. */
  requiredBy: string[];
  evidence: SemanticEvidence[];
}

/**
 * One user-facing capability.
 *
 * The unit an end user would name: "creating a client", not "the ClientForm
 * component".
 */
export interface ProductFeature {
  /**
   * Stable identifier.
   *
   * When a `data-guide` semantic id exists it *is* the feature id and a model
   * may not change it. Otherwise it is derived deterministically from graph
   * identities and marked `derived`.
   */
  id: string;
  kind: 'feature';
  /** User-facing name. Generated language. */
  title: string;
  /** What it does, in the user's words. Generated language. */
  description: string;
  /** Why someone would use it. Generated language. */
  purpose?: string;
  /** Graph ids where a user begins — usually elements or routes. */
  entryPoints: string[];
  /** Route paths this feature lives on. Facts, from the graph. */
  routes: string[];
  /** Semantic element ids belonging to it. Facts, from the graph. */
  elements: string[];
  /** Permission strings it requires. Facts, from the graph. */
  permissions: string[];
  /** Ids of workflows belonging to it. */
  workflows: string[];
  /** Ids of related features. */
  relatedFeatures: string[];
  /** Phrasings a user might search for. Language, not facts. */
  questions: string[];
  /** Ids of every claim made about this feature, accepted or rejected. */
  claims: string[];
  /** Graph facts underpinning the feature as a whole. */
  evidence: SemanticEvidence[];
  /**
   * The share of this feature's *factual* claims that were structurally
   * verified, in `[0, 1]`.
   *
   * Computed by the verifier, never supplied by the model. Deliberately scoped
   * to factual claims: mixing language claims into the numerator would let a
   * feature with three verified facts and ten pleasant sentences score higher
   * than one with three verified facts alone, which is backwards.
   *
   * Never read this without {@link ProductFeature.claimSummary}. A single number
   * cannot express "two proven capabilities and one ungrounded description", and
   * pretending otherwise is how mixed quality gets hidden.
   */
  confidence: number;
  /** The full breakdown, so nothing is averaged away. */
  claimSummary: FeatureClaimSummary;
  idOrigin: ProductFeatureIdOrigin;
  /**
   * Hash of the graph facts this feature was derived from.
   *
   * When the hash is unchanged the enrichment can be reused; when it changes the
   * feature is stale. This is what makes incremental regeneration possible.
   */
  dependencyFingerprint: string;
  /** Graph ids the fingerprint was computed over, sorted. */
  dependsOn: string[];
  generatedBy?: GeneratorAttribution;
}

/**
 * A feature's claims, counted by what verification established.
 *
 * Present so a consumer can tell the difference between a feature that is well
 * evidenced and one that is merely well written.
 */
export interface FeatureClaimSummary {
  /** Factual claims the model attempted. */
  factualClaims: number;
  /** Of those, checked against the graph and upheld. */
  structurallyVerified: number;
  /** Of those, refused. */
  factualRejected: number;

  /** Language claims the model attempted. */
  languageClaims: number;
  /** Of those, attached to real evidence. */
  semanticallyGrounded: number;
  /** Of those, refused. */
  languageRejected: number;

  /**
   * Factual claims that failed because no verifier rule exists, by action.
   *
   * Kept separate from ordinary rejections because it means something different:
   * not "the application cannot do this" but "we cannot check whether it can".
   * Collapsing the two would make an unverifiable claim look disproven.
   */
  unsupportedActions: Record<string, number>;
}

/**
 * Where a Product Model came from.
 *
 * Enough to answer "which version of the application does this help describe?".
 */
export interface ProductModelSource {
  /** Git commit of the analysed application, when available. */
  commit?: string;
  /** Version from the analysed application's package.json, when available. */
  applicationVersion?: string;
  /** Hash of the ApplicationGraph this was generated from. */
  graphHash: string;
  /** Version of the enrichment pipeline. */
  generatorVersion: string;
  /** Adapter that produced the semantics. */
  provider: string;
  /** Model identifier. */
  model: string;
  /**
   * ISO 8601 generation time.
   *
   * The one non-deterministic field, and it is deliberately outside every
   * ordering and hash so it cannot make two otherwise-identical models differ.
   */
  generatedAt: string;
}

/** Aggregate outcome of deterministic verification. */
export interface SemanticVerificationSummary {
  featureCandidates: number;
  featuresEnriched: number;
  featuresAccepted: number;
  featuresRejected: number;

  /** Factual claims the model attempted. */
  factualClaimsGenerated: number;
  /** Factual claims whose assertion was checked and upheld. */
  structurallyVerified: number;
  /** Language claims attached to real evidence. */
  semanticallyGrounded: number;
  /** Claims refused, of either kind. */
  claimsRejected: number;

  /**
   * What the structured layer actually stopped, by category.
   *
   * Broken out rather than folded into `rejectionsByReason` because these are
   * the numbers that answer "is this working?" — a pipeline blocking zero
   * unsupported capabilities is either facing an honest model or not checking.
   */
  blocked: {
    unsupportedCapabilities: number;
    unsupportedConstraints: number;
    unsupportedPermissions: number;
    workflowStepsWithoutEvidence: number;
    unknownReferences: number;
  };

  /** Share of accepted claims carrying at least one piece of evidence. */
  evidenceCoverage: number;
  /** Rejected claim counts by reason, sorted by key. */
  rejectionsByReason: Record<string, number>;
}

/**
 * A complete Product Model.
 *
 * Structurally deterministic: every array is sorted by id, so two runs over the
 * same graph produce the same *shape* even when a provider words things
 * differently. Generated prose may vary; ordering may not.
 */
export interface ProductModel {
  version: 2;
  application?: string;
  source: ProductModelSource;
  /** Sorted by id. */
  features: ProductFeature[];
  /** Sorted by id. */
  workflows: ProductWorkflow[];
  /** Sorted by id. Includes rejected claims, so refusals stay visible. */
  claims: ProductClaim[];
  /** Sorted by id. Lifted from the graph, not generated. */
  permissions: ProductPermission[];
  verification: SemanticVerificationSummary;
}
