/**
 * What changed when somebody did something, and whether it changed because of it.
 *
 * An interaction trace is a before, an action, and an after. What it is *not* is
 * an interpretation: the effects below are `ROUTE_CHANGED`, `ELEMENT_APPEARED`,
 * `COLLECTION_CHANGED` — neutral facts about two snapshots — and never
 * `deleted a client`. Naming an effect for what it means is how a dialog that
 * happens to close during a background refresh becomes proof of a save.
 *
 * **Causality is a window, and the window is closed.** An effect counts only if
 * it is visible in the after-snapshot taken immediately following the action,
 * with nothing else driven in between. Round 7's diagnostic is full of shapes
 * that punish looser reasoning — a fixture whose dashboard button resolves to a
 * dynamic handler, a settings service whose HTTP verb is an argument — and
 * "something changed afterwards" would have accepted most of them.
 *
 * **Safety is a property of the action, declared before it runs.** An
 * `OBSERVE_ONLY` harness never dispatches; a `SAFE_PROBE` may click and type
 * against an isolated in-memory backend; a `CONSEQUENTIAL` action is refused
 * outright by this module and has to be arranged deliberately by a caller that
 * has said so.
 *
 * @packageDocumentation
 */

import { isCollectionRole, memberRolesFor } from '@statewavedev/guide-shared';
import type { ObservedElement, RuntimeEvidenceSnapshot } from './snapshot.js';

/** How much an interaction is permitted to disturb. */
export type InteractionSafety = 'OBSERVE_ONLY' | 'SAFE_PROBE' | 'CONSEQUENTIAL';

/** What a user did. */
export type InteractionKind = 'click' | 'type' | 'select' | 'submit' | 'focus';

/** One thing a user did to one control. */
export interface InteractionAction {
  kind: InteractionKind;
  /** The semantic id of the control acted on. */
  targetSemanticId: string;
  safety: InteractionSafety;
  /** For `type` and `select`: the shape of what was entered, never the content. */
  valueShape?: string;
}

/** A neutral difference between two snapshots. Meaning comes later. */
export type ObservedEffect =
  | { kind: 'ROUTE_CHANGED'; from: string; to: string }
  | { kind: 'ELEMENT_APPEARED'; semanticId: string; role: string; name?: string }
  | { kind: 'ELEMENT_DISAPPEARED'; semanticId: string; role: string }
  | { kind: 'REGION_APPEARED'; role: string; semanticId?: string }
  | { kind: 'REGION_DISAPPEARED'; role: string; semanticId?: string }
  /**
   * A typed collection kept its identity and its member set changed.
   *
   * This was `COLLECTION_CHANGED`, and it counted the children of *any* element
   * carrying a semantic id. Clicking "New client" opened a dialog inside the
   * clients `<section>`, the section's child count went 6 to 7, and that was
   * reported as a collection changing size — which the `select` rule was then
   * willing to accept as evidence of a selection. A page region gaining a dialog
   * is not a list growing, and the name now says what is actually required:
   * a recognised collection role, a recognised member role, and a member set
   * that differs.
   */
  | {
      kind: 'COLLECTION_MEMBERS_CHANGED';
      containerSemanticId: string;
      collectionRole: string;
      memberRole: string;
      before: number;
      after: number;
    }
  /**
   * A member of a collection changed what it declares about being selected.
   *
   * Membership and selection are different dimensions of state, and inferring
   * one from the other is what let a dialog opening look like a row being
   * picked. Nothing here is derived from a label, an identifier, or a class.
   */
  | {
      kind: 'SELECTION_CHANGED';
      containerSemanticId: string;
      /** Members that declare themselves selected now and did not before. */
      selected: readonly string[];
      /** Members that declared themselves selected before and no longer do. */
      deselected: readonly string[];
      selectedBefore: number;
      selectedAfter: number;
    }
  | { kind: 'CONTROL_ENABLED'; semanticId: string }
  | { kind: 'CONTROL_DISABLED'; semanticId: string }
  | { kind: 'VALUE_CHANGED'; semanticId: string }
  | { kind: 'NETWORK_REQUEST'; method: string; path: string; statusCategory: string };

