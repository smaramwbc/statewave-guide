/**
 * The one place a capability's meaning is defined.
 *
 * Closed Loop #10 shipped the same rule twice — the runtime verifier and the
 * semantic integration table each hand-wrote what `select` requires, both wrote
 * *"a route change is enough"*, and between them they put **"Lets you select an
 * invoice."** in front of a reviewer about a control that navigates to a client.
 * Tightening it meant finding and editing both. `MECHANISM_ACTIONS` had the same
 * shape and produced the same class of contradiction in the same loop.
 *
 * Two hand-written tables answering one semantic question will diverge. Not
 * might: the project has now watched it happen twice in one loop. So the
 * question is answered here, once, and every consumer derives from it —
 * the runtime verifier, the ProductModel integration layer, and the consistency
 * gate that fails if either grows a private opinion.
 *
 * This module is **declarative on purpose**. It names the evidence a capability
 * needs; it does not observe, interpret, or phrase anything. It lives in
 * `shared` because both the runtime and semantic packages depend on this one and
 * neither depends on the other — which is the structural reason the duplication
 * happened in the first place.
 *
 * @packageDocumentation
 */

/**
 * Every difference the runtime is able to observe.
 *
 * Names, not meanings. `ELEMENT_APPEARED` says an element that was absent is now
 * present; whether that constitutes *revealing* something is a verifier's
 * judgement, made below, never the observer's.
 */
export type ObservedEffectKind =
  | 'ROUTE_CHANGED'
  | 'ELEMENT_APPEARED'
  | 'ELEMENT_DISAPPEARED'
  | 'REGION_APPEARED'
  | 'REGION_DISAPPEARED'
  | 'COLLECTION_MEMBERS_CHANGED'
  | 'SELECTION_CHANGED'
  | 'CONTROL_ENABLED'
  | 'CONTROL_DISABLED'
  | 'VALUE_CHANGED'
  | 'NETWORK_REQUEST';

/** How a person interacted. The verb of any sentence about a trace. */
export type InteractionActionKind = 'click' | 'type' | 'select' | 'submit' | 'hover' | 'keypress';

/**
 * Whether an effect is a plain difference or already an interpretation.
 *
 * Everything the observer emits must be `observation`. The distinction is
 * recorded so it can be asserted: an effect kind that starts meaning something
 * has moved a decision out of the verifier, where it is reviewable, and into
 * the diff, where it is not.
 */
export type EffectSemantics = 'observation' | 'interpretation';

/** What each effect kind is, and whether a capability may rest on it. */
export interface EffectDefinition {
  kind: ObservedEffectKind;
  semantics: EffectSemantics;
  /** Whether a verification rule is allowed to name it. */
  eligibleForVerification: boolean;
  /** What the observer means by it, in one sentence. */
  meaning: string;
}

/**
 * The effect taxonomy.
 *
 * `COLLECTION_MEMBERS_CHANGED` and `SELECTION_CHANGED` are the two entries
 * Closed Loop #11 made honest. The first was `COLLECTION_CHANGED` and counted
 * the children of *any* container carrying a semantic id, so a page `<section>`
 * gaining a dialog was reported as a collection changing size. The second did
 * not exist at all, and `select` was left inferring selection from membership —
 * two different state dimensions, one of which was standing in for the other.
 */
