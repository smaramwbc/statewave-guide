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
} from '../theme/icons.js';
import { emptySession, withAnswer, withQuestion } from './session.js';
import type { GuideSession } from './session.js';
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
    onSetDetail: (value: 'AUTO' | 'CONCISE' | 'FULL') => void;
    onReset: () => void;
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

/** One answer, rendered from exactly the fields that are present. */
function Answer(props: {
  response: GuideQueryResponse;
  onShowMe(actions: readonly GuideSafeAction[]): void;
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
  const steps = answer?.steps ?? [];
  const stepping = stepIndex !== undefined && steps.length > 1;
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

      {(answer?.conditions ?? []).map((condition) => (
        <div className="sw-guide__condition" key={condition}>
          <span className="sw-guide__condition-mark" aria-hidden="true">
            <Info />
          </span>
          <span>{condition}</span>
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
            {response.actions.length > 0 && (
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
                  props.onShowMe(response.actions);
                  props.onMemoryEvent?.('SHOW_ME_USED', {
                    ...(response.featureId === undefined ? {} : { featureId: response.featureId }),
                  });
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
                  setStepIndex(0);
                  props.onMemoryEvent?.('STEP_THROUGH_STARTED', {
                    ...(response.featureId === undefined ? {} : { featureId: response.featureId }),
                  });
                }}
              >
                <ListIcon />
                Step through
              </button>
            )}
            {stepping && (
              <span className="sw-guide__stepper">
                <button
                  type="button"
                  className="sw-guide__button sw-guide__button--quiet"
                  onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
                  disabled={stepIndex === 0}
                >
                  Previous
                </button>
                <span className="sw-guide__stepper-count">
                  {stepIndex + 1} of {steps.length}
                </span>
                {stepIndex < steps.length - 1 ? (
                  <button
                    type="button"
                    className="sw-guide__button sw-guide__button--quiet"
                    onClick={() => setStepIndex(stepIndex + 1)}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sw-guide__button sw-guide__button--quiet"
                    data-testid="guide-step-done"
                    onClick={() => {
                      setStepIndex(undefined);
                      // The one interaction that licenses "You've completed this
                      // guide before." Reaching the last step and pressing Done
                      // is the whole of the evidence; nothing weaker counts.
                      props.onMemoryEvent?.('STEP_THROUGH_COMPLETED', {
                        ...(response.featureId === undefined
                          ? {}
                          : { featureId: response.featureId }),
                      });
                    }}
                  >
                    Done
                  </button>
                )}
              </span>
            )}
            {props.pointing && (
              <span className="sw-guide__pointing">
                <Check double />
                Highlighted in the app
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
                onClick={() => {
                  setSession(emptySession);
                  setStamps({});
                  showMe.reset();
                  setMenuOpen(false);
                }}
              >
                Clear conversation
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
                      onClick={() => {
                        props.memory?.onSetDetail(value);
                        setMenuOpen(false);
                      }}
                    >
                      {value === 'AUTO' ? 'Auto' : value === 'CONCISE' ? 'Concise' : 'Full'}
                    </button>
                  ))}
                  <div className="sw-guide__menu-rule" aria-hidden="true" />
                  <button
                    type="button"
                    role="menuitem"
                    className="sw-guide__menu-item"
                    data-testid="guide-reset-memory"
                    onClick={() => {
                      props.memory?.onReset();
                      setMenuOpen(false);
                    }}
                  >
                    Reset Guide memory
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
              onShowMe={(actions) => void showMe.run(actions)}
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
