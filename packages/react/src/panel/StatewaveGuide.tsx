/**
 * The guide, as a product surface somebody else can put in their application.
 *
 * Everything visible is configurable and nothing factual is. The theme decides
 * what it looks like; the query contract decides what it says, what it points
 * at, and what it refuses. There is no value in `theme`, `branding` or `layout`
 * that can reach the second set — asserted by a gate that runs every question
 * under several themes and compares the responses byte for byte.
 *
 * The layout follows the approved reference: a floating card, a status line
 * under the header, each question in a soft tinted bubble with a timestamp, each
 * answer as a bordered card with a sparkle mark, circular step numbers, iconed
 * action buttons, a composer with a square send control, and the attribution
 * centred at the foot. What is *in* the card is the compiled guidance and only
 * the compiled guidance — the reference's own copy was illustrative, and a
 * component that rendered it would be inventing product facts.
 *
 * Presentation hierarchy, not editing. Where guidance holds both *"Lets you
 * create a new client."* and *"You can create a new client using "New
 * client"."*, the purpose leads and a near-restatement is not shown, by the
 * deterministic rule in `isRedundantSummary`. Nothing is rewritten; both remain
 * in the response for anything that wants them.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from 'react';
import type {
  ContextualSentenceForm,
  GuideMemoryEventKind,
  GuidePresentationPlan,
  GuideQueryResponse,
  GuideSafeAction,
} from '@statewavedev/guide-core';
import {
  GUIDE_META_COPY,
  neutralPresentationPlan,
  resolvePresentation,
} from '@statewavedev/guide-core';
import { GUIDE_CSS, GUIDE_STYLE_ID } from '../theme/styles.js';
import { resolveTheme, themeToCssVariables } from '../theme/resolve.js';
import type { GuideThemeInput, ThemeIssue } from '../theme/resolve.js';
import {
  ATTRIBUTION_PRODUCT,
  ATTRIBUTION_URL,
  defaultGuideLayout,
  resolveLayout,
} from '../theme/config.js';
import type { GuideBranding, GuideLayoutInput } from '../theme/config.js';
import {
  Alert,
  Check,
  Chevron,
  Close,
  Dots,
  Info,
  ListIcon,
  Paperclip,
  Play,
  Send,
  Sparkle,
  Spinner,
} from '../theme/icons.js';
import { emptySession, withAnswer, withQuestion } from './session.js';
import type { GuideSession } from './session.js';
import type { GuideStepInteraction } from '../step-interaction.js';
import type { GuideMemoryWriteOutcome } from '../memory/use-guide-memory.js';
import { useShowMe } from './use-show-me.js';
import type { SafeActionOutcome } from '../use-guide-query.js';

/** What {@link StatewaveGuide} needs. */
export interface StatewaveGuideProps {
  ask(query: string, options?: { developer?: boolean }): GuideQueryResponse;
  execute(action: GuideSafeAction): Promise<SafeActionOutcome>;
  open: boolean;
  onClose(): void;
  theme?: GuideThemeInput;
  branding?: GuideBranding;
  layout?: GuideLayoutInput;
  /** A supported name for where the user is. Omitted when none is authorised. */
  contextLabel?: string;
  /** Show the inspector. Development only; never defaults on. */
  developer?: boolean;
  /** Reports configuration that could not be honoured. Development aid. */
  onThemeIssues?: (issues: readonly ThemeIssue[]) => void;
  /** Injectable for tests. */
  document?: Document;
  /** Injectable for tests: forces the resolved appearance. */
  prefersDark?: boolean;
  /** Injectable for tests: a fixed clock for timestamps. */
  now?: () => Date;
  /**
   * The user picked one of the concrete things offered.
   *
   * The host holds this for the current interaction and hands it back through
   * context. The panel does not remember it, and nothing writes it down.
   */
  /**
   * Which contextual sentence form to render.
   *
   * Defaults to the richer one — the field showing "Search clients" above the
   * list — falling back to geometry alone when no runtime-visible text earned a
   * descriptor. A host that prefers the plainer sentence sets GEOMETRY_ONLY, and
   * Closed Loop #18 uses it to capture both without rebuilding the product.
   */
  contextualForm?: ContextualSentenceForm;
  /**
   * How to present a given response, from whatever the host remembers.
   *
   * A function rather than a value because each turn in the conversation is
   * planned against its own response. Absent means no memory, which renders
   * identically to a neutral plan.
   */
  presentationFor?: (response: GuideQueryResponse) => GuidePresentationPlan;
  /** Told when the user does something worth remembering. */
  onMemoryEvent?: (kind: GuideMemoryEventKind, input?: { featureId?: string }) => void;
  /**
   * The small memory surface, in the overflow menu.
   *
   * Deliberately not a dashboard. Two things a person might want — how much
   * detail they get, and a way to be forgotten — and neither belongs in the
   * conversation itself.
   */
  /**
   * What the memory layer is doing, for the developer inspector.
   *
   * Scope, counts and failures — never records, never another subject, and
   * never anything a store said went wrong in words a user would see.
   */
  /**
   * Removes the current highlight ring, if the host draws one.
   *
   * Wire it to `useGuide().clearHighlight`. Without it the panel can start a
   * pointer but never retract one — and a walkthrough that moves to a step
   * whose control is not on screen leaves the previous ring standing on the
   * wrong element, which is the panel claiming something it cannot see.
   */
  clearPointer?: () => void;
  /**
   * Watching for, and taking, the interaction a step describes.
   *
   * Absent — the default — means the panel does neither, which is how every
   * release before this one behaved. Supply
   * `createStepInteraction(registry)` to opt in. What the guide is then
   * permitted to press is not this object's decision: the query contract
   * settles it per step, from what that step was compiled as.
   */
  stepInteraction?: GuideStepInteraction;
  memoryDiagnostics?: {
    enabled: boolean;
    scope: string;
    eventsRead: number;
    failures: number;
    lastFailure?: string;
    /**
     * How many records the store's retention policy declined to keep.
     *
     * Shown because otherwise the write counts read as a fault. A developer
     * watching events go in and a smaller number come out needs to see that a
     * policy did it deliberately, not that something is dropping their writes.
     */
    storeWithheldByPolicy?: number;
  };
  memory?: {
    guidanceDetail: 'AUTO' | 'CONCISE' | 'FULL';
    /**
     * Record the choice, and say whether it took.
     *
     * A returned promise is awaited and its outcome shown. A handler that
     * returns nothing is treated as done the moment it returns, which is the
     * most the panel can honestly claim about a write it cannot observe.
     */
    onSetDetail: (value: 'AUTO' | 'CONCISE' | 'FULL') => void | Promise<GuideMemoryWriteOutcome>;
    onReset: () => void | Promise<GuideMemoryWriteOutcome>;
  };
  onSelectInstance?: (ref: string) => void;
}

