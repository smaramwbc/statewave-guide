/**
 * Turning what is known into what should be said.
 *
 * The compiler's whole job is selection and arrangement. It may drop a verified
 * fact, reorder steps into the sequence a person performs, and decline to speak
 * about a feature at all — but it may not add a single thing the ProductModel
 * and the graph do not already establish. Every proposition it emits carries
 * provenance, and a proposition with empty provenance is a bug rather than a
 * sentence.
 *
 * Two decisions here account for most of the difference from Day 2.
 *
 * **Silence is an output.** A feature with nothing provable used to produce
 * *"No capability, route or permission has been verified for this feature."* —
 * a sentence about our own epistemology, shown to someone who wanted to know how
 * to use a product. Ten features carried it and all ten were flagged
 * `too_technical`. On two of them it sat directly above a confident description
 * of what the control does, so the page contradicted itself. Now the same
 * situation produces a diagnostic and no description.
 *
 * **Order comes from roles, not from depth.** Sorting steps by ownership-path
 * depth ran `clients.create` backwards, because containment nests the opposite
 * way from use: the form is inside the dialog that is opened by the button, so
 * the deepest node is the last thing a user reaches and the first thing depth
 * sorting returns.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type { ProductClaim, ProductFeature, ProductModel } from '@statewavedev/guide-shared';
import type { FeatureCandidate } from '../candidates.js';
import { compareStrings } from '../compare.js';
import { computeFeatureScope } from '../scope.js';
import type { FeatureScope } from '../scope.js';
import { resolveActionTarget } from './action-target.js';
import type { WorkflowActionTarget } from './action-target.js';
import { createLabelIndex, entityNoun, fieldNoun, normaliseIdentifier } from './labels.js';
import type { HumanLabel, LabelIndex } from './labels.js';
import type {
  ActionAccountingEntry,
  GuidanceCompleteness,
  GuidanceCondition,
  GuidanceDiagnostic,
  GuidanceDocument,
  GuidanceProposition,
  GuidanceProvenance,
  GuidanceQuestion,
  GuidanceStep,
  StepOrigin,
  TaskCompletion,
  WorkflowRole,
} from './ir.js';
import { WORKFLOW_ROLE_ORDER, isActionProposition, mergeProvenance } from './ir.js';
import { realiseInstruction, realiseProposition } from './realise.js';

/** What the compiler reads. */
export interface CompileGuidanceInput {
  model: ProductModel;
  feature: ProductFeature;
  graph: ApplicationGraph;
  /**
   * The candidate this feature was discovered as, and its roots.
   *
   * Required to resolve a `feature:` subject to a control: the roots are the
   * mapping discovery recorded, and they are the only thing that may establish
   * it. Optional so existing callers keep compiling; without it a feature
   * subject cannot resolve and the claim is accounted for as dropped rather
   * than silently lost.
   */
  candidate?: FeatureCandidate;
  /** What this feature owns. Required to refuse a control it does not. */
  scope?: FeatureScope;
}

const EMPTY_PROVENANCE: GuidanceProvenance = { claims: [], facts: [] };

function provenanceOf(claim: ProductClaim): GuidanceProvenance {
  return {
    claims: [claim.id],
    facts: [...(claim.assertion?.targets ?? []), ...(claim.evidence ?? []).map((e) => e.ref)],
  };
}

