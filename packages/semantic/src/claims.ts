/**
 * Deterministic claim construction.
 *
 * The verifier decides *whether* a claim survives; this module decides *what a
 * claim is*, and it does so before any checking happens. Every claim a model
 * returns — the ones that will be upheld and the ones that will be refused —
 * gets an identity here, so a rejection is a claim with a status rather than an
 * absence nobody can audit.
 *
 * Two properties the rest of the pipeline leans on.
 *
 * **Ids are deterministic.** `${featureId}#${type}:${ordinal}`, with the ordinal
 * counted per type in the order the model returned its claims. A stable response
 * over a stable graph produces the same id for the same claim on every machine
 * and in every run, which is what makes superseding a single claim possible
 * later instead of replacing a whole feature. See
 * `docs/adr/0009-semantic-knowledge-is-claim-based.md`.
 *
 * **A rejected claim is still a claim.** It is built with the same id it would
 * have had if it had been upheld, carries the evidence it managed to resolve,
 * and records why it was refused. Dropping it would delete the single most
 * useful signal in the output: what the model tried to say that we would not let
 * it.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode, Relationship } from '@statewavedev/guide-indexer';
import type {
  ClaimAssertion,
  ClaimProvenance,
  FeatureEnrichment,
  GeneratorAttribution,
  ProductClaim,
  ProductClaimStatus,
  ProductClaimType,
  SemanticEvidence,
  SemanticRejectionReason,
} from '@statewavedev/guide-shared';
import { isFactualClaimType, toCapabilityAction } from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';
import { redactSecrets } from './safety.js';

/**
 * Graph lookups, built once per verification pass.
 *
 * Exact-match maps and nothing else. There is no fuzzy resolution here on
 * purpose: an id that differs by case, whitespace or a look-alike character is a
 * different id, and quietly repairing it would hand a model a way to name
 * something it was never shown.
 */
export interface GraphIndex {
  /** Every node, by canonical id. */
  nodes: ReadonlyMap<string, ApplicationNode>;
  /** Every relationship, by `source|type|target` id. */
  relationships: ReadonlyMap<string, Relationship>;
}

/** Builds the exact-match lookups a verification pass needs. */
export function indexGraph(graph: ApplicationGraph): GraphIndex {
  const nodes = new Map<string, ApplicationNode>();
  for (const node of graph.nodes) nodes.set(node.id, node);
  const relationships = new Map<string, Relationship>();
  for (const relationship of graph.relationships) relationships.set(relationship.id, relationship);
  return { nodes, relationships };
}

/**
 * One claim as the model returned it, with its identity already assigned.
 *
 * Identity comes first so that a claim rejected by the very first check has the
 * same id as one that survives every check.
 */
export interface ClaimDraft {
  /** `${featureId}#${type}:${ordinal}`. */
  id: string;
  featureId: string;
  type: ProductClaimType;
  /** The generated sentence, already scrubbed of anything credential-shaped. */
  text: string;
  /** Present on factual claims only. Language claims assert nothing. */
  assertion?: ClaimAssertion;
  /** Graph ids the claim cites, verbatim and in the order they were returned. */
  targets: string[];
  /** 1-based position among claims of this type. */
  ordinal: number;
}

/** The deterministic id of one claim. */
export function claimId(featureId: string, type: ProductClaimType, ordinal: number): string {
  return `${featureId}#${type}:${ordinal}`;
}

/**
 * What verification establishes about a claim of this type when it is upheld.
 *
 * A factual claim that passes was *checked*; a language claim that passes was
 * only *attached to real evidence*. Collapsing the two would be the single most
 * misleading thing this pipeline could do, so the distinction is decided by the
 * claim's type here rather than left to a caller to remember.
 */
export function acceptedStatusFor(type: ProductClaimType): ProductClaimStatus {
  return isFactualClaimType(type) ? 'structurally_verified' : 'semantically_grounded';
}

/**
 * Turns one model response into ordered, identified claim drafts.
 *
 * Factual claims first, then language claims, each in the order the model
 * returned them. Ordinals are counted per type, so a response that gains a
 * `purpose` does not renumber its capabilities.
 *
 * Prose is passed through {@link redactSecrets}: the model was shown repository
 * text, and a sentence that quotes a credential back at us is the one way a
 * scrubbed pack can still leak. `route` and `permission` are deliberately left
 * untouched — they are looked up in the graph verbatim, and a redaction there
 * would turn a real permission into an unverifiable one.
 */
