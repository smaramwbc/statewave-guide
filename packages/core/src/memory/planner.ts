/**
 * Deciding how to show something that has already been decided.
 *
 * The planner runs after the verified response and never touches it. It changes
 * what is collapsed, what is emphasised, and whether one short closed sentence
 * appears — and it cannot change a fact, remove a step, add an action, or answer
 * a question the evidence refused.
 *
 * That boundary is structural rather than careful: the planner is handed a
 * response and returns a *plan*, so there is no code path by which it could
 * rewrite an answer even if it wanted to. The original stays inspectable beside
 * the plan, which is what makes "the facts did not move" checkable rather than
 * promised.
 *
 * ## It says nothing
 *
 * It used to say "You've completed this guide before." against a recorded
 * completion — true, derived correctly, and an announcement that the software
 * was being clever. An independent review called it over-explicit, and the fold
 * itself, with its "Show full steps (3)" control, is the adaptation. A guide
 * should be adaptive without being self-conscious about it, so the sentence is
 * gone and the behaviour it narrated is not.
 *
 * ## An adaptation that changes nothing is not an adaptation
 *
 * Memory can propose something the presentation already does. Three Show me
 * presses suggest emphasising Show me, on a panel where Show me is already the
 * primary action — so the proposal is honoured, and nothing moves. That is
 * `ALREADY_SATISFIED`, and reporting it as `APPLIED` would be the software
 * congratulating itself for a no-op.
 *
 * Deciding that honestly means knowing what the panel does *without* a plan, and
 * that rule used to live in JSX where nothing here could see it —
 * `neutralPresentationPlan` has no emphasis to compare against, so a plan-versus-plan
 * comparison would have called every emphasis a change. {@link resolvePresentation}
 * lifts the renderer's first-paint rules into one function that both the panel
 * and the classifier read, so the comparison is against what a person would
 * actually have seen.
 *
 * @packageDocumentation
 */

import type { GuideQueryResponse } from '../query/contract.js';
import type { GuideMemoryProfile } from './profile.js';
import { hasCompletedGuide } from './profile.js';

/**
 * The closed set of things memory is allowed to put on screen.
 *
 * Identifiers rather than strings, so the words live in one place and a gate can
 * check that nothing else ever reaches a user. Closed Loop #18 learned this
 * about contextual sentences; the same rule applies to anything memory writes.
 */
export type GuideMetaCopyId = 'SHOW_FULL_STEPS' | 'PREFERENCE_APPLIED';

/**
 * Frozen, because the type system stops at compile time.
 *
 * These four strings are the only words memory may put on a screen, and the
 * panel reads them by property at render time. An audit overwrote one with
 * arbitrary text and watched it render verbatim while the gate — which checked
 * the table's *size* — stayed green.
 */
export const GUIDE_META_COPY: Readonly<Record<GuideMetaCopyId, string>> = Object.freeze({
  SHOW_FULL_STEPS: 'Show full steps',
  PREFERENCE_APPLIED: 'Matching your answer detail preference',
});

/**
 * Words this layer used to say and no longer does.
 *
 * Kept as a list rather than deleted from history, because a gate can assert
 * that none of them reach a screen — and because the reason each one went is
 * worth more than the string was.
 *
 * `COMPLETED_BEFORE` announced a completion the fold already implies.
 * `BASED_ON_PREVIOUS_USE` existed only to make a derived emphasis visible, which
 * is manufacturing the effect the emphasis was supposed to have.
 */
export const RETIRED_META_COPY: readonly string[] = Object.freeze([
  "You've completed this guide before.",
  'Based on how you have used Guide before',
]);

/** The three things a plan is allowed to be about. */
export type GuideAdaptationDimension = 'STEPS_COLLAPSED' | 'ASSISTANCE_EMPHASIS' | 'META_COPY';