/** Compiles one feature's guidance. */
export function compileGuidance(input: CompileGuidanceInput): GuidanceDocument {
  const { feature, model, graph } = input;
  const labels = createLabelIndex(graph);
  const diagnostics: GuidanceDiagnostic[] = [];

  const claims = model.claims.filter((claim) => claim.featureId === feature.id);
  const factual = claims.filter(
    (claim) => claim.status === 'structurally_verified' && claim.assertion !== undefined,
  );
  const language = claims.filter((claim) => claim.status === 'semantically_grounded');

  const object = entityNoun(feature.id);
  const title = titleFor(feature, labels, diagnostics);

  // The candidate and its scope decide what a `feature:` subject may resolve to.
  // Reconstructed here when a caller did not supply them, from the feature's own
  // entry points — never from the shape of an identifier.
  const candidate: FeatureCandidate =
    input.candidate ??
    ({
      id: feature.id,
      idOrigin: feature.idOrigin === 'semantic-id' ? 'semantic-id' : 'derived',
      rootNodes: [...(feature.entryPoints ?? [])],
      discoveredBy: 'guide-element',
    } as FeatureCandidate);
  const scope =
    input.scope ??
    computeFeatureScope({
      featureId: feature.id,
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });

  const accounting: ActionAccountingEntry[] = [];
  /** Resolves one action claim to a control, recording whatever happens. */
  const targetFor = (claim: ProductClaim): WorkflowActionTarget | undefined => {
    const subjectRef = claim.assertion?.subjectRef ?? '';
    const outcome = resolveActionTarget({ subjectRef, candidate, scope, graph });
    if (outcome.status === 'resolved') return outcome.target;

    const reason =
      outcome.status === 'ambiguous'
        ? 'AMBIGUOUS_WORKFLOW_TARGET'
        : outcome.status === 'passive-target'
          ? 'PASSIVE_TARGET'
          : 'NO_ACTIONABLE_TARGET';
    accounting.push({
      claimId: claim.id,
      subjectRef,
      outcome: 'dropped',
      reason,
      detail: outcome.detail,
    });
    diagnostics.push({ code: reason, detail: outcome.detail, subject: claim.id });
    return undefined;
  };

  // --- Capabilities, as things a user can do -------------------------------
  const capabilities: GuidanceProposition[] = [];
  for (const claim of factual) {
    if (claim.type !== 'capability') continue;
    const action = claim.assertion?.action;
    if (action === undefined) continue;
    const control = controlFor(claim, labels);

    // `submit` is the mechanism, not the outcome. Spoken on its own it produced
    // "submit the invoices create form form", so Closed Loop #4 suppressed it
    // outright — and that was too broad. A submit claim attached to a control a
    // user can read is perfectly sayable *through the control*: `Save changes`
    // is what they press, and the internal verb never has to appear. Suppression
    // now applies only where nothing on screen names the action, which is the
    // case the original rule was actually about.
    if (action === 'submit' && control === undefined) {
      accounting.push({
        claimId: claim.id,
        subjectRef: claim.assertion?.subjectRef ?? '',
        outcome: 'dropped',
        reason: 'UNSUPPORTED_PRESENTATION',
        detail:
          'A submit capability with no user-visible control. Naming it would mean saying "submit the form", which describes the mechanism rather than anything the reader can see.',
      });
      continue;
    }
    // `navigate` is handled below as a destination. Rendered as a bare
    // capability it produced "You can open a nav." — the namespace of a
    // navigation link is not a thing anybody has.
    if (action === 'navigate') continue;

    capabilities.push({
      kind: 'perform_action',
      action,
      ...(object === undefined ? {} : { object }),
      ...(control === undefined ? {} : { control }),
      provenance: provenanceOf(claim),
    });
  }

  // --- Navigation ----------------------------------------------------------
  const navigation: GuidanceProposition[] = [];
  for (const claim of factual) {
    if (claim.type !== 'navigation' && claim.assertion?.action !== 'navigate') continue;
    const destination = destinationFor(claim, labels);
    if (destination === undefined) continue;
    const via = controlFor(claim, labels);
    navigation.push({
      kind: 'navigate',
      destination,
      ...(via === undefined || via.text === destination.text ? {} : { via }),
      provenance: provenanceOf(claim),
    });
  }

  // --- Conditions: permissions, and constraints that earn their place ------
  const conditions: GuidanceCondition[] = [];
  for (const claim of factual) {
    if (claim.type === 'permission') {
      const permission = claim.assertion?.permission ?? permissionFrom(claim);
      if (permission === undefined) continue;
      conditions.push({
        proposition: {
          kind: 'requires_permission',
          permission,
          ...(object === undefined ? {} : { capability: capabilityPhrase(capabilities, object) }),
          provenance: provenanceOf(claim),
        },
        provenance: provenanceOf(claim),
      });
      continue;
    }
    if (claim.type === 'constraint') {
      // A constraint enters guidance only when it changes what the user should
      // do. "Input is validated before it is accepted" is true of almost every
      // form ever written; the Day 2 reviewer flagged it as irrelevant three
      // times, because it answers no question anyone asked.
      diagnostics.push({
        code: 'CONSTRAINT_WITHHELD_AS_IRRELEVANT',
        detail:
          'A verified constraint was not rendered: it does not change which values or actions are allowed, and does not explain a likely failure.',
        subject: claim.id,
      });
    }
  }

  // --- Workflow, in the order a person performs it -------------------------
  const steps = compileSteps(
    factual,
    labels,
    object,
    diagnostics,
    entryScreen(feature, candidate, graph, labels, diagnostics),
    targetFor,
    accounting,
  );

  // --- Summary and purpose -------------------------------------------------
  const ranked = [...capabilities, ...navigation];
  const summary =
    ranked.length === 0
      ? undefined
      : {
          text: realiseProposition(ranked[0]!),
          provenance: ranked[0]!.provenance,
        };

  if (summary === undefined) {
    diagnostics.push({
      code: 'NO_VERIFIED_CAPABILITY',
      detail:
        'Nothing this feature does could be established, so no description was written. Silence is the output; the technical reason lives here.',
      subject: feature.id,
    });
  }

  const purpose = purposeFrom(language, factual, diagnostics);
  const questions = compileQuestions(language, diagnostics);

  const taskCompletion = taskCompletionOf(steps);
  const document: GuidanceDocument = {
    featureId: feature.id,
    title,
    ...(summary === undefined ? {} : { summary }),
    ...(purpose === undefined ? {} : { purpose }),
    steps,
    questions,
    conditions,
    diagnostics,
    completeness: 'EMPTY',
    taskCompletion,
    actionAccounting: accounting,
  };
  return { ...document, completeness: completenessOf(document) };
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

function titleFor(
  feature: ProductFeature,
  labels: LabelIndex,
  diagnostics: GuidanceDiagnostic[],
): HumanLabel {
  for (const entry of feature.entryPoints ?? []) {
    const found = labels.label(entry);
    if (found !== undefined && found.origin === 'ui-label') return found;
  }
  for (const elementId of feature.elements ?? []) {
    const found = labels.label(`element:${elementId}`);
    if (found !== undefined && found.origin === 'ui-label') return found;
  }
  diagnostics.push({
    code: 'NO_USER_VISIBLE_LABEL',
    detail:
      'No control in this feature carries text a user can read, so the title is a cautious noun derived from the identifier.',
    subject: feature.id,
  });
  return { text: normaliseIdentifier(feature.id), origin: 'normalised-identifier' };
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Which part a node plays in the procedure.
 *
 * Read off the node's own nature rather than its position in a path, which is
 * what makes the order independent of how the interface nests.
 */
function roleOf(nodeId: string, labels: LabelIndex): WorkflowRole {
  const node = labels.node(nodeId);
  if (node === undefined) return 'result';
  if (node.kind === 'route') return 'entry';
  if (node.kind === 'api') return 'result';
  if (node.kind === 'component') return 'container';

  const record = node as unknown as Record<string, unknown>;
  const type = typeof record['type'] === 'string' ? record['type'] : '';
  const tag = typeof record['tagName'] === 'string' ? record['tagName'].toLowerCase() : '';
  const id = typeof record['elementId'] === 'string' ? record['elementId'] : '';

  if (type === 'input' || tag === 'input' || tag === 'textfield' || tag === 'select')
    return 'input';
  if (id.endsWith('.submit') || id.endsWith('.save')) return 'confirmation';
  if (id.endsWith('.form') || id.endsWith('-form')) return 'input';
  if (id.endsWith('.cancel')) return 'result';
  return 'trigger';
}

/** Controls a user fills in, as opposed to presses. */
function isFieldNode(nodeId: string, labels: LabelIndex): boolean {
  return roleOf(nodeId, labels) === 'input' && !nodeId.endsWith('.form');
}

function compileSteps(
  factual: readonly ProductClaim[],
  labels: LabelIndex,
  object: string | undefined,
  diagnostics: GuidanceDiagnostic[],
  entry: { label: HumanLabel; nodeId: string } | undefined,
  targetFor: (claim: ProductClaim) => WorkflowActionTarget | undefined,
  accounting: ActionAccountingEntry[],
): GuidanceStep[] {
  const actionClaims = factual.filter(
    (claim) =>
      claim.type === 'workflow_step' ||
      (claim.type === 'capability' && claim.assertion?.action !== undefined),
  );

  // Resolve every action claim to the control a user would press, before any
  // question of ordering. A `feature:` subject is not a node id and never was;
  // treating it as one is what dropped ten features' only step.
  const resolved: { claim: ProductClaim; target: WorkflowActionTarget; role: WorkflowRole }[] = [];
  for (const claim of actionClaims) {
    const target = targetFor(claim);
    if (target === undefined) continue;
    resolved.push({ claim, target, role: roleOf(target.nodeId, labels) });
  }

  // One action per control. A capability, a workflow step and a submit claim
  // routinely name the same button; emitting each would tell a user to press
  // "Create client" three times in a row. Identity is the control and the role,
  // never the similarity of two sentences.
  const seen = new Map<
    string,
    { claim: ProductClaim; target: WorkflowActionTarget; role: WorkflowRole }
  >();
  for (const candidate of resolved) {
    const key = `${candidate.target.nodeId}|${candidate.role}`;
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, candidate);
      continue;
    }
    // Kept: the claim that carries an action, because it can say what the
    // control accomplishes rather than only that it is pressed.
    const better =
      existing.claim.assertion?.action === undefined &&
      candidate.claim.assertion?.action !== undefined
        ? candidate
        : existing;
    if (better !== existing) seen.set(key, better);
    const dropped = better === existing ? candidate : existing;
    accounting.push({
      claimId: dropped.claim.id,
      subjectRef: dropped.claim.assertion?.subjectRef ?? '',
      outcome: 'dropped',
      reason: 'DUPLICATE_ACTION',
      detail: `Another claim already puts ${dropped.target.nodeId} in this guide as the same kind of step.`,
      targetNodeId: dropped.target.nodeId,
    });
  }

  const byRole = new Map<WorkflowRole, typeof resolved>();
  for (const candidate of seen.values()) {
    const bucket = byRole.get(candidate.role) ?? [];
    bucket.push(candidate);
    byRole.set(candidate.role, bucket);
  }

  // Fields are gathered into one instruction rather than one step each: a user
  // filling in a form does it once, and "Enter the name. Enter the email.
  // Enter the plan." is a list of the same step three times.
  const fieldNodes = actionClaims
    .flatMap((claim) => claim.assertion?.targets ?? [])
    .filter((target) => isFieldNode(target, labels));

  const steps: GuidanceStep[] = [];
  let index = 1;

  // Where the user has to be standing. Taken from the screen the feature lives
  // on, which the scope classifies as context — legitimate to name, and never
  // usable as evidence for a capability. Marked `synthetic-entry`, because
  // nobody claimed it and no metric should count it as something a user does.
  if (entry !== undefined) {
    steps.push({
      index: index++,
      role: 'entry',
      kind: 'action',
      origin: 'synthetic-entry',
      proposition: {
        kind: 'navigate',
        destination: entry.label,
        provenance: { claims: [], facts: [entry.nodeId] },
      },
      provenance: { claims: [], facts: [entry.nodeId] },
    });
  }

  for (const role of WORKFLOW_ROLE_ORDER) {
    if (role === 'entry') continue;

    // The fields are a step in their own right, assembled from every field the
    // workflow cites rather than from a claim that happens to have one as its
    // subject. A model describing "open the dialog" names the fields inside it
    // as evidence, and that is where the form's contents actually live — no
    // claim is ever *about* the email box.
    if (role === 'input') {
      const fields = collectFields(fieldNodes, labels);
      if (fields.length > 0) {
        const proposition: GuidanceProposition = {
          kind: 'enter_fields',
          fields,
          ...(object === undefined ? {} : { object }),
          provenance: mergeProvenance(
            ...actionClaims
              .filter((claim) =>
                (claim.assertion?.targets ?? []).some((target) => fieldNodes.includes(target)),
              )
              .map(provenanceOf),
          ),
        };
        steps.push({
          index: index++,
          role,
          kind: 'action',
          origin: 'verified-workflow',
          proposition,
          provenance: proposition.provenance,
        });
      }
      continue;
    }

    const entries = (byRole.get(role) ?? []).sort((a, b) =>
      compareStrings(a.target.nodeId, b.target.nodeId),
    );
    for (const candidate of entries) {
      const proposition = propositionForStep(
        role,
        candidate.claim,
        candidate.target,
        labels,
        object,
        fieldNodes,
      );
      if (proposition === undefined || realiseInstruction(proposition) === undefined) {
        accounting.push({
          claimId: candidate.claim.id,
          subjectRef: candidate.claim.assertion?.subjectRef ?? '',
          outcome: 'dropped',
          reason: 'UNSUPPORTED_PRESENTATION',
          detail: 'The control resolved, but nothing about it could be phrased as an instruction.',
          targetNodeId: candidate.target.nodeId,
        });
        continue;
      }
      accounting.push({
        claimId: candidate.claim.id,
        subjectRef: candidate.claim.assertion?.subjectRef ?? '',
        outcome: 'emitted',
        targetNodeId: candidate.target.nodeId,
      });
      steps.push({
        index: index++,
        role,
        kind: isActionProposition(proposition) ? 'action' : 'informational',
        origin: originOf(candidate.claim),
        proposition,
        provenance: proposition.provenance,
      });
    }
  }

  if (steps.length > 0 && !steps.some((step) => step.kind === 'action')) {
    diagnostics.push({
      code: 'NO_WORKFLOW_ORDER',
      detail:
        'Every step for this feature describes structure rather than an action, so the guide has nothing procedural to offer.',
    });
  }

  return steps;
}