export const EFFECT_TAXONOMY: readonly EffectDefinition[] = [
  {
    kind: 'ROUTE_CHANGED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning: 'The application reported a different route after the interaction than before it.',
  },
  {
    kind: 'ELEMENT_APPEARED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning: 'An element carrying a semantic id was absent before and present after.',
  },
  {
    kind: 'ELEMENT_DISAPPEARED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning: 'An element carrying a semantic id was present before and absent after.',
  },
  {
    kind: 'REGION_APPEARED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning: 'A landmark or structural region was rendered that was not rendered before.',
  },
  {
    kind: 'REGION_DISAPPEARED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning: 'A landmark or structural region that was rendered before is no longer rendered.',
  },
  {
    kind: 'COLLECTION_MEMBERS_CHANGED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning:
      'A container of a recognised collection type kept its identity across the interaction, and the set of members of the type that collection holds changed.',
  },
  {
    kind: 'SELECTION_CHANGED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning:
      'An element inside a recognised collection changed its declared selection state, or the collection changed which descendant it declares active.',
  },
  {
    kind: 'CONTROL_ENABLED',
    semantics: 'observation',
    eligibleForVerification: false,
    meaning: 'A control that reported itself disabled no longer does.',
  },
  {
    kind: 'CONTROL_DISABLED',
    semantics: 'observation',
    eligibleForVerification: false,
    meaning: 'A control that did not report itself disabled now does.',
  },
  {
    kind: 'VALUE_CHANGED',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning: "A control's value shape differs. The value itself is never recorded.",
  },
  {
    kind: 'NETWORK_REQUEST',
    semantics: 'observation',
    eligibleForVerification: true,
    meaning:
      'A request began inside the interaction window, with its method, path and status class.',
  },
];

/**
 * Container roles that hold a collection.
 *
 * A collection is a *typed* thing an application declares, not any element that
 * happens to have children. `section`, `form`, `dialog`, `region` and `div` are
 * absent deliberately and must stay absent: the whole defect this list exists to
 * close is a `<section>` being counted because a dialog opened inside it.
 */
export const COLLECTION_ROLES: readonly string[] = [
  'table',
  'grid',
  'list',
  'listbox',
  'tree',
  'treegrid',
  'menu',
  'menubar',
  'radiogroup',
  'tablist',
  'rowgroup',
];

/**
 * What counts as a member, per collection role.
 *
 * Membership is typed too. A `<table>` gaining a caption is not a table gaining
 * a row, and counting arbitrary descendants is how a member count stops meaning
 * anything. A role absent from this map cannot report membership at all.
 */
export const COLLECTION_MEMBER_ROLES: Readonly<Record<string, readonly string[]>> = {
  table: ['row'],
  grid: ['row'],
  treegrid: ['row'],
  rowgroup: ['row'],
  list: ['listitem'],
  listbox: ['option'],
  tree: ['treeitem'],
  menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  menubar: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  radiogroup: ['radio'],
  tablist: ['tab'],
};

/** Roles whose declared selection state is meaningful. */
export const SELECTABLE_MEMBER_ROLES: readonly string[] = [
  'row',
  'option',
  'treeitem',
  'tab',
  'radio',
  'menuitemcheckbox',
  'menuitemradio',
  'listitem',
];

/** Whether a role names a collection this system will count members of. */
export function isCollectionRole(role: string): boolean {
  return COLLECTION_ROLES.includes(role);
}

/** The member roles a collection role admits, or none if it is not a collection. */
export function memberRolesFor(role: string): readonly string[] {
  return COLLECTION_MEMBER_ROLES[role] ?? [];
}

/** One capability, defined once. */
export interface CapabilityDefinition {
  kind: string;
  /** Effect kinds that must all be present. */
  requires: readonly ObservedEffectKind[];
  /** Effect kinds whose presence refuses the capability outright. */
  refusedWhen: readonly ObservedEffectKind[];
  /**
   * Interaction kinds the capability may be claimed from.
   *
   * Empty means any. `filter` is restricted to input changes because activating
   * a control that happens to change a list is not filtering, and `select` is
   * restricted for the same reason in the other direction.
   */
  actionKinds: readonly InteractionActionKind[];
  /** What a reader should understand the rule to require. */
  requirement: string;
  /** Whether an accepted claim of this kind may enter the ProductModel. */
  integrable: boolean;
  /** The named refusal when `requires` is unmet. */
  refusal: string;
  /** The named refusal when a `refusedWhen` effect is present. */
  refusalWhenExcluded: string;
}

/**
 * Every capability the runtime can verify, defined once.
 *
 * A capability absent from this registry cannot be verified and cannot be
 * integrated. There is no default branch anywhere downstream, and the
 * consistency gate fails if a consumer invents one.
 */
