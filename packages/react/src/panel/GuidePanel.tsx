/**
 * The Statewave Guide panel.
 *
 * A renderer and an executor, and nothing else. Every sentence it shows came
 * from the query contract; every target it points at was named by the query
 * contract; every action it runs is one the query contract returned. It does not
 * resolve features, prune steps, decide screen names, construct actions or
 * invent titles — twelve loops of work went into establishing where those
 * decisions belong, and a component with a deadline is not it.
 *
 * The strongest evidence for that is what the panel does with a missing field:
 * nothing. No "Untitled", no "Unknown feature", no "N/A". A feature whose title
 * the interface never supplies renders without a heading, because a placeholder
 * is a sentence somebody has to read and this component is not allowed to write
 * sentences.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type { GuideQueryResponse, GuideSafeAction } from '@statewavedev/guide-core';
import { GUIDE_PANEL_CSS, GUIDE_PANEL_STYLE_ID } from './styles.js';
import { emptySession, withAnswer, withQuestion } from './session.js';
import type { GuideSession, GuideTurn } from './session.js';
import { useShowMe } from './use-show-me.js';
import type { SafeActionOutcome } from '../use-guide-query.js';

/** What {@link GuidePanel} needs. */
export interface GuidePanelProps {
  /** Ask a question. Comes from `useGuideQuery`. */
  ask(query: string, options?: { developer?: boolean }): GuideQueryResponse;
  /** Run one safe action. Comes from `useGuideQuery`. */
  execute(action: GuideSafeAction): Promise<SafeActionOutcome>;
  open: boolean;
  onClose(): void;
  onCollapse?(): void;
  /** Show the inspector. Development only; never defaults on. */
  developer?: boolean;
  /** Injectable for tests. */
  document?: Document;
}

/** Inserts the panel's stylesheet once per document. */
function useStyles(target: Document | undefined): void {
  useEffect(() => {
    const doc = target ?? (typeof document === 'undefined' ? undefined : document);
    if (doc === undefined || doc.getElementById(GUIDE_PANEL_STYLE_ID) !== null) return;
    const style = doc.createElement('style');
    style.id = GUIDE_PANEL_STYLE_ID;
    style.textContent = GUIDE_PANEL_CSS;
    doc.head.append(style);
  }, [target]);
}