/**
 * What became of something memory proposed.
 *
 * `APPLIED` is reserved for a proposal that changed what a person would see, in
 * the dimension the proposal controls. `ALREADY_SATISFIED` is the honest name
 * for a proposal the presentation was already doing. `REFUSED` is a proposal
 * this layer would not carry out at all.
 *
 * The distinction has teeth because the alternative — treating an internal state
 * change as an adaptation — is how a system comes to report three adaptations
 * over two byte-identical screenshots.
 */
export type GuideAdaptationOutcome = 'APPLIED' | 'ALREADY_SATISFIED' | 'REFUSED';

/** Why a plan looks the way it does, in terms a developer can audit. */
export interface GuideAdaptationReason {
  adaptation: GuideAdaptationDimension;
  because:
    | 'EXPLICIT_PREFERENCE_CONCISE'
    | 'EXPLICIT_PREFERENCE_FULL'
    | 'EXPLICIT_PREFERENCE_MODE'
    | 'OBSERVED_COMPLETION'
    | 'OBSERVED_PATTERN';
  authority: 'EXPLICIT_USER_PREFERENCE' | 'OBSERVED_INTERACTION' | 'DERIVED_ADAPTATION';
  featureId?: string;
}

/** Something memory proposed and the planner would not do. */
export interface GuideAdaptationRefusal {
  wanted: string;
  because: string;
}

/**
 * What the panel paints on first sight of an answer, as data.
 *
 * The panel's own rules, lifted out of JSX so that something other than a
 * browser can read them. Two of the three fields used to have their base in the
 * plan and the third — which action is visually primary — had it in a JSX
 * expression, which meant the only honest comparison could not be made in core.
 *
 * First paint, deliberately. Expanding the steps or starting to step through
 * changes what is on screen and is the *user* doing something, not memory.
 */
export interface ResolvedGuidePresentation {
  /** The steps are listed out. */
  stepsVisible: boolean;
  /** The control that unfolds them is offered. */
  expandControlVisible: boolean;
  /** Which action carries the primary treatment. */
  primaryAction: 'SHOW_ME' | 'STEP_THROUGH' | 'NONE';
  /** Copy that renders a line of its own. A control's label is not one. */
  notes: readonly GuideMetaCopyId[];
}

/**
 * What a response plus a plan actually looks like.
 *
 * The panel derives its first paint from this, and {@link classifyAdaptations}
 * compares two of them. Sharing the function is the point: a planner that
 * predicts the renderer's behaviour is a planner that will one day be wrong
 * about it, and being wrong here means claiming a person saw something change.
 */
export function resolvePresentation(
  response: GuideQueryResponse,
  plan: GuidePresentationPlan,
): ResolvedGuidePresentation {
  const steps = response.answer?.steps ?? [];
  const collapsed = plan.stepsCollapsed && steps.length > 0;
  // Which buttons the panel actually renders. An emphasis naming a control that
  // is not on screen is not a presentation state — an audit found
  // `STEP_THROUGH primary` reported for an answer with one step, where the panel
  // renders no Step through at all.
  const showMeRendered = response.actions.length > 0;
  const stepThroughRendered = steps.length > 1;
  const emphasised =
    plan.emphasisedAction === 'SHOW_ME' && showMeRendered
      ? 'SHOW_ME'
      : plan.emphasisedAction === 'STEP_THROUGH' && stepThroughRendered
        ? 'STEP_THROUGH'
        : undefined;
  return {
    stepsVisible: steps.length > 0 && !collapsed,
    expandControlVisible: collapsed,
    primaryAction: emphasised ?? (showMeRendered && stepThroughRendered ? 'SHOW_ME' : 'NONE'),
    // `SHOW_FULL_STEPS` is the expand control's label, not a line of copy. Left
    // in, it would report that a sentence appeared whenever the steps folded —
    // counting one adaptation twice, under two names.
    notes: plan.metaCopy.filter((id) => id !== 'SHOW_FULL_STEPS'),
  };
}

