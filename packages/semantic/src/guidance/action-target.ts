/**
 * Turning "this feature does something" into "press this control".
 *
 * A verified `workflow_step` claim may name its subject as `feature:<id>` rather
 * than as a graph node — the verifier accepts both, and a model describing a
 * feature as a whole naturally reaches for the feature. The compiler had no
 * mapping for that shape: `roleOf()` looked the id up in the graph, found
 * nothing, fell through to `result`, and dropped the step without a word.
 *
 * Measured in the Round 3 review, that one gap accounted for ten of the fourteen
 * lowest-scoring features. Twelve of them carried exactly one verified workflow
 * step, every one of those steps named a feature, and every one was discarded —
 * leaving guidance that said *"Open Settings."* and stopped. The three features
 * that scored 2 or 3 were precisely the three whose steps named an element.
 *
 * So a feature reference is resolved, deliberately and with evidence, to the
 * control a user would actually press.
 *
 * **The resolution is not a string rewrite.** `feature:clients.export` does not
 * become `element:clients.export` because the suffixes match. It becomes that
 * node only if the candidate model already records the mapping — the feature's
 * own roots — *and* the node exists, *and* the feature scope owns it, *and* the
 * graph proves a user can act on it. A shared suffix is a coincidence in a
 * namespace, not a fact about an application, and this project has already been
 * bitten once by treating adjacency as ownership.
 *
 * **Ambiguity refuses.** Where more than one owned control could be the action,
 * nothing is emitted and {@link ActionTargetOutcome} says why. Choosing by sort
 * order is how `invoices.list.*` came to instruct users to open the client
 * detail page.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode } from '@statewavedev/guide-indexer';
import type { FeatureCandidate } from '../candidates.js';
import { compareStrings } from '../compare.js';
import type { FeatureScope } from '../scope.js';
import { FEATURE_SUBJECT_PREFIX } from '../verifier.js';
import type { HumanLabel } from './labels.js';
import { labelForNode } from './labels.js';

/** Where a resolved action target came from. */
export type ActionTargetSource =
  /** The candidate's own root, recorded by discovery. */
  | 'feature-root'
  /** An element the feature's scope owns, reached along its behaviour spine. */
  | 'owned-action';

/** A control a user can act on, resolved from a claim's subject. */
export interface WorkflowActionTarget {
  featureId: string;
  nodeId: string;
  source: ActionTargetSource;
  /** The control's visible name. Absent when nothing on screen names it. */
  label?: HumanLabel;
}

/** Why a resolution did or did not produce a target. */
export type ActionTargetOutcome =
  | { status: 'resolved'; target: WorkflowActionTarget }
  /** Nothing the feature owns is something a user can act on. */
  | { status: 'no-actionable-target'; detail: string }
  /** More than one owned control could be meant. Refused rather than guessed. */
  | { status: 'ambiguous'; candidates: readonly string[]; detail: string }
  /** The subject names a node, and that node is passive. */
  | { status: 'passive-target'; nodeId: string; detail: string };

/**
 * Relationship types that prove activating a control does something.
 *
 * Read off the graph rather than assumed from a tag name, because a tag says
 * what an element *is* and an edge says what it *does*. A `<button>` with no
 * outgoing behaviour is decoration; a `NavLink` with `navigates_to` is a control
 * whatever it is called.
 */
const ACTIVATION_EDGES = ['invokes', 'submits_to', 'navigates_to', 'opens'] as const;

/**
 * Tag names that are user input rather than activation.
 *
 * A text box does something when a user types in it, and typing leaves no edge
 * in the graph — so inputs are recognised by kind. Kept narrow and explicit:
 * this list is the whole of what counts, and guessing more would be inventing
 * interactivity.
 */
const INPUT_TAGS = new Set(['input', 'textfield', 'select', 'textarea', 'combobox']);

/** Tag names that hold other things rather than doing anything. */
const CONTAINER_TAGS = new Set(['form', 'section', 'div', 'table', 'ul', 'ol', 'nav', 'aside']);