/** Which kind of verified claim produced a step. */
function originOf(claim: ProductClaim): StepOrigin {
  if (claim.type === 'workflow_step') return 'verified-workflow';
  if (claim.type === 'navigation') return 'verified-navigation';
  if (claim.assertion?.action === 'submit') return 'verified-submit';
  return 'verified-capability';
}

function propositionForStep(
  role: WorkflowRole,
  claim: ProductClaim,
  target: WorkflowActionTarget,
  labels: LabelIndex,
  object: string | undefined,
  fieldNodes: readonly string[],
): GuidanceProposition | undefined {
  // Provenance carries the claim, the control it resolved to, and the evidence
  // behind it — the resolution is part of how the sentence came to exist, and a
  // reader tracing it back should not have to guess which button was meant.
  const provenance = mergeProvenance(provenanceOf(claim), { claims: [], facts: [target.nodeId] });
  const nodeId = target.nodeId;
  const label = target.label ?? labels.label(nodeId);

  switch (role) {
    case 'entry':
      return label === undefined ? undefined : { kind: 'navigate', destination: label, provenance };
    case 'trigger':
      return label === undefined
        ? undefined
        : {
            kind: 'perform_action',
            ...(claim.assertion?.action === undefined ? {} : { action: claim.assertion.action }),
            ...(object === undefined ? {} : { object }),
            control: label,
            provenance,
          };
    case 'input': {
      const fields = collectFields(fieldNodes, labels);
      if (fields.length === 0) return undefined;
      return {
        kind: 'enter_fields',
        fields,
        ...(object === undefined ? {} : { object }),
        provenance,
      };
    }
    case 'confirmation':
      return label === undefined
        ? undefined
        : {
            kind: 'confirm_action',
            control: label,
            ...(claim.assertion?.action === undefined ? {} : { action: claim.assertion.action }),
            ...(object === undefined ? {} : { object }),
            provenance,
          };
    case 'container':
      // A dialog appearing is not something the user does. It is kept as
      // context only when it can be named from a label the user can see.
      return label === undefined || label.origin !== 'ui-label'
        ? undefined
        : { kind: 'open_container', container: label, provenance };
    case 'result':
      return undefined;
  }
}