function useStyles(target: Document | undefined): void {
  useEffect(() => {
    const doc = target ?? (typeof document === 'undefined' ? undefined : document);
    if (doc === undefined || doc.getElementById(GUIDE_STYLE_ID) !== null) return;
    const style = doc.createElement('style');
    style.id = GUIDE_STYLE_ID;
    style.textContent = GUIDE_CSS;
    doc.head.append(style);
  }, [target]);
}

/**
 * Whether the summary says anything the purpose does not.
 *
 * Deterministic and conservative: a summary is suppressed only when the content
 * words of the purpose and title already cover it. This decides what is
 * *shown*, which is a presentation decision; nothing is rewritten or removed
 * from the response.
 */
export function isRedundantSummary(
  purpose: string | undefined,
  summary: string | undefined,
  title?: string,
): boolean {
  if (purpose === undefined || summary === undefined) return false;
  const words = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .replace(/["'.,!?]/g, ' ')
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 2 && !['you', 'can', 'the', 'lets', 'using', 'new'].includes(word),
        ),
    );
  const covered = new Set([...words(purpose), ...words(title ?? '')]);
  for (const word of words(summary)) if (!covered.has(word)) return false;
  return true;
}

function useMedia(query: string, target: Document | undefined, forced?: boolean): boolean {
  const [matches, setMatches] = useState(forced ?? false);
  useEffect(() => {
    if (forced !== undefined) {
      setMatches(forced);
      return;
    }
    const view = (target ?? (typeof document === 'undefined' ? undefined : document))?.defaultView;
    if (view === undefined || view === null) return;
    const list = view.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query, target, forced]);
  return matches;
}

/** `10:32 AM`, from a real clock. */
function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** The host's mark, rendered as data rather than as markup. */
function Brand({ branding }: { branding: GuideBranding | undefined }): ReactElement | null {
  if (branding === undefined) return null;
  const { productName, productLogo } = branding;
  if (productName === undefined && productLogo === undefined) return null;
  const initial = (productName ?? '').trim().charAt(0).toUpperCase();
  return (
    <>
      <div className="sw-guide__brand">
        {typeof productLogo === 'string' ? (
          <img className="sw-guide__logo" src={productLogo} alt="" aria-hidden="true" />
        ) : productLogo !== undefined ? (
          (productLogo as ReactNode)
        ) : initial.length > 0 ? (
          <span className="sw-guide__logo sw-guide__logo--mark" aria-hidden="true">
            <Sparkle size={15} />
          </span>
        ) : null}
        {productName !== undefined && <span className="sw-guide__host">{productName}</span>}
        <span className="sw-guide__chevron" aria-hidden="true">
          <Chevron />
        </span>
      </div>
      <span className="sw-guide__divider" aria-hidden="true" />
    </>
  );
}

/** How long a finished menu action shows its tick before the menu closes. */
const MENU_CONFIRMATION_MS = 850;

/** How long the walkthrough says it has ended before going quiet again. */
const FINISHED_NOTE_MS = 4000;

/**
 * What a menu item is doing, to the eye.
 *
 * Three states and a live region. The spinner is not decoration — the two items
 * that matter here write to a store that may be across a network, and "did that
 * work?" was previously unanswerable from the screen. The failure state says so
 * out loud rather than closing the menu and hoping.
 */
function MenuStatus({ state }: { state?: 'RUNNING' | 'DONE' | 'FAILED' }): ReactElement | null {
  if (state === undefined) return null;
  const label = state === 'RUNNING' ? 'Working…' : state === 'DONE' ? 'Done' : 'That did not save';
  return (
    <span className="sw-guide__menu-status" data-kind={state.toLowerCase()} role="status">
      <span className="sw-guide__sr-only">{label}</span>
      {state === 'RUNNING' ? <Spinner /> : state === 'DONE' ? <Check /> : <Alert />}
    </span>
  );
}