/** One thing memory proposed, and what a person got. */
export interface GuideAdaptationRecord {
  dimension: GuideAdaptationDimension;
  outcome: GuideAdaptationOutcome;
  /** The base value in this dimension, with no memory at all. */
  base: string;
  /** The value after the plan was applied. */
  result: string;
  /** Why memory wanted it, or why it was refused. */
  because: string;
  authority?: GuideAdaptationReason['authority'];
  featureId?: string;
}

/** How a dimension reads in an accounting table. */
function dimensionValues(
  dimension: GuideAdaptationDimension,
  presentation: ResolvedGuidePresentation,
): string {
  switch (dimension) {
    case 'STEPS_COLLAPSED':
      // Three states, not two. An answer with no steps has none to list and none
      // to fold, and calling that "folded behind a control" described a control
      // the panel does not render.
      return presentation.stepsVisible
        ? 'steps listed'
        : presentation.expandControlVisible
          ? 'steps folded behind a control'
          : 'no steps';
    case 'ASSISTANCE_EMPHASIS':
      return presentation.primaryAction === 'NONE'
        ? 'no primary action'
        : `${presentation.primaryAction} primary`;
    default:
      return presentation.notes.length === 0 ? 'no note' : presentation.notes.join(', ');
  }
}

/**
 * Account for every adaptation, against what a person would otherwise have seen.
 *
 * The base is not `neutralPresentationPlan` — that is the memory-off *plan*, and
 * the memory-off *presentation* of a three-step answer already makes Show me
 * primary. Comparing plans would report a change where a screenshot shows none,
 * which is exactly the defect this exists to close.
 */
export function classifyAdaptations(input: {
  response: GuideQueryResponse;
  plan: GuidePresentationPlan;
  reasons: readonly GuideAdaptationReason[];
  refusals: readonly GuideAdaptationRefusal[];
}): readonly GuideAdaptationRecord[] {
  const { response, plan, reasons, refusals } = input;
  const base = resolvePresentation(response, neutralPresentationPlan(response));
  const result = resolvePresentation(response, plan);

  const records: GuideAdaptationRecord[] = [];
  for (const reason of reasons) {
    const baseValue = dimensionValues(reason.adaptation, base);
    const resultValue = dimensionValues(reason.adaptation, result);
    records.push({
      dimension: reason.adaptation,
      outcome: baseValue === resultValue ? 'ALREADY_SATISFIED' : 'APPLIED',
      base: baseValue,
      result: resultValue,
      because: reason.because,
      authority: reason.authority,
      ...(reason.featureId === undefined ? {} : { featureId: reason.featureId }),
    });
  }
  for (const refusal of refusals) {
    // A refusal names what it would not do; the dimension follows from that
    // rather than from a second field somebody could set inconsistently.
    const dimension: GuideAdaptationDimension = refusal.wanted.includes('collapse')
      ? 'STEPS_COLLAPSED'
      : 'ASSISTANCE_EMPHASIS';
    records.push({
      dimension,
      outcome: 'REFUSED',
      base: dimensionValues(dimension, base),
      result: dimensionValues(dimension, result),
      because: refusal.because,
    });
  }
  return records;
}

/** Did anything memory did change what a person would see? */
export function hasVisibleAdaptation(records: readonly GuideAdaptationRecord[]): boolean {
  return records.some((record) => record.outcome === 'APPLIED');
}

/**
 * How to present a response. Never what it says.
 *
 * `stepsCollapsed` hides steps behind a control; it never removes them, and
 * `stepCount` is carried so a renderer cannot quietly show fewer than exist.
 */