/** One before/action/after, and what fell out of it. */
export interface InteractionTrace {
  traceId: string;
  beforeSnapshot: RuntimeEvidenceSnapshot;
  action: InteractionAction;
  afterSnapshot: RuntimeEvidenceSnapshot;
  observedEffects: readonly ObservedEffect[];
}

const byId = (snapshot: RuntimeEvidenceSnapshot): Map<string, ObservedElement> => {
  const map = new Map<string, ObservedElement>();
  for (const element of snapshot.elements) {
    if (element.semanticId !== undefined && !map.has(element.semanticId)) {
      map.set(element.semanticId, element);
    }
  }
  return map;
};

/** One typed collection, and the members it holds. */
interface CollectionState {
  containerSemanticId: string;
  collectionRole: string;
  memberRole: string;
  /** Refs of the members, so a set difference means something. */
  members: string[];
  /** Members declaring themselves selected. */
  selected: string[];
}

/**
 * The typed collections a snapshot contains, and their members.
 *
 * The predecessor counted every element with a semantic parent, so *every*
 * container was a collection and every child was a member. That is how a
 * `<section>` came to report membership. Three things are required here
 * instead, and each rules out a real false positive the fixture produces:
 *
 *   - the container's **role** must be a collection role. A section, form,
 *     dialog or generic div is not one, however many children it gains.
 *   - the member's **role** must be one that role admits. A `<table>` gaining a
 *     caption has not gained a row.
 *   - the member must be a **descendant of that container**, by ancestry rather
 *     than by nearest parent, because a row's cells sit between the row and the
 *     table and a nearest-parent count would miss every one of them.
 */
function collectionsIn(snapshot: RuntimeEvidenceSnapshot): Map<string, CollectionState> {
  const collections = new Map<string, CollectionState>();
  for (const element of snapshot.elements) {
    if (element.semanticId === undefined) continue;
    if (!isCollectionRole(element.role)) continue;
    const memberRoles = memberRolesFor(element.role);
    if (memberRoles.length === 0) continue;
    collections.set(element.semanticId, {
      containerSemanticId: element.semanticId,
      collectionRole: element.role,
      memberRole: memberRoles[0] ?? '',
      members: [],
      selected: [],
    });
  }

  for (const element of snapshot.elements) {
    for (const ancestor of element.semanticAncestry) {
      const collection = collections.get(ancestor);
      if (collection === undefined) continue;
      if (!memberRolesFor(collection.collectionRole).includes(element.role)) continue;
      collection.members.push(element.ref);
      if (element.selected === true) collection.selected.push(element.ref);
    }
  }
  return collections;
}

/** A stable key for a member, preferring what the application named it. */
function memberKey(snapshot: RuntimeEvidenceSnapshot, ref: string): string {
  const element = snapshot.elements.find((entry) => entry.ref === ref);
  return element?.semanticId ?? ref;
}

/** What {@link diffSnapshots} needs beyond the two snapshots. */
export interface DiffInput {
  before: RuntimeEvidenceSnapshot;
  after: RuntimeEvidenceSnapshot;
  /** Requests that began inside this interaction's window. */
  requests?: readonly { method: string; path: string; statusCategory: string }[];
}

/**
 * Every neutral difference between two snapshots.
 *
 * Sorted, so a trace is comparable between runs. Nothing here decides whether a
 * difference matters — a rule does that, later, and only for the differences it
 * names.
 */