export function draftClaims(featureId: string, enrichment: FeatureEnrichment): ClaimDraft[] {
  const ordinals = new Map<ProductClaimType, number>();
  const nextOrdinal = (type: ProductClaimType): number => {
    const ordinal = (ordinals.get(type) ?? 0) + 1;
    ordinals.set(type, ordinal);
    return ordinal;
  };

  const drafts: ClaimDraft[] = [];

  for (const claim of enrichment.factualClaims) {
    const ordinal = nextOrdinal(claim.type);
    const assertion: ClaimAssertion = {
      subjectRef: claim.subjectRef,
      ...(claim.subjectLabel === undefined
        ? {}
        : { subjectLabel: redactSecrets(claim.subjectLabel) }),
      ...(toCapabilityAction(claim.action) === undefined
        ? {}
        : { action: toCapabilityAction(claim.action) }),
      ...(claim.route === undefined ? {} : { route: claim.route }),
      ...(claim.permission === undefined ? {} : { permission: claim.permission }),
      targets: [...claim.targets],
    };
    drafts.push({
      id: claimId(featureId, claim.type, ordinal),
      featureId,
      type: claim.type,
      text: redactSecrets(claim.text),
      assertion,
      targets: [...claim.targets],
      ordinal,
    });
  }

  for (const claim of enrichment.languageClaims) {
    const ordinal = nextOrdinal(claim.type);
    drafts.push({
      id: claimId(featureId, claim.type, ordinal),
      featureId,
      type: claim.type,
      text: redactSecrets(claim.text),
      targets: [...claim.targets],
      ordinal,
    });
  }

  return drafts;
}

/** The provenance record a relationship's evidence points at, chosen stably. */
function relationshipProvenance(relationship: Relationship): { file?: string; line?: number } {
  let best: { file: string; line: number } | undefined;
  for (const record of relationship.evidence) {
    if (
      best === undefined ||
      compareStrings(record.file, best.file) < 0 ||
      (record.file === best.file && record.line < best.line)
    ) {
      best = { file: record.file, line: record.line };
    }
  }
  return best === undefined ? {} : best;
}

/**
 * Resolves cited ids into evidence pointers.
 *
 * Only ids that resolve are kept: an unknown id is not evidence, and carrying it
 * as though it were would put a reference nobody can open into the output. The
 * claim that cited it is rejected separately — losing the pointer does not lose
 * the refusal.
 *
 * Sorted by `ref` and de-duplicated, because the order a model listed its
 * targets in is arbitrary and the output has to be byte-stable.
 */
export function buildEvidence(targets: readonly string[], index: GraphIndex): SemanticEvidence[] {
  const evidence = new Map<string, SemanticEvidence>();
  for (const ref of targets) {
    if (evidence.has(ref)) continue;
    const node = index.nodes.get(ref);
    if (node !== undefined) {
      const { file, line } = node.provenance;
      evidence.set(ref, {
        ref,
        kind: 'node',
        ...(file === undefined ? {} : { file }),
        ...(line === undefined ? {} : { line }),
      });
      continue;
    }
    const relationship = index.relationships.get(ref);
    if (relationship !== undefined) {
      evidence.set(ref, { ref, kind: 'relationship', ...relationshipProvenance(relationship) });
    }
  }
  return [...evidence.values()].sort((a, b) => compareStrings(a.ref, b.ref));
}

function toClaim(
  draft: ClaimDraft,
  evidence: SemanticEvidence[],
  status: ProductClaimStatus,
  attribution: GeneratorAttribution,
  provenance: ClaimProvenance,
  rejection?: { reason: SemanticRejectionReason; detail: string },
): ProductClaim {
  return {
    id: draft.id,
    featureId: draft.featureId,
    type: draft.type,
    text: draft.text,
    ...(draft.assertion === undefined ? {} : { assertion: draft.assertion }),
    provenance,
    evidence,
    status,
    ...(rejection === undefined ? {} : { rejection }),
    generatedBy: attribution,
  };
}

/** Builds a claim that survived verification. */
export function acceptedClaim(
  draft: ClaimDraft,
  evidence: SemanticEvidence[],
  attribution: GeneratorAttribution,
  provenance: ClaimProvenance,
): ProductClaim {
  return toClaim(draft, evidence, acceptedStatusFor(draft.type), attribution, provenance);
}

/**
 * Builds a claim that was refused.
 *
 * It keeps its id, its text and whatever evidence resolved, so a reader can see
 * exactly what was proposed and exactly why it was not allowed through.
 */
export function rejectedClaim(
  draft: ClaimDraft,
  evidence: SemanticEvidence[],
  reason: SemanticRejectionReason,
  detail: string,
  attribution: GeneratorAttribution,
  provenance: ClaimProvenance,
): ProductClaim {
  return toClaim(draft, evidence, 'rejected', attribution, provenance, { reason, detail });
}