export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  {
    kind: 'navigate',
    requires: ['ROUTE_CHANGED'],
    refusedWhen: [],
    actionKinds: [],
    requirement: 'a route transition inside the interaction window',
    integrable: true,
    refusal: 'NO_ROUTE_TRANSITION',
    refusalWhenExcluded: 'NO_ROUTE_TRANSITION',
  },
  {
    kind: 'open',
    requires: ['REGION_APPEARED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: [],
    requirement: 'a region that became visible, with the user still on the same screen',
    integrable: true,
    refusal: 'NOTHING_APPEARED',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
  {
    kind: 'reveal',
    requires: ['ELEMENT_APPEARED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: [],
    requirement: 'an element absent before the interaction and present after, with no navigation',
    integrable: true,
    refusal: 'NOTHING_APPEARED',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
  {
    kind: 'hide',
    requires: ['ELEMENT_DISAPPEARED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: [],
    requirement: 'an element present before the interaction and absent after, with no navigation',
    integrable: false,
    refusal: 'NOTHING_DISAPPEARED',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
  {
    kind: 'filter',
    requires: ['COLLECTION_MEMBERS_CHANGED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: ['type', 'select'],
    requirement:
      'the member set of a surviving typed collection changed after an input changed, with no navigation to explain the replacement',
    integrable: true,
    refusal: 'COLLECTION_UNCHANGED',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
  {
    kind: 'select',
    requires: ['SELECTION_CHANGED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: [],
    requirement:
      'a member of a recognised collection declared itself selected when it had not before, with the user still on the same screen',
    integrable: true,
    refusal: 'NO_SELECTION_EFFECT',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
  {
    kind: 'clear_selection',
    requires: ['SELECTION_CHANGED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: [],
    requirement:
      'a member that declared itself selected before the interaction declares itself unselected after, with nothing selected in its place',
    integrable: false,
    refusal: 'NO_SELECTION_CHANGE',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
  {
    kind: 'create',
    requires: ['NETWORK_REQUEST'],
    refusedWhen: [],
    actionKinds: [],
    requirement: 'a POST request that succeeded inside the interaction window',
    integrable: true,
    refusal: 'NO_WRITE_OBSERVED',
    refusalWhenExcluded: 'NO_WRITE_OBSERVED',
  },
  {
    kind: 'update',
    requires: ['NETWORK_REQUEST'],
    refusedWhen: [],
    actionKinds: [],
    requirement: 'a PUT or PATCH request that succeeded inside the interaction window',
    integrable: true,
    refusal: 'NO_WRITE_OBSERVED',
    refusalWhenExcluded: 'NO_WRITE_OBSERVED',
  },
  {
    kind: 'delete',
    requires: ['NETWORK_REQUEST'],
    refusedWhen: [],
    actionKinds: [],
    requirement: 'a DELETE request that succeeded inside the interaction window',
    integrable: true,
    refusal: 'NO_WRITE_OBSERVED',
    refusalWhenExcluded: 'NO_WRITE_OBSERVED',
  },
  {
    kind: 'submit',
    requires: ['NETWORK_REQUEST'],
    refusedWhen: [],
    actionKinds: ['submit'],
    requirement: 'a submit interaction that produced a request',
    integrable: false,
    refusal: 'NO_SUBMISSION_OBSERVED',
    refusalWhenExcluded: 'NO_SUBMISSION_OBSERVED',
  },
  {
    kind: 'view',
    requires: ['ELEMENT_APPEARED'],
    refusedWhen: ['ROUTE_CHANGED'],
    actionKinds: [],
    requirement: 'content that became visible without leaving the screen',
    integrable: false,
    refusal: 'NOTHING_APPEARED',
    refusalWhenExcluded: 'NAVIGATION_OCCURRED',
  },
];

/** The definition for a capability kind, or nothing if it has none. */
export function capabilityDefinition(kind: string): CapabilityDefinition | undefined {
  return CAPABILITY_REGISTRY.find((entry) => entry.kind === kind);
}

/** Capability kinds a verified claim may be integrated into the ProductModel from. */
export function integrableCapabilities(): readonly string[] {
  return CAPABILITY_REGISTRY.filter((entry) => entry.integrable).map((entry) => entry.kind);
}

/** The definition for an effect kind. */
export function effectDefinition(kind: string): EffectDefinition | undefined {
  return EFFECT_TAXONOMY.find((entry) => entry.kind === kind);
}