export interface GuidePresentationPlan {
  /** Steps start folded. Every one of them remains reachable. */
  stepsCollapsed: boolean;
  /** How many steps there are, whatever the collapse state. */
  stepCount: number;
  /** Which safe action, if any, is visually primary. Never which ones exist. */
  emphasisedAction?: 'SHOW_ME' | 'STEP_THROUGH';
  /** Closed copy ids, resolved to text by the renderer. */
  metaCopy: readonly GuideMetaCopyId[];
  reasons: readonly GuideAdaptationReason[];
  refusals: readonly GuideAdaptationRefusal[];
  /**
   * What became of each thing memory proposed, measured against what a person
   * would have seen with no memory at all.
   *
   * Read this rather than counting `reasons`. A reason says memory wanted
   * something; a record says whether anybody could tell.
   */
  adaptations: readonly GuideAdaptationRecord[];
  /**
   * The plan carries no adaptation of its own.
   *
   * A structural claim about the plan object, not a promise about pixels — a
   * plan can be `neutral: false` and still render identically, which is what
   * `adaptations` is for. It is also not byte-identity with
   * {@link neutralPresentationPlan}: a plan that refused to collapse anything is
   * neutral and carries a refusal saying so.
   */
  neutral: boolean;
}

/** The plan that changes nothing, used whenever memory is off, empty or broken. */
export function neutralPresentationPlan(response: GuideQueryResponse): GuidePresentationPlan {
  return {
    stepsCollapsed: false,
    stepCount: response.answer?.steps.length ?? 0,
    metaCopy: [],
    reasons: [],
    refusals: [],
    adaptations: [],
    neutral: true,
  };
}

/**
 * Plan the presentation of a verified response.
 *
 * Deterministic: same response, same profile, same plan. No clock is read and
 * nothing is random, because a personalised interface that changes when nothing
 * changed is indistinguishable from a broken one.
 */