/**
 * The fields of a form, named and de-duplicated.
 *
 * A field's own name is allowed to come from its identifier. Naming a field is
 * not the same as inventing a verb: `clients.create-dialog.email` *is* the
 * email box, and the alternative — dropping the step because a `TextField`
 * carries no visible label — leaves a form with no instruction at all. The
 * names are never quoted, because they are not text on screen.
 */
function collectFields(fieldNodes: readonly string[], labels: LabelIndex): HumanLabel[] {
  const seen = new Set<string>();
  const fields: HumanLabel[] = [];
  for (const field of [...fieldNodes].sort(compareStrings)) {
    const visible = labels.label(field);
    const text = visible?.origin === 'ui-label' ? visible.text : fieldNoun(field);
    if (text.length === 0 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    fields.push({
      text,
      origin: visible?.origin === 'ui-label' ? 'ui-label' : 'normalised-identifier',
      nodeId: field,
    });
  }

  // A lone field with no visible label is not named.
  //
  // Where several unlabelled inputs sit in a form, their identifier segments
  // are genuinely the names of what goes in them — `name`, `email`, `plan` — and
  // listing them helps. A single one is different: the segment names what the
  // box is *for* rather than what to type in it, which is how `clients.search`
  // produced "Enter the client's search". The distinction is structural rather
  // than a judgement about the words, and where it cannot be made the step is
  // omitted instead of guessed at.
  const named = fields.filter((field) => field.origin === 'ui-label');
  if (named.length === 0 && fields.length === 1) return [];
  return fields;
}

/**
 * The screen this feature sits on.
 *
 * A user following a guide has to be in the right place before step one makes
 * sense, and "Open Clients." is the step that gets them there. It is drawn from
 * the graph's containment ancestry rather than from a claim, because a route
 * above a feature is *context* — ADR 0010 permits citing it and forbids it from
 * proving a capability, which is exactly the distinction being used here.
 */
function entryScreen(
  feature: ProductFeature,
  candidate: FeatureCandidate,
  graph: ApplicationGraph,
  labels: LabelIndex,
  diagnostics: GuidanceDiagnostic[],
): { label: HumanLabel; nodeId: string } | undefined {
  // 1. A route the feature itself records — but only when it records exactly
  //    one. `invoices.list.*` declares both `/invoices` and `/clients/:clientId`
  //    because the list component is rendered on both screens, and taking the
  //    first told users to open the client detail page to clear an invoice
  //    selection. Sorted-first is sorted-first wherever it is written.
  const declaredRoutes = feature.routes ?? [];
  if (declaredRoutes.length === 1) {
    const declared = declaredRoutes[0]!;
    const found = labels.label(`route:${declared}`);
    if (found !== undefined) return { label: found, nodeId: `route:${declared}` };
  }
  if (declaredRoutes.length > 1) {
    diagnostics.push({
      code: 'ENTRY_ROUTE_AMBIGUOUS',
      detail: `This feature appears on ${declaredRoutes.length} screens (${[...declaredRoutes].sort(compareStrings).join(', ')}), so none is named as the place to start.`,
      subject: feature.id,
    });
    return undefined;
  }

  // 2. Otherwise: up from a root to the component holding it, then to the routes
  //    rendering that component. Upward only, never back down into siblings.
  const roots = candidate.rootNodes;
  const containers = graph.relationships
    .filter((edge) => edge.type === 'contains' && roots.includes(edge.target))
    .map((edge) => edge.source);

  const routes = new Set<string>();
  for (const container of containers) {
    for (const edge of graph.relationships) {
      if (edge.type !== 'renders') continue;
      if (edge.target !== container) continue;
      if (!edge.source.startsWith('route:')) continue;
      routes.add(edge.source);
    }
  }

  if (routes.size === 1) {
    const nodeId = [...routes][0]!;
    const found = labels.label(nodeId);
    return found === undefined ? undefined : { label: found, nodeId };
  }

  if (routes.size > 1) {
    // Refused, not guessed. This resolver used to take the first match in sort
    // order, and `InvoiceList` is rendered by both the invoices page and the
    // client detail page — so two invoice features instructed users to "Open
    // Client Detail". A route that merely *can* host a component is not the
    // route a feature lives on, and namespace similarity is a hint rather than
    // evidence: acting on it would be the suffix-matching this layer refuses
    // everywhere else.
    diagnostics.push({
      code: 'ENTRY_ROUTE_AMBIGUOUS',
      detail: `More than one route renders the component holding this feature (${[...routes].sort(compareStrings).join(', ')}), so no screen is named. Naming one would mean choosing by sort order.`,
      subject: feature.id,
    });
    return undefined;
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Language claims
// ---------------------------------------------------------------------------

/**
 * A purpose sentence, but only where it does not smuggle in a new fact.
 *
 * A grounded purpose may explain *why* something exists. It may not tell a user
 * what the application does, because a purpose was never checked against the
 * graph: a button reading `Rotate API key` does not establish that the old key
 * stops working. Where a purpose asserts an effect no factual claim supports,
 * it is withheld and the reason is recorded.
 */
function purposeFrom(
  language: readonly ProductClaim[],
  factual: readonly ProductClaim[],
  diagnostics: GuidanceDiagnostic[],
): { text: string; provenance: GuidanceProvenance } | undefined {
  const purpose = language.find((claim) => claim.type === 'purpose');
  if (purpose === undefined) return undefined;

  if (factual.length === 0) {
    diagnostics.push({
      code: 'LANGUAGE_CLAIM_UNSUPPORTED',
      detail:
        'A purpose was generated for a feature with no verified factual claim. It is withheld rather than rendered, because nothing checks whether it is true.',
      subject: purpose.id,
    });
    return undefined;
  }

  return { text: purpose.text, provenance: provenanceOf(purpose) };
}

/** Questions about user intent, minus the ones about our own vocabulary. */
function compileQuestions(
  language: readonly ProductClaim[],
  diagnostics: GuidanceDiagnostic[],
): GuidanceQuestion[] {
  const kept: GuidanceQuestion[] = [];
  const seen = new Set<string>();

  for (const claim of language) {
    if (claim.type !== 'user_question') continue;
    const text = claim.text.trim();

    if (mentionsIdentifier(text)) {
      diagnostics.push({
        code: 'QUESTION_DISCARDED_AS_TECHNICAL',
        detail: 'The question names an internal identifier rather than something a user would say.',
        subject: claim.id,
      });
      continue;
    }

    const fingerprint = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    kept.push({ text, provenance: provenanceOf(claim) });
  }
  return kept;
}

/** True when a sentence contains something shaped like a semantic id. */
export function mentionsIdentifier(text: string): boolean {
  return /\b[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,}\b/.test(text);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function controlFor(claim: ProductClaim, labels: LabelIndex): HumanLabel | undefined {
  const subject = claim.assertion?.subjectRef;
  if (subject === undefined) return undefined;
  const found = labels.label(subject);
  return found?.origin === 'ui-label' ? found : undefined;
}

function destinationFor(claim: ProductClaim, labels: LabelIndex): HumanLabel | undefined {
  const route = claim.assertion?.route;
  if (route !== undefined) {
    const node = labels.label(`route:${route}`);
    if (node !== undefined) return node;
  }
  for (const target of claim.assertion?.targets ?? []) {
    if (!target.startsWith('route:')) continue;
    const found = labels.label(target);
    if (found !== undefined) return found;
  }
  return undefined;
}

function permissionFrom(claim: ProductClaim): string | undefined {
  const target = (claim.assertion?.targets ?? []).find((entry) => entry.startsWith('permission:'));
  return target?.slice('permission:'.length);
}

/** How to describe what a permission gates, without naming the permission. */
function capabilityPhrase(
  capabilities: readonly GuidanceProposition[],
  object: string,
): string | undefined {
  // The first capability that actually names an action. A control-only
  // proposition says which button is pressed and not what it accomplishes, so
  // it cannot describe what a permission gates.
  const first = capabilities.find(
    (entry) => entry.kind === 'perform_action' && entry.action !== undefined,
  );
  if (first === undefined || first.kind !== 'perform_action' || first.action === undefined) {
    return undefined;
  }
  return `${ACTION_VERBS[first.action] ?? first.action} ${article(object)}`;
}

const ACTION_VERBS: Partial<Record<string, string>> = {
  create: 'create',
  view: 'view',
  update: 'change',
  delete: 'delete',
  submit: 'submit',
  navigate: 'open',
  search: 'search',
  export: 'export',
  import: 'import',
  send: 'send',
};

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

// ---------------------------------------------------------------------------
// Completeness
// ---------------------------------------------------------------------------

/**
 * How far a guide takes a reader.
 *
 * `ACTIONABLE` now means a task action, not any step at all. The previous
 * definition counted the synthesised `Open Clients.` — so eleven features were
 * classified as offering the user something to do, and an independent reviewer
 * scored them 1.18 on average. A metric that flatters the output is worse than
 * no metric, because it is the thing you check the output against.
 */
function completenessOf(document: GuidanceDocument): GuidanceCompleteness {
  const taskSteps = document.steps.filter(
    (step) => step.kind === 'action' && step.origin !== 'synthetic-entry',
  );
  const hasEntry = document.steps.some((step) => step.origin === 'synthetic-entry');
  const hasExplanation = document.purpose !== undefined || document.summary !== undefined;

  if (taskSteps.length === 0) {
    if (hasEntry) return 'ENTRY_ONLY';
    if (hasExplanation) return 'DESCRIPTIVE';
    if (document.questions.length > 0) return 'IDENTIFICATION_ONLY';
    return document.title.origin === 'normalised-identifier' ? 'EMPTY' : 'IDENTIFICATION_ONLY';
  }
  if (hasExplanation && document.conditions.length > 0) return 'COMPLETE';
  return 'ACTIONABLE';
}

/**
 * How far the steps carry the task itself.
 *
 * Separate from completeness because they answer different questions: one is
 * about how much the guide says, the other about whether a reader who follows
 * it finishes. A feature can be `COMPLETE` — purpose, action, condition — and
 * still stop before the button that commits the change.
 */
function taskCompletionOf(steps: readonly GuidanceStep[]): TaskCompletion {
  if (steps.length === 0) return 'NO_TASK';
  const task = steps.filter((step) => step.kind === 'action' && step.origin !== 'synthetic-entry');
  if (task.length === 0) return 'ENTRY_ONLY';

  // A task ends where the graph says it ends: at the control that commits it.
  // Not at the deepest node, and not at the last one in the list — neither of
  // those is a fact about what a user finished doing.
  const terminal = task.some(
    (step) => step.role === 'confirmation' || step.origin === 'verified-submit',
  );
  const hasEntry = steps.some((step) => step.origin === 'synthetic-entry');
  if (!terminal) return 'PARTIAL';
  return hasEntry && task.length > 1 ? 'COMPLETE_PATH' : 'TERMINAL_ACTION_REACHED';
}

export { mergeProvenance, EMPTY_PROVENANCE };
