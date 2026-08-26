import { useState } from 'react';
import type { GuideActionRequest, GuideActionResult } from '@statewavedev/guide-shared';
import { useGuide, useGuideContext } from '@statewavedev/guide-react';

/**
 * A developer panel, not a product feature.
 *
 * Every button sends a named {@link GuideActionRequest} through the action
 * runtime and prints the raw result. There is no AI here — the point is to show
 * that a semantic identifier, an action registry, the React element registry and
 * our own highlight engine already work end to end.
 *
 * The failure buttons are the interesting half. Each one fails for a different
 * reason, and each reason arrives as a different `GuideErrorCode` — which is
 * what a caller, human or model, is meant to branch on. The code is therefore
 * shown on its own line, above the raw JSON, rather than buried in it.
 */
export function GuideDemoPanel() {
  const { executeAction, elements, activeHighlightId, clearHighlight, availableActions } =
    useGuide();
  const { context } = useGuideContext();
  const [result, setResult] = useState<GuideActionResult | null>(null);

  async function run(request: GuideActionRequest) {
    setResult(await executeAction(request));
  }

  return (
    <div className="guide-panel">
      <h4>Statewave Guide — demo panel</h4>

      <div className="guide-panel__buttons">
        <button
          onClick={() =>
            run({
              action: 'highlight',
              input: {
                elementId: 'clients.create',
                title: 'New Client',
                message: 'This is the button that opens the create-client form.',
              },
            })
          }
        >
          Highlight New Client
        </button>

        <button onClick={() => run({ action: 'navigate', input: { route: '/clients' } })}>
          Navigate to Clients
        </button>

        <button
          onClick={() => run({ action: 'scroll', input: { elementId: 'settings.notifications' } })}
        >
          Scroll to Settings
        </button>

        <button onClick={clearHighlight}>Clear highlight</button>
      </div>

      <div className="guide-panel__buttons">
        {/*
          The safety boundary, made visible. `elementId` is parsed by a schema
          that rejects every selector metacharacter, so this is refused with
          `invalid_input` before any DOM code runs.
        */}
        <button
          className="danger"
          onClick={() =>
            run({
              action: 'highlight',
              input: { elementId: '#app > div:nth-child(4)' },
              source: 'agent',
            })
          }
        >
          Try a CSS selector → invalid_input
        </button>

        {/*
          A perfectly well-formed id that nothing is registered under. It used
          to come back as `execution_failed`; the guidance handlers now rethrow
          the engine's classified error, so the caller is told precisely that
          the target does not exist.
        */}
        <button
          className="danger"
          onClick={() =>
            run({
              action: 'highlight',
              input: { elementId: 'ghost.element' },
              source: 'agent',
            })
          }
        >
          Highlight a ghost id → target_not_found
        </button>

        {/* Nothing is registered under this name, so the runtime says so. */}
        <button
          className="danger"
          onClick={() => run({ action: 'deleteEverything', source: 'agent' })}
        >
          Try an unknown action → action_not_found
        </button>
      </div>

      <dl className="guide-panel__facts">
        <dt>route</dt>
        <dd>
          <code>{context.route ?? '—'}</code>
        </dd>
        <dt>registered elements</dt>
        <dd>{elements.length}</dd>
        <dt>visible elements</dt>
        <dd>{context.visibleElements?.length ?? 0}</dd>
        <dt>highlighted</dt>
        <dd>
          <code>{activeHighlightId ?? '—'}</code>
        </dd>
        <dt>actions</dt>
        <dd>
          <code>{availableActions.map((action) => action.name).join(', ') || '—'}</code>
        </dd>
      </dl>

      {result && (
        <div className="guide-panel__outcome">
          <p className={result.success ? 'guide-panel__code ok' : 'guide-panel__code err'}>
            <span className="guide-panel__code-label">
              {result.success ? 'success' : 'error.code'}
            </span>
            <code>{result.success ? result.action : result.error.code}</code>
          </p>
          {!result.success && <p className="guide-panel__message">{result.error.message}</p>}
          <pre className={result.success ? 'guide-panel__result ok' : 'guide-panel__result err'}>
            {JSON.stringify(
              result.success
                ? { success: true, action: result.action, data: result.data }
                : { success: false, action: result.action, error: result.error },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
