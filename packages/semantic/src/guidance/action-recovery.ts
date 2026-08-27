/**
 * Recovering the control a passive subject acts through.
 *
 * Round 4 measured one variable that separated useful guidance from useless:
 * whether the guide names something to press. Twelve features that emitted a
 * real task action averaged 2.25 and every one of them scored 2 or better;
 * nine that emitted only *"Open Settings."* averaged 1.11. All seven of the low
 * scorers had zero task steps.
 *
 * Three of those seven fail for a reason the graph can answer. `settings.form`
 * is the clearest: a verified `capability:submit` sits on a `<form>`, and
 * {@link isActionableNode} refuses a form on purpose — nobody presses a form.
 * What a user presses is **Save changes**, and the graph already records why
 * the two are the same act: both carry `submits_to` to the *same handler
 * function*. That is a structural fact about where the work happens, not a
 * guess from a label, an identifier, a screen or a source line.
 *
 * So this module answers exactly one question:
 *
 * > When a subject is passive but the feature owns the thing it acts on, is
 * > there exactly one control the graph proves acts on that same thing?
 *
 * **The action surface is the unit of ownership.** The recovery does not ask
 * whether the feature owns the *control*; it asks whether the feature owns the
 * *work*. `settings.form` owns `saveSettings` — the handler it submits to sits
 * inside its scope. A control that submits to that handler is performing this
 * feature's action, whatever else it may also belong to. A control that submits
 * somewhere else is not, however close it sits on screen.
 *
 * That distinction is what keeps the rule from becoming proximity. The
 * `SettingsPage` component contains `settings.form`, `settings.rotate-key`,
 * `settings.new-key`, `settings.name` and `settings.danger-zone`. Every one of
 * them is a sibling of **Save changes**. Only `settings.form` reaches it,
 * because only `settings.form` submits to the handler it submits to.
 *
 * **Two relationships qualify and two do not.** `submits_to` and `invokes` name
 * a unit of work: converging on one means two controls run the same code.
 * `navigates_to` and `opens` name a *destination*, and converging on a
 * destination proves only that two things lead to the same place. The fixture
 * has the counterexample already — `element:nav.invoices` and
 * `element:client-detail.invoices-link` both navigate to `route:/invoices`, and
 * they are unrelated features. A rule that treated that as an action surface
 * would have the invoices link performing the nav bar's job.
 *
 * **Depth is one edge out and one edge back**, through a single shared node,
 * and no further. There is no search for nearby buttons, because nearby is not
 * ownership — the entire Day 2 result rests on that sentence.
 *
 * **Ambiguity refuses.** Two submit controls on one handler produce nothing and
 * say why. Ranking them would mean ranking by wording or by sort order, which
 * is how two invoice features came to tell users to open the client detail page.
 *
 * @packageDocumentation
 */

import type {
  ApplicationGraph,
  ApplicationNode,
  RelationshipType,
} from '@statewavedev/guide-indexer';
import type { FeatureCandidate } from '../candidates.js';
import { compareStrings } from '../compare.js';
import type { FeatureScope, ScopeClass } from '../scope.js';
import { FEATURE_SUBJECT_PREFIX } from '../verifier.js';
import { isActionableNode } from './action-target.js';
import type { WorkflowActionTarget } from './action-target.js';
import { labelForNode } from './labels.js';

/**
 * Relationships along which a shared target is a shared *action*.
 *
 * Both name work rather than a place. `submits_to` is a form or a control
 * handing its contents to a handler; `invokes` is a control running one. Two
 * elements converging on either are running the same code, which is the fact
 * the recovery needs and the only one it uses.
 *
 * `navigates_to` and `opens` are deliberately absent — see the module note.
 */
export const ACTION_SURFACE_RELATIONSHIPS: readonly RelationshipType[] = ['submits_to', 'invokes'];

/** The recovery patterns this module knows. One, for now, and named. */
export type ActionRecoveryRule =
  /**
   * A passive subject and the unique control that acts on the same owned
   * surface. `<form data-guide="settings.form">` and the **Save changes**
   * button beneath it, joined at `saveSettings`.
   */
  'passive-subject-shared-action-surface';