export function diffSnapshots(input: DiffInput): ObservedEffect[] {
  const effects: ObservedEffect[] = [];
  const { before, after } = input;

  if (before.route !== after.route) {
    effects.push({ kind: 'ROUTE_CHANGED', from: before.route, to: after.route });
  }

  const beforeElements = byId(before);
  const afterElements = byId(after);

  for (const [id, element] of afterElements) {
    if (beforeElements.has(id)) continue;
    effects.push({
      kind: 'ELEMENT_APPEARED',
      semanticId: id,
      role: element.role,
      ...(element.accessibleName === undefined ? {} : { name: element.accessibleName.text }),
    });
  }
  for (const [id, element] of beforeElements) {
    if (afterElements.has(id)) continue;
    effects.push({ kind: 'ELEMENT_DISAPPEARED', semanticId: id, role: element.role });
  }

  for (const [id, element] of afterElements) {
    const was = beforeElements.get(id);
    if (was === undefined) continue;
    if (was.disabled && !element.disabled)
      effects.push({ kind: 'CONTROL_ENABLED', semanticId: id });
    if (!was.disabled && element.disabled) {
      effects.push({ kind: 'CONTROL_DISABLED', semanticId: id });
    }
    if (was.value !== element.value) effects.push({ kind: 'VALUE_CHANGED', semanticId: id });
  }

  const beforeRegions = new Set(
    before.regions.map((entry) => `${entry.role}|${entry.semanticId ?? ''}`),
  );
  const afterRegions = new Set(
    after.regions.map((entry) => `${entry.role}|${entry.semanticId ?? ''}`),
  );
  for (const key of afterRegions) {
    if (beforeRegions.has(key)) continue;
    const [role, semanticId] = key.split('|');
    effects.push({
      kind: 'REGION_APPEARED',
      role: role ?? '',
      ...(semanticId ? { semanticId } : {}),
    });
  }
  for (const key of beforeRegions) {
    if (afterRegions.has(key)) continue;
    const [role, semanticId] = key.split('|');
    effects.push({
      kind: 'REGION_DISAPPEARED',
      role: role ?? '',
      ...(semanticId ? { semanticId } : {}),
    });
  }

  // A collection changed only if the container itself survived. A container that
  // disappeared took its members with it, and that is a different fact.
  const beforeCollections = collectionsIn(before);
  const afterCollections = collectionsIn(after);
  for (const [container, now] of afterCollections) {
    const was = beforeCollections.get(container);
    if (was === undefined) continue;
    if (!beforeElements.has(container) || !afterElements.has(container)) continue;

    if (was.members.length !== now.members.length) {
      effects.push({
        kind: 'COLLECTION_MEMBERS_CHANGED',
        containerSemanticId: container,
        collectionRole: now.collectionRole,
        memberRole: now.memberRole,
        before: was.members.length,
        after: now.members.length,
      });
    }

    // Selection is asked separately, and by identity rather than by count: a
    // list that swaps which row is selected has the same number selected before
    // and after, and that is precisely a selection change.
    const selectedBefore = new Set(was.selected.map((ref) => memberKey(before, ref)));
    const selectedAfter = new Set(now.selected.map((ref) => memberKey(after, ref)));
    const gained = [...selectedAfter].filter((key) => !selectedBefore.has(key)).sort();
    const lost = [...selectedBefore].filter((key) => !selectedAfter.has(key)).sort();
    const activeChanged =
      beforeElements.get(container)?.activeDescendant !==
      afterElements.get(container)?.activeDescendant;

    if (gained.length > 0 || lost.length > 0 || activeChanged) {
      effects.push({
        kind: 'SELECTION_CHANGED',
        containerSemanticId: container,
        selected: gained,
        deselected: lost,
        selectedBefore: selectedBefore.size,
        selectedAfter: selectedAfter.size,
      });
    }
  }

  for (const request of input.requests ?? []) {
    effects.push({
      kind: 'NETWORK_REQUEST',
      method: request.method,
      path: request.path,
      statusCategory: request.statusCategory,
    });
  }

  return effects.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
}

/** Refuses an action the current safety level does not permit. */
export function assertPermitted(action: InteractionAction, allowed: InteractionSafety): void {
  const order: InteractionSafety[] = ['OBSERVE_ONLY', 'SAFE_PROBE', 'CONSEQUENTIAL'];
  if (order.indexOf(action.safety) > order.indexOf(allowed)) {
    throw new Error(
      `Refusing a ${action.safety} interaction on ${action.targetSemanticId}: this harness permits ${allowed}. ` +
        `A consequential action has to be arranged by a caller that has said so, against isolated state.`,
    );
  }
}