/** One answer, rendered from exactly the fields that are present. */
function GuideResponseView(props: {
  response: GuideQueryResponse;
  onShowMe(actions: readonly GuideSafeAction[]): void;
  showMeDisabled: boolean;
  note?: string;
}): ReactElement {
  const { response } = props;
  const answer = response.answer;
  const [stepIndex, setStepIndex] = useState<number | undefined>(undefined);
  const steps = answer?.steps ?? [];
  const stepping = stepIndex !== undefined && steps.length > 1;

  return (
    <div className="swg-answer">
      {answer?.title !== undefined && <h3 className="swg-answer__title">{answer.title}</h3>}
      {answer?.purpose !== undefined && <p className="swg-answer__purpose">{answer.purpose}</p>}
      {answer?.summary !== undefined && answer.summary !== answer.purpose && (
        <p className="swg-answer__summary">{answer.summary}</p>
      )}

      {answer !== undefined && answer.conditions.length > 0 && (
        <div className="swg-conditions">
          {answer.conditions.map((condition) => (
            <p key={condition}>{condition}</p>
          ))}
        </div>
      )}

      {steps.length > 0 && (
        <ol className="swg-steps">
          {steps.map((step, index) => (
            <li
              key={`${step.text}-${index}`}
              data-current={stepping && index === stepIndex ? 'true' : undefined}
              data-semantic-id={step.semanticId}
            >
              {step.text}
            </li>
          ))}
        </ol>
      )}

      {response.status === 'AMBIGUOUS' && response.ambiguity !== undefined && (
        <>
          <p className="swg-note">{response.ambiguity.message}</p>
          <div className="swg-choices">
            {response.ambiguity.candidates
              // A candidate with no supported title has no honest label. Showing
              // its feature id would put an identifier in front of a user, which
              // is the substitution Closed Loop #8 removed everywhere else.
              .filter((candidate) => candidate.title !== undefined)
              .map((candidate) => (
                <span key={candidate.featureId} className="swg-note">
                  • {candidate.title}
                </span>
              ))}
          </div>
        </>
      )}

      {props.note !== undefined && <p className="swg-note">{props.note}</p>}

      {(response.actions.length > 0 || steps.length > 1) && (
        <div className="swg-actions">
          {response.actions.length > 0 && (
            <button
              type="button"
              className="swg-button swg-button--primary"
              onClick={() => props.onShowMe(response.actions)}
              disabled={props.showMeDisabled}
            >
              Show me
            </button>
          )}
          {steps.length > 1 && !stepping && (
            <button type="button" className="swg-button" onClick={() => setStepIndex(0)}>
              Step through
            </button>
          )}
          {stepping && (
            <span className="swg-stepper">
              <button
                type="button"
                className="swg-button"
                onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
                disabled={stepIndex === 0}
              >
                Previous
              </button>
              <span className="swg-stepper__count">
                {stepIndex + 1} of {steps.length}
              </span>
              {stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  className="swg-button"
                  onClick={() => setStepIndex(stepIndex + 1)}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="swg-button"
                  onClick={() => setStepIndex(undefined)}
                >
                  Done
                </button>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What to say about a response that is not an answer.
 *
 * Short, and free of vocabulary from inside the system. A user learns whether
 * the guide understood them and whether it knows anything, which is the whole of
 * what these statuses mean to somebody outside.
 */
function statusNote(response: GuideQueryResponse, stopped?: string): string | undefined {
  if (stopped === 'TARGET_NOT_AVAILABLE') return 'That is not on screen at the moment.';
  if (stopped === 'UNSUPPORTED') return 'This application has not made that possible from here.';

  // A terminal "that is all" beside a live *Show me* contradicts itself, and the
  // first interactive review caught it doing exactly that: the filter answer
  // said there was nothing more to show directly above a button that went on to
  // scroll to, highlight and focus the control in question. When guidance is
  // partial *and* safe actions exist, the actions are the rest of the answer.
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

/** The panel. */
export function GuidePanel(props: GuidePanelProps): ReactElement | null {
  useStyles(props.document);
  const [session, setSession] = useState<GuideSession>(emptySession);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreFocusTo = useRef<Element | null>(null);
  const titleId = useId();
  const showMe = useShowMe({ execute: props.execute, settleMs: 0 });

  // Focus moves into the panel on open and back where it came from on close.
  // Never trapped: a guide that will not let go of the keyboard is worse than no
  // guide, because the application behind it is what the user actually came for.
  useEffect(() => {
    if (!props.open) return;
    restoreFocusTo.current =
      props.document?.activeElement ?? globalThis.document?.activeElement ?? null;
    composerRef.current?.focus();
    return () => {
      const previous = restoreFocusTo.current;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [props.open, props.document]);

  useEffect(() => {
    const node = conversationRef.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [session.turns.length]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 || busy) return;
    setBusy(true);
    const id = `t${session.turns.length}`;
    const asked = withQuestion(session, text, id);
    // Synchronous by design: the deterministic contract answers immediately, and
    // a fake typing animation over a synchronous call is a lie about latency.
    const response = props.ask(text, props.developer === true ? { developer: true } : {});
    setSession(withAnswer(asked, response, `${id}r`));
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

  const onPanelKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
      }
    },
    [props],
  );

  const lastResponse = useMemo(() => {
    for (let index = session.turns.length - 1; index >= 0; index -= 1) {
      const turn = session.turns[index] as GuideTurn;
      if (turn.role === 'guide') return turn.response;
    }
    return undefined;
  }, [session.turns]);

  if (!props.open) return null;

  return (
    <div
      className="swg-panel"
      role="complementary"
      aria-labelledby={titleId}
      data-testid="guide-panel"
      onKeyDown={onPanelKeyDown}
    >
      <header className="swg-header">
        <div className="swg-header__titles">
          <h2 className="swg-header__title" id={titleId}>
            Statewave Guide
          </h2>
          <p className="swg-header__subtitle">Your app explains itself.</p>
        </div>
        {props.onCollapse !== undefined && (
          <button
            type="button"
            className="swg-iconbutton"
            aria-label="Collapse the guide"
            onClick={props.onCollapse}
          >
            −
          </button>
        )}
        <button
          type="button"
          className="swg-iconbutton"
          aria-label="Close the guide"
          onClick={props.onClose}
        >
          ×
        </button>
      </header>

      <div className="swg-conversation" ref={conversationRef}>
        {session.turns.length === 0 && (
          <div className="swg-empty">
            <p className="swg-empty__lead">Ask about anything on screen.</p>
            <p>
              I answer from what this application has been verified to do — and I will point at it
              rather than describe where to look.
            </p>
          </div>
        )}
        {session.turns.map((turn) =>
          turn.role === 'user' ? (
            <p className="swg-question" key={turn.id}>
              {turn.text}
            </p>
          ) : (
            <GuideResponseView
              key={turn.id}
              response={turn.response}
              onShowMe={(actions) => void showMe.run(actions)}
              showMeDisabled={showMe.state.running}
              {...(statusNote(
                turn.response,
                turn.response === lastResponse ? showMe.state.stoppedBecause : undefined,
              ) === undefined
                ? {}
                : {
                    note: statusNote(
                      turn.response,
                      turn.response === lastResponse ? showMe.state.stoppedBecause : undefined,
                    )!,
                  })}
            />
          ),
        )}
      </div>

      <div
        aria-live="polite"
        role="status"
        className="swg-visually-hidden"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {lastResponse === undefined
          ? ''
          : lastResponse.status === 'ANSWERED'
            ? 'The guide answered.'
            : 'The guide replied.'}
      </div>

      <div className="swg-composer">
        <label
          htmlFor={`${titleId}-input`}
          className="swg-visually-hidden"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          Ask the guide a question
        </label>
        <textarea
          id={`${titleId}-input`}
          ref={composerRef}
          rows={1}
          value={draft}
          placeholder="Ask how this works…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <button
          type="button"
          className="swg-button swg-button--primary"
          onClick={submit}
          disabled={busy || draft.trim().length === 0}
        >
          Send
        </button>
      </div>

      {props.developer === true && lastResponse?.diagnostics !== undefined && (
        <details className="swg-inspector">
          <summary>Inspector</summary>
          <pre>{JSON.stringify(lastResponse.diagnostics, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