/**
 * Why a recovery happened, in enough detail to argue with.
 *
 * Every field here is a fact the rule actually used. A reviewer who disagrees
 * with a recovered step should be able to name which of these is wrong rather
 * than having to re-derive the decision.
 */
export interface ActionRecoveryProvenance {
  /** The subject the claim named. */
  subject: string;
  /** The passive node the walk started from. */
  from: string;
  rule: ActionRecoveryRule;
  /** The relationship both the subject and the control traverse. */
  relationship: RelationshipType;
  /** The node they converge on: the work both of them do. */
  actionSurface: string;
  /** The control that won. */
  control: string;
  /** How the feature classifies that surface. Always `OWNED` — it is required. */
  actionSurfaceScope: ScopeClass;
  /**
   * How the feature classifies the recovered control.
   *
   * Recorded rather than constrained, and frequently `OUTSIDE`. The graph holds
   * no element-to-element containment, so a submit button is never a descendant
   * of its own form — it is a sibling under the page component. Requiring the
   * *control* to be owned would make this rule unimplementable rather than
   * safe. What is required is that the *surface* is owned, which is the
   * stronger claim: it says the control does this feature's work.
   */
  controlScope: ScopeClass;
  /** The relationship ids walked, in order. */
  traversed: readonly string[];
  /** The graph edge that proves the control is a control. */
  actionabilityEvidence: string;
  /** Why this candidate and no other. */
  why: string;
}

/** What a recovery attempt produced. */
export type ActionTargetRecoveryOutcome =
  | { status: 'resolved'; target: WorkflowActionTarget; provenance: ActionRecoveryProvenance }
  /**
   * Nothing to recover, for one of two quite different reasons.
   *
   * `no-passive-subject` means the rule never got started: the subject names a
   * component, another feature, or a control that already resolved directly.
   * `no-separate-control` means it ran and found nothing — the surface is owned
   * and the only thing acting on it is the passive subject itself. Separated
   * because a funnel that reports them as one number cannot tell "the rule does
   * not apply here" from "the rule applies and the application has no button".
   */
  | { status: 'none'; reason: 'no-passive-subject' | 'no-separate-control'; detail: string }
  /** Several controls act on the same surface. Refused rather than ranked. */
  | { status: 'ambiguous'; candidates: readonly string[]; detail: string }
  /** The subject does nothing at all: a display, a section, a table. */
  | { status: 'passive'; detail: string }
  /** The subject acts, along a relationship this rule does not accept. */
  | {
      status: 'unsupported-relationship';
      relationships: readonly RelationshipType[];
      detail: string;
    };

/** What {@link recoverActionTarget} needs. */
export interface RecoverActionTargetInput {
  subjectRef: string;
  candidate: FeatureCandidate;
  scope: FeatureScope;
  graph: ApplicationGraph;
}

/** The passive nodes a subject offers as starting points. */
function startingPoints(
  subjectRef: string,
  candidate: FeatureCandidate,
  scope: FeatureScope,
  nodeById: Map<string, ApplicationNode>,
  graph: ApplicationGraph,
): string[] {
  // Only elements. A React component carries `submits_to` too, and a component
  // is not a surface anybody looks at — recovering through one would mean
  // inferring a button from a module. `clients.create` has the case already: a
  // workflow step subject of `component:ClientForm`, which sits above the form
  // and the button both. The element rule leaves it refused, and the step that
  // names the button directly is the one that speaks.
  const passive = (id: string): boolean => {
    const node = nodeById.get(id);
    return node !== undefined && node.kind === 'element' && !isActionableNode(node, graph);
  };

  if (!subjectRef.startsWith(FEATURE_SUBJECT_PREFIX)) {
    // A subject that is already actionable resolved directly; recovery is for
    // the passive case and must never second-guess a direct target.
    return passive(subjectRef) ? [subjectRef] : [];
  }
  if (subjectRef !== `${FEATURE_SUBJECT_PREFIX}${candidate.id}`) return [];
  return [...candidate.rootNodes]
    .sort(compareStrings)
    .filter((root) => scope.classify(root) === 'OWNED')
    .filter(passive);
}