/** True when the graph proves a user can act on this node. */
export function isActionableNode(
  node: ApplicationNode | undefined,
  graph: ApplicationGraph,
): boolean {
  if (node === undefined || node.kind !== 'element') return false;

  const record = node as unknown as Record<string, unknown>;
  const tag = typeof record['tagName'] === 'string' ? record['tagName'].toLowerCase() : '';
  const type = typeof record['type'] === 'string' ? record['type'] : '';

  // A container is never the action, even when it carries a behaviour edge. A
  // `<form>` has `submits_to` and a user does not press a form; they press the
  // control inside it, which carries the same edge and has a name.
  if (CONTAINER_TAGS.has(tag)) return false;

  if (INPUT_TAGS.has(tag) || type === 'input') return true;

  return graph.relationships.some(
    (edge) =>
      edge.source === node.id && (ACTIVATION_EDGES as readonly string[]).includes(edge.type),
  );
}

/** What {@link resolveActionTarget} needs. */
export interface ResolveActionTargetInput {
  subjectRef: string;
  candidate: FeatureCandidate;
  scope: FeatureScope;
  graph: ApplicationGraph;
}

/**
 * Resolves a claim's subject to the control a user would press.
 *
 * A node subject resolves to itself when the node is actionable, and is refused
 * when it is not — a claim about a read-only display is not a claim about
 * something to do.
 *
 * A `feature:` subject resolves through the candidate's own roots, which is the
 * mapping discovery already recorded. Nothing here consults the *text* of an
 * identifier.
 */
export function resolveActionTarget(input: ResolveActionTargetInput): ActionTargetOutcome {
  const { subjectRef, candidate, scope, graph } = input;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  if (!subjectRef.startsWith(FEATURE_SUBJECT_PREFIX)) {
    const node = nodeById.get(subjectRef);
    if (node === undefined) {
      return {
        status: 'no-actionable-target',
        detail: `${subjectRef} names no node in the graph.`,
      };
    }
    if (!isActionableNode(node, graph)) {
      return {
        status: 'passive-target',
        nodeId: subjectRef,
        detail: `${subjectRef} is something the interface shows, not something a user acts on.`,
      };
    }
    const label = labelForNode(node);
    return {
      status: 'resolved',
      target: {
        featureId: candidate.id,
        nodeId: subjectRef,
        source: 'owned-action',
        ...(label === undefined ? {} : { label }),
      },
    };
  }

  // A feature subject. Only *this* feature's, and only through the roots
  // discovery recorded for it — never through the shape of the id.
  if (subjectRef !== `${FEATURE_SUBJECT_PREFIX}${candidate.id}`) {
    return {
      status: 'no-actionable-target',
      detail: `${subjectRef} is another feature, and this one cannot act on its behalf.`,
    };
  }

  const roots = [...candidate.rootNodes].sort(compareStrings);
  const actionable = roots.filter((root) => {
    if (scope.classify(root) !== 'OWNED') return false;
    return isActionableNode(nodeById.get(root), graph);
  });

  if (actionable.length === 1) {
    const nodeId = actionable[0]!;
    const label = labelForNode(nodeById.get(nodeId));
    return {
      status: 'resolved',
      target: {
        featureId: candidate.id,
        nodeId,
        source: 'feature-root',
        ...(label === undefined ? {} : { label }),
      },
    };
  }

  if (actionable.length > 1) {
    // Deliberately not resolved. Picking the first would be picking by sort
    // order, which is exactly how two invoice features came to tell users to
    // open the client detail page.
    return {
      status: 'ambiguous',
      candidates: actionable,
      detail: `${candidate.id} owns ${actionable.length} controls a user could act on, and nothing establishes which one this claim is about.`,
    };
  }

  return {
    status: 'no-actionable-target',
    detail: `${candidate.id} owns nothing a user can act on: its roots are containers, displays, or controls the graph proves nothing about.`,
  };
}