/** One answer, rendered from exactly the fields that are present. */
function Answer(props: {
  response: GuideQueryResponse;
  onShowMe(actions: readonly GuideSafeAction[]): void;
  /** Retracts the pointer ring. Absent when the host draws none. */
  onClearPointer?: () => void;
  onSelectInstance?: (ref: string) => void;
  busy: boolean;
  pointing: boolean;
  note?: string;
  contextualForm?: ContextualSentenceForm;
  /**
   * How memory would like this shown. Never what it says.
   *
   * A neutral plan is the memory-off shape exactly, so a build with no memory
   * and a build whose memory is empty render the same pixels.
   */
  presentation?: GuidePresentationPlan;
  onMemoryEvent?: (kind: GuideMemoryEventKind, input?: { featureId?: string }) => void;
  /** Watching for, and taking, a step's interaction. Absent means neither. */
  stepInteraction?: GuideStepInteraction;
}): ReactElement {
  const { response } = props;
  // Both sentences arrive already verified. The default is the richer one, and
  // the choice is a prop because Closed Loop #18 has to capture both without
  // rebuilding the product between captures.
  const plan = props.presentation;
  // Steps start folded only when a plan says so, and unfolding is always one
  // click away. Nothing here can reduce how many steps exist — `plan.stepCount`
  // is carried precisely so a renderer showing fewer would be caught.
  const [expanded, setExpanded] = useState(false);
  const sentences = response.visualContext?.sentences;
  const contextualSentence =
    props.contextualForm === 'GEOMETRY_ONLY'
      ? sentences?.geometryOnly
      : (sentences?.withVisibleText ?? sentences?.geometryOnly);
  const answer = response.answer;
  const [stepIndex, setStepIndex] = useState<number | undefined>(undefined);
  const stepIndexRef = useRef<number | undefined>(undefined);
  // Read inside the drive loop, where a captured prop would be a stale one.
  const busyRef = useRef(props.busy);
  busyRef.current = props.busy;

  /**
   * The pointing actions the contract offers for one step, if any.
   *
   * Read, never built. The panel used to run the *response's* actions whatever
   * step you were on, so a walkthrough three steps in still highlighted step
   * one's button — which reads exactly like a guide that is stuck. The fix is
   * to point at the current step; deciding *what* pointing at it means is the
   * engine's, and a gate holds that line (ADR 0022).
   */
  const stepPointerActions = (index: number): readonly GuideSafeAction[] | undefined => {
    const actions = steps[index]?.actions;
    return actions !== undefined && actions.length > 0 ? actions : undefined;
  };

  /**
   * Move the walkthrough, and move the pointer with it — or retract it.
   *
   * The ring either points at the step the user is on, or it is gone. The
   * failure this exists to close: advancing to a step whose control is not on
   * screen yet (a dialog the user has not opened) used to leave the previous
   * ring standing, and the panel saying "Highlighted in the app" about the
   * wrong element. Now the attempt is made — the executor answers honestly if
   * the target is not there, the run's stop clears the ring, and the note says
   * "That is not on screen at the moment." instead of the ring lying.
   */
  const goToStep = (index: number | undefined, opening?: readonly GuideSafeAction[]): void => {
    // The ref is set synchronously, before React has re-rendered. `Show me`
    // drives the walkthrough by pressing a control and then reading where that
    // press left it, and `node.click()` dispatches synchronously — so the
    // answer has to be available before the next line of that loop runs.
    const leaving = stepIndexRef.current !== undefined && index === undefined;
    stepIndexRef.current = index;
    setStepIndex(index);

    // A walkthrough points. Both ways into one — Show me and Step through —
    // point at the first step, so being inside a walkthrough *is* the reader
    // having asked; there is no state where the panel is walking somebody
    // through something while the application sits unmarked.
    //
    // This used to be conditional on `props.pointing`, which is derived from
    // the last run's outcomes — so a single step whose control was not on
    // screen turned pointing off for the rest of the walkthrough, and every
    // later step went unmarked even once its control had mounted. The reader
    // was left exactly where the bug report found them: nothing happening, and
    // no way to tell why.
    if (index === undefined) {
      if (leaving) props.onClearPointer?.();
      return;
    }
    // `opening` is the response's own sequence, passed only when a walkthrough
    // is being started. The first step is often an entry step — "Open Clients."
    // — which names a route rather than a control and so offers nothing to
    // point at; the navigation for it lives on the response. Later steps get no
    // such fallback: a step that names nothing this feature owns is a step with
    // nothing to point at, and the ring comes down.
    // The navigation has to survive.
    //
    // `?? opening` was wrong in a way that only showed up on a feature living
    // on another screen: a step with its own pointing actions discarded the
    // opening sequence entirely, and the `navigate` inside it with them — so
    // "how do I create an invoice?" asked from /clients scrolled at a control
    // that was never going to be there and reported it as not on screen. The
    // step decides *what* to point at; the opening decides how to get to it.
    const own = stepPointerActions(index);
    const travel = (opening ?? []).filter((action) => action.kind === 'navigate');
    const actions = own === undefined ? opening : [...travel, ...own];
    if (actions === undefined || actions.length === 0) {
      props.onClearPointer?.();
      return;
    }
    props.onShowMe(actions);
  };
  const steps = answer?.steps ?? [];
  // One step is still a walkthrough. It used to require two, which left a
  // single-step answer — "where is Export CSV?" — with a ring on screen, no
  // progress, no way to put the ring down, and a Show me button that did the
  // same thing every time it was pressed. That was the reported dead end,
  // surviving in the one shape nobody had looked at.
  const stepping = stepIndex !== undefined && steps.length >= 1;

  /**
   * The step the user is on advances when the user does it.
   *
   * A walkthrough that has to be clicked twice — once in the application and
   * once in the panel — is a walkthrough that makes the reader do bookkeeping.
   * So while stepping, the control this step names is watched, and operating it
   * moves the walkthrough on.
   *
   * Watched only where operating the control *is* doing the step. A
   * `confirmation` is excluded for the same reason the guide will not press it
   * — but that is not this component's judgement to make, so it reads
   * `performance` and does not infer anything from the control itself. A
   * `TYPE` step is excluded because clicking a field is not filling it in, and
   * advancing there would march past work the user has not done.
   */
  const watched = stepIndex === undefined ? undefined : steps[stepIndex]?.performance;
  /**
   * The control to watch, which is not the same as the control to offer.
   *
   * Operating a button *is* doing the step, whoever operated it — so every
   * `PRESS` step is watched, including the one that commits the change. An
   * earlier version watched only the steps a guide was allowed to press, on the
   * reasoning that advancing past a commit would claim a task was finished
   * without evidence. That got it backwards: pressing "Create client" is
   * precisely the evidence. The guide may not *press* it (ADR 0035, unchanged);
   * noticing that somebody else did is not acting, it is paying attention.
   *
   * A `TYPE` step is still not watched. Clicking into a field is not filling it
   * in, and advancing there would march past work nobody did.
   */
  const watchedId = watched?.kind === 'PRESS' ? watched.semanticId : undefined;
  /**
   * The control the guide may press for this step, when a host supplied a way.
   *
   * The narrower half: offering to act needs the contract's permission, while
   * watching needs only that a press is what the step consists of.
   */
  const canPerform =
    props.stepInteraction === undefined || watched?.byGuide !== 'ALLOWED' ? undefined : watchedId;
  const [performing, setPerforming] = useState(false);
  const [justFinished, setJustFinished] = useState(false);

  /**
   * The one control that moves the walkthrough on, in one place.
   *
   * It used to be three buttons appearing and disappearing in the same row, so
   * the thing to press next slid sideways between steps — "Do it for me" in the
   * first slot, then nothing there and "Next" two places along. A reader
   * following a walkthrough with the mouse had to find it again every step.
   *
   * Now the slot is fixed and only its label changes, so the same spot advances
   * the whole way through. The keyboard gets the same thing for free: focus
   * lands here on every step, and a button already answers Enter and Space.
   */
  const advanceRef = useRef<HTMLButtonElement | null>(null);
  const onLastStep = stepIndex !== undefined && stepIndex === steps.length - 1;
  const completeWalkthrough = (): void => {
    goToStep(undefined);
    // Finishing in complete silence read as the guide having lost track. This
    // is about the walkthrough and nothing else — not about the product, and
    // not about the reader. It says a thing ended, which is the one fact the
    // panel is entitled to state about its own state.
    setJustFinished(true);
    setTimeout(() => setJustFinished(false), FINISHED_NOTE_MS);
    // The one interaction that licenses memory treating this feature as done.
    // Reaching the last step and pressing Done is the whole of the evidence;
    // nothing weaker counts. (The sentence that used to be shown for it is
    // retired, and `test:memory-completion-copy-restraint` keeps it out of this
    // file — including out of comments, so it is described rather than quoted.)
    props.onMemoryEvent?.('STEP_THROUGH_COMPLETED', {
      ...(response.featureId === undefined ? {} : { featureId: response.featureId }),
    });
  };
  const advance =
    canPerform !== undefined
      ? {
          label: 'Do it for me',
          testId: 'guide-step-perform',
          primary: true,
          run: () => {
            void (async () => {
              setPerforming(true);
              try {
                // Nothing is advanced here. Pressing the control fires the
                // click the walkthrough is already watching for, and that is
                // what moves the step — so a press by the guide and a press by
                // the user take exactly the same path. If the control has gone,
                // the walkthrough simply stays put.
                await props.stepInteraction?.press(canPerform);
              } finally {
                setPerforming(false);
              }
            })();
          },
        }
      : onLastStep
        ? {
            label: 'Done',
            testId: 'guide-step-done',
            // Quiet on purpose. The next move on the final step is the control
            // the ring is sitting on, not anything in this panel, and a primary
            // Done invites finishing a task nobody did.
            primary: false,
            run: completeWalkthrough,
          }
        : {
            label: 'Next',
            testId: 'guide-step-next',
            primary: true,
            run: () => goToStep((stepIndex ?? 0) + 1),
          };

  /**
   * Focus follows the walkthrough, unless somebody is typing in the application.
   *
   * The guard is the whole subtlety, and it has to be narrow in both
   * directions. One of these steps is "enter the client's billing email", and
   * taking the keyboard off a reader mid-word to put it on a Next button would
   * be the guide interrupting the work it just asked for. But the panel's own
   * composer is not somebody's work — it is where the question was typed, and
   * holding the keyboard there would mean the walkthrough the reader just
   * started could not be driven from the keys at all.
   *
   * So: an editable in the host keeps the keyboard. One inside the panel does
   * not.
   */
  useEffect(() => {
    if (!stepping) return;
    const button = advanceRef.current;
    if (button === null) return;
    const focused = button.ownerDocument.activeElement as HTMLElement | null;
    const editable =
      focused?.tagName === 'INPUT' ||
      focused?.tagName === 'TEXTAREA' ||
      focused?.isContentEditable === true;
    const panel = button.closest('.sw-guide');
    const insidePanel = focused !== null && panel !== null && panel.contains(focused);
    if (editable && !insidePanel) return;
    button.focus();
    // `performing` is a dependency because the advance is disabled while the
    // guide is pressing, and a disabled button cannot hold focus — the browser
    // drops it to the body. Without re-focusing when the press finishes, the
    // first key worked and the second went nowhere, which is the exact failure
    // this whole change exists to remove.
  }, [stepping, stepIndex, performing]);

  const observe = props.stepInteraction?.observe;
  useEffect(() => {
    if (!stepping || watchedId === undefined || observe === undefined) return;
    return observe(watchedId, () => {
      // The user got there first. Advance past the step they just did — through
      // `goToStep`, so the ring moves with the walkthrough exactly as it does
      // when the button in the panel is the one that was pressed.
      if (stepIndex === undefined) return;
      if (stepIndex < steps.length - 1) {
        goToStep(stepIndex + 1);
        return;
      }
      // The last step, done. The walkthrough used to sit here at "3 of 3" while
      // the application went off and created the client, waiting to be told
      // something it had just watched happen — and asking the reader to press
      // Done to confirm work they had visibly finished. Pressing the control
      // the final step names is the completion, so it is recorded as one.
      completeWalkthrough();
    });
    // `goToStep` is deliberately not a dependency: it is rebuilt every render,
    // and depending on it would tear down and re-add the listener on each one.
    // What decides this subscription is which control is being watched.
  }, [stepping, watchedId, observe, stepIndex, steps.length]);
  /**
   * First paint, decided in core rather than here.
   *
   * These rules used to live in the two class expressions below, which meant
   * the memory planner had to predict what this component would do in order to
   * say whether an adaptation changed anything — and it predicted wrongly, so a
   * derived emphasis that selected the class the default had already applied was
   * reported as a change. Now both sides read the same function.
   */
  const presentation = resolvePresentation(response, plan ?? neutralPresentationPlan(response));
  // Stepping always shows the steps. A plan may fold them to begin with; it may
  // not fold them while somebody is being walked through them.
  const stepsHidden = presentation.expandControlVisible && !expanded && stepIndex === undefined;
  const showSummary =
    answer?.summary !== undefined &&
    !isRedundantSummary(answer.purpose, answer.summary, answer.title);
  const heading = answer?.title;
  const hasBody =
    answer !== undefined &&
    (answer.purpose !== undefined ||
      showSummary ||
      answer.conditions.length > 0 ||
      steps.length > 0);

  return (
    <div className="sw-guide__answer">
      {heading !== undefined && (
        <div className="sw-guide__answer-head">
          <span className="sw-guide__answer-mark" aria-hidden="true">
            <Sparkle />
          </span>
          <h3 className="sw-guide__answer-title">{heading}</h3>
        </div>
      )}
      {answer?.purpose !== undefined && <p className="sw-guide__purpose">{answer.purpose}</p>}
      {showSummary && <p className="sw-guide__summary">{answer.summary}</p>}

      {/* Where it is, and what it is currently showing.
          
          Closed Loop #17 composed this sentence here, which is how it became the
          one user-facing string no verifier ever saw. It is now built and checked
          beside the verifier and arrives already written, with a receipt. The
          panel picks a form and renders it; it does not author it. */}
      {contextualSentence !== undefined && (
        <p
          className="sw-guide__where"
          data-testid="guide-where"
          data-receipt={response.visualContext?.receipt?.statementId}
        >
          {contextualSentence}
        </p>
      )}

      {/* The verdict is styled here and decided elsewhere. `status` picks a mark
          and a colour; the sentence arrives already phrased for it, because
          "you need", "you have" and "you do not have" are three different
          claims and choosing between them is not a rendering decision. */}
      {(answer?.conditions ?? []).map((condition) => (
        <div className="sw-guide__condition" data-status={condition.status} key={condition.text}>
          <span className="sw-guide__condition-mark" aria-hidden="true">
            {condition.status === 'HELD' ? <Check /> : <Info />}
          </span>
          <span>{condition.text}</span>
        </div>
      ))}

      {/* Memory adds no sentence about a completion, and none about a pattern.
          A returning user gets the fold and the control that undoes it; being
          told the software remembers them was true and was the software talking
          about itself. What is left is one line, and only for a detail level the
          user chose — that is a setting being confirmed, not an inference being
          announced. */}
      {(plan?.metaCopy ?? []).includes('PREFERENCE_APPLIED') && (
        <p className="sw-guide__memory-note" data-testid="guide-memory-preference">
          {GUIDE_META_COPY.PREFERENCE_APPLIED}
        </p>
      )}

      {stepsHidden && steps.length > 0 && (
        <button
          type="button"
          className="sw-guide__button sw-guide__button--quiet"
          data-testid="guide-show-full-steps"
          onClick={() => {
            setExpanded(true);
            props.onMemoryEvent?.('FULL_STEPS_EXPANDED', {
              ...(response.featureId === undefined ? {} : { featureId: response.featureId }),
            });
          }}
        >
          {GUIDE_META_COPY.SHOW_FULL_STEPS}
          <span className="sw-guide__step-count"> ({plan?.stepCount ?? steps.length})</span>
        </button>
      )}

      {steps.length > 0 && !stepsHidden && (
        <ol className="sw-guide__steps" data-testid="guide-steps">
          {steps.map((step, index) => (
            <li
              className="sw-guide__step"
              key={`${step.text}-${index}`}
              data-active={stepping && index === stepIndex ? 'true' : undefined}
              data-semantic-id={step.semanticId}
            >
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Concrete things on screen, offered through the same interface a
          feature ambiguity uses. One design, two kinds of question. Each label
          is the runtime name exactly as the interface writes it — never
          expanded into "Invoice INV-001", because nothing establishes that. */}
      {(response.runtimeChoices ?? []).length > 0 && (
        <>
          <p className="sw-guide__prompt">Which one do you mean?</p>
          <div className="sw-guide__choices">
            {(response.runtimeChoices ?? []).map((choice) => (
              <button
                type="button"
                key={choice.instance.ref}
                className="sw-guide__button sw-guide__button--quiet"
                data-instance-ref={choice.instance.ref}
                onClick={() => props.onSelectInstance?.(choice.instance.ref)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      )}

      {response.status === 'AMBIGUOUS' &&
        response.ambiguity !== undefined &&
        (response.runtimeChoices ?? []).length === 0 && (
          <>
            {/* Its own class, not the purpose class. A purpose is a compiled
              claim about a feature; this is the panel asking a question, and
              anything reading the DOM must be able to tell them apart. */}
            <p className="sw-guide__prompt">Which one do you mean?</p>
            <div className="sw-guide__choices">
              {response.ambiguity.candidates
                // A candidate with no supported title has no honest label, and a
                // feature id is an identifier rather than a name.
                .filter((candidate) => candidate.title !== undefined)
                .map((candidate) => (
                  <span
                    className="sw-guide__button sw-guide__button--quiet"
                    key={candidate.featureId}
                  >
                    {candidate.title}
                  </span>
                ))}
            </div>
          </>
        )}

      {props.note !== undefined && <p className="sw-guide__note">{props.note}</p>}

      {(response.actions.length > 0 || steps.length > 1) && (
        <>
          {hasBody && <div className="sw-guide__rule" aria-hidden="true" />}
          <div className="sw-guide__actions">
            {/* An entry point, so it is not offered once the reader is inside.
                The ring follows the active step on its own now, which is all
                this button used to be good for mid-walkthrough — and a control
                that repeats what is already happening is the kind of thing that
                makes a panel feel like it is not listening. */}
            {response.actions.length > 0 && !stepping && (
              <button
                type="button"
                className={`sw-guide__button${
                  presentation.primaryAction === 'SHOW_ME' ? ' sw-guide__button--primary' : ''
                }`}
                // Provenance, not effect. It records that memory chose this
                // emphasis; it is deliberately not styled, because a ring drawn
                // to make a no-op visible is the no-op wearing a costume.
                data-emphasis={plan?.emphasisedAction === 'SHOW_ME' ? 'memory' : undefined}
                onClick={() => {
                  props.onMemoryEvent?.('SHOW_ME_USED', {
                    ...(response.featureId === undefined ? {} : { featureId: response.featureId }),
                  });
                  // Point, and nothing else.
                  //
                  // This used to start the walkthrough and drive it, pressing
                  // each control the contract allowed. It worked, and it is not
                  // what anybody asked for: a guide that operates an
                  // application without being told to, every time, is a guide
                  // somebody has to watch. The only press the guide makes now
                  // is the one behind "Do it for me", pressed deliberately, one
                  // step at a time.
                  //
                  // So the two entry points split by scope rather than by
                  // automation, which is what their labels always said: this
                  // one shows you where the thing is, and "Step through" walks
                  // you through using it. Neither is a dead end — the ring has
                  // a Stop, and the walkthrough is one button away.
                  props.onShowMe(response.actions);
                }}
                disabled={props.busy}
              >
                <Play />
                Show me
              </button>
            )}
            {/* Step through never disappears. Memory may move it behind Show me;
                it may not remove a way of being helped. */}
            {steps.length > 1 && !stepping && (
              <button
                type="button"
                className={`sw-guide__button${presentation.primaryAction === 'STEP_THROUGH' ? ' sw-guide__button--primary' : ''}`}
                data-testid="guide-step-through"
                onClick={() => {
                  // Unfold first. An audit walked Next three times and pressed
                  // Done against a collapsed list — completing steps that were
                  // never on screen, and recording it as a completion.
                  setExpanded(true);
                  // And point. Starting a walkthrough used to change only the
                  // panel, so the first thing a reader saw after asking to be
                  // walked through something was the application exactly as it
                  // had been. The ring is the walkthrough's other half.
                  goToStep(0, response.actions);
                  props.onMemoryEvent?.('STEP_THROUGH_STARTED', {
                    ...(response.featureId === undefined ? {} : { featureId: response.featureId }),
                  });
                }}
              >
                <ListIcon />
                Step through
              </button>
            )}
            {/* The advance, in a slot that does not move.
            
                Which of the three it is comes from the contract: "Do it for me"
                only where a guide is allowed to take the step (ADR 0035), "Done"
                on the last one, "Next" otherwise. The panel reads the verdict
                and decides nothing.
                
                One button in one place is also the whole keyboard story — focus
                lands here on every step, and Enter and Space are what a button
                already does. */}
            {stepping && (
              <button
                ref={advanceRef}
                type="button"
                className={`sw-guide__button${
                  advance.primary ? ' sw-guide__button--primary' : ' sw-guide__button--quiet'
                }`}
                data-testid={advance.testId}
                disabled={performing}
                onClick={advance.run}
              >
                {advance.label === 'Do it for me' ? <Play /> : null}
                {advance.label}
              </button>
            )}
            {stepping && (
              <span className="sw-guide__stepper">
                {/* Nowhere to go back to when there is one step. */}
                {steps.length > 1 && (
                  <button
                    type="button"
                    className="sw-guide__button sw-guide__button--quiet"
                    onClick={() => goToStep(Math.max(0, stepIndex - 1))}
                    disabled={stepIndex === 0}
                  >
                    Previous
                  </button>
                )}
                {/* "1 of 1" is not progress, it is arithmetic. */}
                {steps.length > 1 && (
                  <span className="sw-guide__stepper-count">
                    {stepIndex + 1} of {steps.length}
                  </span>
                )}
                {/* Moving on without doing it. Offered only when the advance is
                    an offer to act — otherwise the advance *is* Next, and two
                    buttons saying it would be one too many. */}
                {canPerform !== undefined && !onLastStep && (
                  <button
                    type="button"
                    className="sw-guide__button sw-guide__button--quiet"
                    data-testid="guide-step-skip"
                    onClick={() => goToStep(stepIndex + 1)}
                  >
                    Skip
                  </button>
                )}
                {canPerform !== undefined && onLastStep && (
                  <button
                    type="button"
                    className="sw-guide__button sw-guide__button--quiet"
                    data-testid="guide-step-done"
                    onClick={completeWalkthrough}
                  >
                    Done
                  </button>
                )}
                {/* A way out that is not "finish it".
                
                    Leaving halfway through is an ordinary thing to do — the
                    reader got what they needed, or changed their mind — and
                    without this the only exits were completing a walkthrough
                    they had abandoned, which would record a completion that
                    never happened, or closing the panel. Stopping records
                    nothing and takes the ring down with it. */}
                <button
                  type="button"
                  className="sw-guide__button sw-guide__button--quiet"
                  data-testid="guide-step-stop"
                  onClick={() => goToStep(undefined)}
                >
                  Stop
                </button>
              </span>
            )}
            {/* Anything the guide put on screen, it can take off again.
            
                A walkthrough has Stop. An answer with no steps to walk —
                "why can't I see Delete?" — had a ring and no way to put it
                down short of asking something else, which is the same dead end
                one shape over. */}
            {props.pointing && !stepping && props.onClearPointer !== undefined && (
              <button
                type="button"
                className="sw-guide__button sw-guide__button--quiet"
                data-testid="guide-clear-pointer"
                onClick={() => props.onClearPointer?.()}
              >
                Stop
              </button>
            )}
            {props.pointing && !justFinished && (
              <span className="sw-guide__pointing">
                <Check double />
                Highlighted in the app
              </span>
            )}
            {justFinished && (
              <span className="sw-guide__pointing" data-testid="guide-step-finished" role="status">
                <Check />
                That was the last step
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** What to say about a response that is not an answer. */
function statusNote(response: GuideQueryResponse, stopped?: string): string | undefined {
  if (stopped === 'TARGET_NOT_AVAILABLE') return 'That is not on screen at the moment.';
  if (stopped === 'UNSUPPORTED') return 'This application has not made that possible from here.';
  // A terminal "that is all" beside a live Show me contradicts itself.
  if (response.status === 'PARTIAL' && response.actions.length > 0) return undefined;
  switch (response.status) {
    case 'UNKNOWN':
      return 'I did not understand that one. Try asking how to do something, or where something is.';
    case 'UNSUPPORTED':
      return 'I do not have anything verified about that.';
    case 'STALE_CONTEXT':
      return 'The screen moved while I was looking. Ask again and I will use what is there now.';
    case 'PARTIAL':
      return 'That is all I can show for this one.';
    default:
      return undefined;
  }
}

/** The guide panel. */
export function StatewaveGuide(props: StatewaveGuideProps): ReactElement | null {
  useStyles(props.document);
  const [session, setSession] = useState<GuideSession>(emptySession);
  const [stamps, setStamps] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * What the last menu item the user pressed is doing.
   *
   * These controls used to fire and close instantly, which for the two that
   * cross a network — choosing an answer detail, and forgetting a subject —
   * meant the user learned nothing about a write that might still be in flight
   * and might have failed. A menu that closes before its work is done cannot
   * report the outcome, so it stays open until there is one.
   */
  const [menuBusy, setMenuBusy] = useState<
    { id: string; state: 'RUNNING' | 'DONE' | 'FAILED' } | undefined
  >(undefined);
  const menuBusyRef = useRef(menuBusy);
  menuBusyRef.current = menuBusy;

  /**
   * Run a menu item, showing what happened to it.
   *
   * `APPLIED` and `UNAVAILABLE` both read as done: the second means memory is
   * switched off, so nothing was attempted and there is nothing to warn about.
   * Only a real failure gets the alert, and a failure keeps the menu open —
   * quietly closing over a "forget me" that did not forget is the worst
   * available outcome.
   */
  const runMenuAction = (id: string, act: () => void | Promise<GuideMemoryWriteOutcome>): void => {
    setMenuBusy({ id, state: 'RUNNING' });
    void (async () => {
      let outcome: GuideMemoryWriteOutcome;
      try {
        outcome = (await act()) ?? 'APPLIED';
      } catch {
        outcome = 'FAILED';
      }
      const failed = outcome === 'FAILED';
      setMenuBusy({ id, state: failed ? 'FAILED' : 'DONE' });
      if (failed) return;
      // Long enough to be seen, short enough not to be in the way.
      setTimeout(() => {
        // Only if nothing else has been pressed since. Closing the menu on a
        // stale timer would dismiss an alert the user has not read.
        if (menuBusyRef.current?.id !== id) return;
        setMenuBusy(undefined);
        setMenuOpen(false);
      }, MENU_CONFIRMATION_MS);
    })();
  };
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreTo = useRef<Element | null>(null);
  const titleId = useId();
  const showMe = useShowMe({ execute: props.execute });

  const { theme, issues } = useMemo(() => resolveTheme(props.theme), [props.theme]);
  const { layout } = useMemo(() => resolveLayout(props.layout), [props.layout]);
  const systemDark = useMedia('(prefers-color-scheme: dark)', props.document, props.prefersDark);
  const dark = theme.appearance === 'dark' || (theme.appearance === 'system' && systemDark);
  const narrow = useMedia(`(max-width: ${layout.mobileBreakpoint}px)`, props.document);
  const variables = useMemo(() => themeToCssVariables(theme, dark), [theme, dark]);

  // The callback, not the whole props object. Depending on `props` refires this
  // on every render, because a host passing `theme={{ … }}` inline hands over a
  // new object each time — the same shape of defect the memory hook had, found
  // in the same audit.
  const onThemeIssues = props.onThemeIssues;
  useEffect(() => {
    if (issues.length > 0) onThemeIssues?.(issues);
  }, [issues, onThemeIssues]);

  useEffect(() => {
    if (!props.open) return;
    restoreTo.current = props.document?.activeElement ?? globalThis.document?.activeElement ?? null;
    composerRef.current?.focus();
    return () => {
      const previous = restoreTo.current;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [props.open, props.document]);

  useEffect(() => {
    const node = threadRef.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [session.turns.length]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 || busy) return;
    setBusy(true);
    const id = `t${session.turns.length}`;
    const asked = withQuestion(session, text, id);
    const response = props.ask(text, props.developer === true ? { developer: true } : {});
    setSession(withAnswer(asked, response, `${id}r`));
    setStamps((current) => ({ ...current, [id]: clock((props.now ?? (() => new Date()))()) }));
    setDraft('');
    setBusy(false);
    showMe.reset();
  }, [draft, busy, session, props, showMe]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const lastResponse = useMemo(() => {
    for (let index = session.turns.length - 1; index >= 0; index -= 1) {
      const turn = session.turns[index]!;
      if (turn.role === 'guide') return turn.response;
    }
    return undefined;
  }, [session.turns]);

  if (!props.open) return null;

  const pointing = showMe.state.outcomes.some(
    (outcome) => outcome.status === 'done' && outcome.action.kind === 'highlight',
  );
  const style = { ...variables, '--sw-guide-width': `${layout.width}px` } as CSSProperties;

  return (
    <div
      className="sw-guide"
      data-mode={narrow ? undefined : layout.mode}
      data-side={narrow ? undefined : layout.side}
      data-mobile={narrow ? 'true' : undefined}
      data-appearance={dark ? 'dark' : 'light'}
      data-testid="guide-panel"
      role="complementary"
      aria-labelledby={titleId}
      style={style}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (menuOpen) setMenuOpen(false);
          else props.onClose();
        }
      }}
    >
      <header className="sw-guide__header">
        <Brand branding={props.branding} />
        <div className="sw-guide__product">
          <span className="sw-guide__product-mark" aria-hidden="true">
            <Sparkle />
          </span>
          <h2 className="sw-guide__title" id={titleId}>
            Statewave Guide
          </h2>
        </div>
        <div className="sw-guide__menu">
          <button
            type="button"
            className="sw-guide__icon"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Dots />
          </button>
          {menuOpen && (
            <div className="sw-guide__menu-list" role="menu">
              <button
                type="button"
                role="menuitem"
                className="sw-guide__menu-item"
                data-testid="guide-clear-conversation"
                data-state={menuBusy?.id === 'clear' ? menuBusy.state : undefined}
                disabled={menuBusy?.state === 'RUNNING'}
                onClick={() => {
                  runMenuAction('clear', () => {
                    setSession(emptySession);
                    setStamps({});
                    showMe.reset();
                    props.clearPointer?.();
                  });
                }}
              >
                Clear conversation
                <MenuStatus state={menuBusy?.id === 'clear' ? menuBusy.state : undefined} />
              </button>
              {props.memory !== undefined && (
                <>
                  <div className="sw-guide__menu-rule" aria-hidden="true" />
                  <span className="sw-guide__menu-label">Answer detail</span>
                  {(['AUTO', 'CONCISE', 'FULL'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={props.memory?.guidanceDetail === value}
                      className="sw-guide__menu-item"
                      data-testid={`guide-detail-${value.toLowerCase()}`}
                      data-state={menuBusy?.id === `detail-${value}` ? menuBusy.state : undefined}
                      disabled={menuBusy?.state === 'RUNNING'}
                      onClick={() => {
                        runMenuAction(`detail-${value}`, () => props.memory?.onSetDetail(value));
                      }}
                    >
                      {value === 'AUTO' ? 'Auto' : value === 'CONCISE' ? 'Concise' : 'Full'}
                      {/* Which one is in force, standing. The menu showed this
                          only to a screen reader, through `aria-checked`, so a
                          sighted user opening it could not tell which answer
                          detail they were getting. The transient status of a
                          press takes precedence while there is one. */}
                      {menuBusy?.id === `detail-${value}` ? (
                        <MenuStatus state={menuBusy.state} />
                      ) : props.memory?.guidanceDetail === value ? (
                        <span className="sw-guide__menu-status" data-kind="selected">
                          <Check />
                        </span>
                      ) : null}
                    </button>
                  ))}
                  <div className="sw-guide__menu-rule" aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    className="sw-guide__menu-item"
                    data-testid="guide-reset-memory"
                    data-state={menuBusy?.id === 'reset' ? menuBusy.state : undefined}
                    disabled={menuBusy?.state === 'RUNNING'}
                    onClick={() => {
                      runMenuAction('reset', () => props.memory?.onReset());
                    }}
                  >
                    Reset Guide memory
                    <MenuStatus state={menuBusy?.id === 'reset' ? menuBusy.state : undefined} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="sw-guide__icon"
          aria-label="Close Statewave Guide"
          onClick={props.onClose}
        >
          <Close />
        </button>
      </header>

      <div className="sw-guide__status">
        <span className="sw-guide__status-dot" aria-hidden="true" />
        <span>
          {props.contextLabel === undefined
            ? 'Your app explains itself.'
            : `On ${props.contextLabel}`}
        </span>
      </div>

      <div className="sw-guide__thread" ref={threadRef}>
        {session.turns.length === 0 && (
          <div className="sw-guide__empty">
            <span className="sw-guide__empty-mark" aria-hidden="true">
              <Sparkle size={22} />
            </span>
            <h3>Ask about anything on screen.</h3>
            <p>Ask how something works, where to find it, or what you can do next.</p>
          </div>
        )}
        {session.turns.map((turn) =>
          turn.role === 'user' ? (
            <div className="sw-guide__turn" key={turn.id}>
              <p className="sw-guide__question">{turn.text}</p>
              <span className="sw-guide__meta">
                <span>{stamps[turn.id] ?? ''}</span>
                <span className="sw-guide__meta-check" aria-hidden="true">
                  <Check double />
                </span>
              </span>
            </div>
          ) : (
            <Answer
              key={turn.id}
              response={turn.response}
              busy={showMe.state.running}
              pointing={turn.response === lastResponse && pointing}
              onShowMe={(actions) =>
                void showMe.run(actions).then((finished) => {
                  // The hook stops honestly when a target is not on screen; the
                  // ring has to stop with it. Leaving the previous highlight up
                  // while the note says "not on screen" is two parts of one
                  // panel contradicting each other.
                  if (finished.stoppedBecause !== undefined) props.clearPointer?.();
                })
              }
              {...(props.clearPointer === undefined
                ? {}
                : {
                    onClearPointer: () => {
                      props.clearPointer?.();
                      showMe.reset();
                    },
                  })}
              {...(props.stepInteraction === undefined
                ? {}
                : { stepInteraction: props.stepInteraction })}
              {...(props.contextualForm === undefined
                ? {}
                : { contextualForm: props.contextualForm })}
              {...(props.presentationFor === undefined
                ? {}
                : { presentation: props.presentationFor(turn.response) })}
              {...(props.onMemoryEvent === undefined ? {} : { onMemoryEvent: props.onMemoryEvent })}
              {...(props.onSelectInstance === undefined
                ? {}
                : { onSelectInstance: props.onSelectInstance })}
              {...(() => {
                const note = statusNote(
                  turn.response,
                  turn.response === lastResponse ? showMe.state.stoppedBecause : undefined,
                );
                return note === undefined ? {} : { note };
              })()}
            />
          ),
        )}
      </div>

      <div className="sw-guide-visually-hidden" role="status" aria-live="polite">
        {lastResponse === undefined ? '' : 'The guide replied.'}
      </div>

      <div className="sw-guide__composer">
        {/* Decorative, matching the reference; there is no attachment feature and
            nothing here pretends to be one — it is not focusable and not a button. */}
        <span className="sw-guide__clip" aria-hidden="true">
          <Paperclip />
        </span>
        <label htmlFor={`${titleId}-input`} className="sw-guide-visually-hidden">
          Ask the guide a question
        </label>
        <textarea
          id={`${titleId}-input`}
          className="sw-guide__input"
          ref={composerRef}
          rows={1}
          value={draft}
          placeholder="Ask anything about this app…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <button
          type="button"
          className="sw-guide__send"
          aria-label="Send"
          onClick={submit}
          disabled={busy || draft.trim().length === 0}
        >
          <Send />
        </button>
      </div>

      {/* What memory did, and what it refused to do.
          
          A developer surface, never a user one. It shows scope rather than
          identity, decisions rather than records, and it cannot show another
          subject's history because the hook never has one. */}
      {props.developer === true && props.memoryDiagnostics !== undefined && (
        <details className="sw-guide__inspector" data-testid="guide-memory-inspector">
          <summary>Memory</summary>
          <pre>
            {JSON.stringify(
              {
                ...props.memoryDiagnostics,
                adaptation:
                  lastResponse === undefined || props.presentationFor === undefined
                    ? null
                    : (() => {
                        const plan = props.presentationFor(lastResponse);
                        return {
                          stepsCollapsed: plan.stepsCollapsed,
                          stepCount: plan.stepCount,
                          emphasisedAction: plan.emphasisedAction ?? null,
                          metaCopy: plan.metaCopy,
                          reasons: plan.reasons,
                          refusals: plan.refusals,
                          neutral: plan.neutral,
                        };
                      })(),
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}

      {props.developer === true && lastResponse?.diagnostics !== undefined && (
        <details className="sw-guide__inspector">
          <summary>Inspector</summary>
          <pre>{JSON.stringify(lastResponse.diagnostics, null, 2)}</pre>
        </details>
      )}

      <footer className="sw-guide__footer" data-testid="guide-attribution">
        Powered by{' '}
        <a href={ATTRIBUTION_URL} target="_blank" rel="noreferrer noopener">
          {ATTRIBUTION_PRODUCT}
        </a>
      </footer>
    </div>
  );
}

/** The collapsed launcher: the mark, and a hint with the shortcut that opens it. */
export function StatewaveGuideLauncher(props: {
  onOpen(): void;
  /** Whether the panel is open. The launcher stays mounted either way. */
  open?: boolean;
  theme?: GuideThemeInput;
  layout?: GuideLayoutInput;
  /** Show the keyboard hint. Default true. */
  hint?: boolean;
  document?: Document;
  prefersDark?: boolean;
}): ReactElement {
  useStyles(props.document);
  const { theme } = useMemo(() => resolveTheme(props.theme), [props.theme]);
  const { layout } = useMemo(() => resolveLayout(props.layout), [props.layout]);
  const systemDark = useMedia('(prefers-color-scheme: dark)', props.document, props.prefersDark);
  const dark = theme.appearance === 'dark' || (theme.appearance === 'system' && systemDark);
  const variables = useMemo(() => themeToCssVariables(theme, dark), [theme, dark]);
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

  // ⌘K / Ctrl+K opens the guide. The hint below is true because this is here.
  useEffect(() => {
    const doc = props.document ?? (typeof document === 'undefined' ? undefined : document);
    if (doc === undefined) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        props.onOpen();
      }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <div
      className="sw-guide-launcher"
      data-position={layout.launcherPosition}
      data-open={props.open === true ? 'true' : undefined}
      aria-hidden={props.open === true ? 'true' : undefined}
      style={variables as CSSProperties}
    >
      <button
        type="button"
        className="sw-guide-launcher__button"
        data-testid="guide-launcher"
        aria-label="Open Statewave Guide"
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
        tabIndex={props.open === true ? -1 : undefined}
        onClick={props.onOpen}
      >
        <Sparkle size={30} />
      </button>
      {props.hint !== false && (
        <span className="sw-guide-launcher__hint" aria-hidden="true">
          Ask Statewave
          <span className="sw-guide-launcher__kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
        </span>
      )}
    </div>
  );
}

export { defaultGuideLayout };