/**
 * Resolves a passive subject to the control that performs its action.
 *
 * Runs only after {@link resolveActionTarget} has declined — recovery never
 * overrides a direct verified target, and a subject that names an actionable
 * node is not a subject this function has anything to say about.
 */
export function recoverActionTarget(input: RecoverActionTargetInput): ActionTargetRecoveryOutcome {
  const { subjectRef, candidate, scope, graph } = input;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  const starts = startingPoints(subjectRef, candidate, scope, nodeById, graph);
  if (starts.length === 0) {
    return {
      status: 'none',
      reason: 'no-passive-subject',
      detail: `${subjectRef} offers no passive element this feature owns to recover from.`,
    };
  }

  /** Every candidate control found, keyed by node id so a repeat is one entry. */
  const found = new Map<string, ActionRecoveryProvenance>();
  const unsupported = new Set<RelationshipType>();
  let sawEligibleSurface = false;
  let sawAnyEdge = false;

  for (const from of starts) {
    const outgoing = graph.relationships.filter((edge) => edge.source === from);
    if (outgoing.length > 0) sawAnyEdge = true;

    for (const edge of outgoing) {
      if (!ACTION_SURFACE_RELATIONSHIPS.includes(edge.type)) {
        unsupported.add(edge.type);
        continue;
      }
      // The feature must own the work. This is the whole ownership rule: a
      // surface the scope does not own is somebody else's action, and a control
      // reached through it would be borrowed.
      const surfaceScope = scope.classify(edge.target);
      if (surfaceScope !== 'OWNED') continue;
      sawEligibleSurface = true;

      for (const back of graph.relationships) {
        if (back.type !== edge.type) continue;
        if (back.target !== edge.target) continue;
        if (back.source === from) continue;
        const control = nodeById.get(back.source);
        if (control === undefined || control.kind !== 'element') continue;
        if (!isActionableNode(control, graph)) continue;

        found.set(control.id, {
          subject: subjectRef,
          from,
          rule: 'passive-subject-shared-action-surface',
          relationship: edge.type,
          actionSurface: edge.target,
          control: control.id,
          actionSurfaceScope: surfaceScope,
          controlScope: scope.classify(control.id),
          traversed: [edge.id, back.id],
          actionabilityEvidence: back.id,
          why: `${control.id} is the only control the graph proves acts on ${edge.target}, which ${candidate.id} owns.`,
        });
      }
    }
  }

  if (found.size === 1) {
    const [nodeId, provenance] = [...found][0]!;
    const label = labelForNode(nodeById.get(nodeId));
    return {
      status: 'resolved',
      target: {
        featureId: candidate.id,
        nodeId,
        source: 'recovered-action-surface',
        ...(label === undefined ? {} : { label }),
      },
      provenance,
    };
  }

  if (found.size > 1) {
    const controls = [...found.keys()].sort(compareStrings);
    return {
      status: 'ambiguous',
      candidates: controls,
      detail: `${controls.length} controls act on the same surface (${controls.join(', ')}), and nothing establishes which one this claim is about. Choosing would mean choosing by wording or by sort order.`,
    };
  }

  if (sawEligibleSurface) {
    return {
      status: 'none',
      reason: 'no-separate-control',
      detail: `${subjectRef} acts on a surface this feature owns, and no separate control does. There is nothing to press that is not the passive subject itself.`,
    };
  }

  if (unsupported.size > 0) {
    const types = [...unsupported].sort(compareStrings) as RelationshipType[];
    return {
      status: 'unsupported-relationship',
      relationships: types,
      detail: `${subjectRef} carries only ${types.join(', ')}, which name what is required or where something leads rather than work this feature owns. A shared destination is not a shared action.`,
    };
  }

  return {
    status: 'passive',
    detail: sawAnyEdge
      ? `${subjectRef} reaches nothing this feature owns.`
      : `${subjectRef} has no outgoing relationship at all: the graph proves it is something the interface shows, not something that acts.`,
  };
}
