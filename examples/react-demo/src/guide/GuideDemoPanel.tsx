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
          Try a CSS selector (refused)
        </button>

        {/* Nothing is registered under this name, so the runtime says so. */}
        <button
          className="danger"
          onClick={() => run({ action: 'deleteEverything', source: 'agent' })}
        >
          Try an unknown action (refused)
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
        <pre className={result.ok ? 'guide-panel__result ok' : 'guide-panel__result err'}>
          {JSON.stringify(
            result.ok
              ? { ok: true, action: result.action }
              : { ok: false, action: result.action, error: result.error },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