export function planPresentation(input: {
  response: GuideQueryResponse;
  profile: GuideMemoryProfile | undefined;
  /** Off by default. A host that has not asked for memory does not get it. */
  enabled: boolean;
}): GuidePresentationPlan {
  const { response, profile, enabled } = input;
  const base = neutralPresentationPlan(response);
  if (!enabled || profile === undefined) return base;

  const reasons: GuideAdaptationReason[] = [];
  const refusals: GuideAdaptationRefusal[] = [];
  const metaCopy: GuideMetaCopyId[] = [];

  const featureId = response.featureId;
  const steps = response.answer?.steps ?? [];

  // --- what the user asked for, before what was inferred about them ---------
  const detail = profile.explicitPreferences.guidanceDetail ?? 'AUTO';
  const mode = profile.explicitPreferences.assistanceMode ?? 'AUTO';

  let stepsCollapsed = false;

  if (detail === 'FULL') {
    // An explicit request for everything ends the discussion. A derived pattern
    // does not get to overrule somebody who said what they wanted.
    //
    // A refusal only, and no reason: an audit found this branch recording
    // `adaptation: STEPS_COLLAPSED` on a plan whose `stepsCollapsed` is false —
    // an audit trail claiming something happened that did not.
    refusals.push({
      wanted: 'collapse the steps',
      because: 'the user explicitly asked for full detail',
    });
  } else if (detail === 'CONCISE' && steps.length > 0) {
    stepsCollapsed = true;
    metaCopy.push('SHOW_FULL_STEPS', 'PREFERENCE_APPLIED');
    reasons.push({
      adaptation: 'STEPS_COLLAPSED',
      because: 'EXPLICIT_PREFERENCE_CONCISE',
      authority: 'EXPLICIT_USER_PREFERENCE',
    });
    // The line itself needs its own row in the accounting. This branch renders a
    // sentence and recorded only the fold, so a widened gate found a note
    // reaching the screen that nothing was answerable for.
    reasons.push({
      adaptation: 'META_COPY',
      because: 'EXPLICIT_PREFERENCE_CONCISE',
      authority: 'EXPLICIT_USER_PREFERENCE',
    });
  } else if (featureId !== undefined && steps.length > 0 && hasCompletedGuide(profile, featureId)) {
    // The only inference that may collapse anything, and it rests on an
    // observation that exactly matches the sentence it licenses.
    // The fold, and nothing said about it. A returning user gets a shorter
    // answer with the full steps one click away; being told the software
    // remembers them is the software talking about itself.
    stepsCollapsed = true;
    metaCopy.push('SHOW_FULL_STEPS');
    reasons.push({
      adaptation: 'STEPS_COLLAPSED',
      because: 'OBSERVED_COMPLETION',
      authority: 'OBSERVED_INTERACTION',
      featureId,
    });
  }

  // --- which assistance is visually first ----------------------------------
  let emphasisedAction: GuidePresentationPlan['emphasisedAction'];
  const offered = new Set(response.actions.map((action) => action.kind));
  const canEmphasiseShowMe = offered.has('highlight') || offered.has('scroll');

  if (mode === 'SHOW_ME' && canEmphasiseShowMe) {
    emphasisedAction = 'SHOW_ME';
    reasons.push({
      adaptation: 'ASSISTANCE_EMPHASIS',
      because: 'EXPLICIT_PREFERENCE_MODE',
      authority: 'EXPLICIT_USER_PREFERENCE',
    });
  } else if (mode === 'STEP_THROUGH' && steps.length > 1) {
    emphasisedAction = 'STEP_THROUGH';
    reasons.push({
      adaptation: 'ASSISTANCE_EMPHASIS',
      because: 'EXPLICIT_PREFERENCE_MODE',
      authority: 'EXPLICIT_USER_PREFERENCE',
    });
  } else if (mode === 'AUTO') {
    const hint = profile.interactionPatterns.preferredAssistanceModeHint;
    // No accompanying sentence on either branch. The line that used to appear
    // here existed to make a derived emphasis visible, which is the wrong way
    // round: if the emphasis is invisible then it changed nothing, and the
    // honest report is ALREADY_SATISFIED rather than a caption explaining that
    // something happened.
    if (hint === 'SHOW_ME' && canEmphasiseShowMe) {
      emphasisedAction = 'SHOW_ME';
      reasons.push({
        adaptation: 'ASSISTANCE_EMPHASIS',
        because: 'OBSERVED_PATTERN',
        authority: 'DERIVED_ADAPTATION',
      });
    } else if (hint === 'STEP_THROUGH' && steps.length > 1) {
      emphasisedAction = 'STEP_THROUGH';
      reasons.push({
        adaptation: 'ASSISTANCE_EMPHASIS',
        because: 'OBSERVED_PATTERN',
        authority: 'DERIVED_ADAPTATION',
      });
    }
  }

  // An emphasis that names an action the response does not offer would be
  // memory inventing an affordance. Refuse rather than render it.
  if (emphasisedAction === 'SHOW_ME' && !canEmphasiseShowMe) {
    refusals.push({
      wanted: 'emphasise Show me',
      because: 'this response offers no pointing action',
    });
    emphasisedAction = undefined;
  }

  // Nothing about a refused or unsupported answer is worth adapting. Collapsing
  // the steps of a refusal would be dressing up a "no" as a shortcut.
  if (response.answer === undefined || steps.length === 0) {
    if (stepsCollapsed) {
      refusals.push({ wanted: 'collapse the steps', because: 'this response has no steps' });
    }
    stepsCollapsed = false;
  }

  const neutral = !stepsCollapsed && emphasisedAction === undefined && metaCopy.length === 0;

  const plan: GuidePresentationPlan = {
    stepsCollapsed,
    stepCount: steps.length,
    ...(emphasisedAction === undefined ? {} : { emphasisedAction }),
    metaCopy: [...new Set(metaCopy)],
    reasons,
    refusals,
    adaptations: [],
    neutral,
  };
  return { ...plan, adaptations: classifyAdaptations({ response, plan, reasons, refusals }) };
}

/**
 * The response and how to show it, side by side.
 *
 * The verified core is carried unchanged so that "adaptation did not move a
 * fact" is something a test can compare rather than something a comment claims.
 */
export interface AdaptedGuideResponse {
  response: GuideQueryResponse;
  presentation: GuidePresentationPlan;
}
