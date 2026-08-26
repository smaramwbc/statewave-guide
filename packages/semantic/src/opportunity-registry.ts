/**
 * The other half of the extension API: how an application teaches the *planner*
 * a claim it could not have found on its own.
 *
 * `./registry.ts` lets an application prove a claim the built-in matrix cannot
 * judge. This lets it propose one. The two are useless apart: a verifier
 * nothing offers is never exercised, and an opportunity nothing can verify is
 * refused the moment a model accepts it — a worse outcome than never offering
 * it, because the model spends an answer on it and a reader sees a refusal that
 * reads like the model's fault.
 *
 * So a provider must name a `(type, action)` pair that a verifier is also
 * registered for, and this module enforces that at planning time rather than
 * hoping. `import`, `export`, `search` and `send` stay unsupported until an
 * application registers *both* halves, which is the point: nothing here widens
 * what may be claimed generically.
 *
 * The guarantees mirror `./registry.ts` deliberately, because someone reading
 * one should be able to predict the other:
 *
 * 1. **Registration is explicit.** An empty registry means the built-in planner
 *    only. Nothing is discovered or inferred.
 * 2. **A provider cannot bypass scope or evidence.** Its drafts go through the
 *    same {@link ClaimOpportunity} shape and the same verifier probe as the
 *    built-in planner's, so an opportunity citing a sibling's evidence is
 *    dropped exactly as a model's claim would be.
 * 3. **A provider cannot half-configure a pair.** A draft whose `(type, action)`
 *    differs from the pair the provider registered for is discarded. Otherwise
 *    a provider registered for `capability/view` could return `create` drafts
 *    and have them proved by the *built-in* create rule, which is not what
 *    anyone registered.
 *
 * @packageDocumentation
 */

import type { CapabilityAction, ProductClaimType } from '@statewavedev/guide-shared';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import { compareStrings } from './compare.js';
import type { EvidencePack } from './evidence-pack.js';
import type { FeatureScope } from './scope.js';

/** What a provider is given to work from. All of it deterministic. */
export interface ClaimOpportunityContext {
  featureId: string;
  /** What this feature owns, reaches and sits in. A provider may not widen it. */
  scope: FeatureScope;
  /** The facts this feature may be described from. */
  pack: EvidencePack;
  graph: ApplicationGraph;
}

/**
 * One opportunity a provider proposes.
 *
 * Deliberately smaller than {@link ClaimOpportunity}: a provider says what it
 * thinks is provable and about what, and the planner decides whether it is —
 * by asking the verifier, the same way it decides for its own candidates. A
 * provider that could mint a finished opportunity would be a provider that
 * could bypass verification.
 */
export interface ClaimOpportunityDraft {
  subjectRef: string;
  /** Graph ids that would prove it. Checked; never taken on trust. */
  targets: readonly string[];
}

/** A source of opportunities for exactly one `(type, action)` pair. */
export interface ClaimOpportunityProvider {
  type: ProductClaimType;
  /** Only meaningful for `capability`, and matched exactly. */
  action?: CapabilityAction;
  discover(context: ClaimOpportunityContext): readonly ClaimOpportunityDraft[];
}

/** The set of opportunity sources an application has added. */
export interface ClaimOpportunityRegistry {
  /** Adds a provider, replacing any provider already registered for the pair. */
  register(provider: ClaimOpportunityProvider): () => void;
  /** The provider for exactly this pair, if one is registered. */
  find(type: ProductClaimType, action?: CapabilityAction): ClaimOpportunityProvider | undefined;
  /** Every provider, ordered by type then action. */
  list(): ClaimOpportunityProvider[];
}

/** The same key shape as the verifier registry, for the same reason. */
function providerKey(type: ProductClaimType, action?: CapabilityAction): string {
  return `${type} ${action ?? ''}`;
}

interface RegistryEntry {
  token: symbol;
  provider: ClaimOpportunityProvider;
}

/** Creates an empty opportunity registry. Empty means the built-in planner only. */
export function createClaimOpportunityRegistry(): ClaimOpportunityRegistry {
  const entries = new Map<string, RegistryEntry>();

  return {
    register(provider: ClaimOpportunityProvider): () => void {
      // Copied so mutating the caller's object afterwards cannot change which
      // pair this entry answers for. The key is decided once, here.
      const stored: ClaimOpportunityProvider = {
        type: provider.type,
        ...(provider.action === undefined ? {} : { action: provider.action }),
        discover: (context) => provider.discover(context),
      };
      const key = providerKey(stored.type, stored.action);
      const token = Symbol('claim-opportunity-provider');
      entries.set(key, { token, provider: stored });

      return () => {
        if (entries.get(key)?.token === token) entries.delete(key);
      };
    },

    find(type: ProductClaimType, action?: CapabilityAction): ClaimOpportunityProvider | undefined {
      return entries.get(providerKey(type, action))?.provider;
    },

    list(): ClaimOpportunityProvider[] {
      return [...entries.values()]
        .map((entry) => entry.provider)
        .sort(
          (a, b) =>
            compareStrings(a.type, b.type) || compareStrings(a.action ?? '', b.action ?? ''),
        );
    },
  };
}
