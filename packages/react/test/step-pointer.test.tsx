/**
 * The pointer follows the step, or it goes away.
 *
 * Reported from the running demo: start a walkthrough, press Show me, then
 * press Next — and the ring stays on the button from step one. The panel says
 * "Highlighted in the app" while pointing at something the user has already
 * done, which reads exactly like a walkthrough that is stuck.
 *
 * Two defects met there. The panel ran the *response's* actions whatever step
 * you were on, so the ring never moved; and the compiled `enter_fields` step
 * carried the trigger's semantic id rather than the field's, so even a correct
 * panel would have pointed at the wrong control (fixed in the bundle builder,
 * covered by `test:guide-bundle-reproducible`).
 *
 * These pin the panel half: the ring tracks the active step, and a step whose
 * control is not on screen retracts the ring instead of leaving a stale one.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GUIDE_QUERY_CONTRACT_VERSION } from '@statewavedev/guide-core';
import type { GuideQueryResponse, GuideSafeAction } from '@statewavedev/guide-core';
import { StatewaveGuide } from '../src/panel/StatewaveGuide.js';

afterEach(cleanup);

const RESPONSE: GuideQueryResponse = {
  contractVersion: GUIDE_QUERY_CONTRACT_VERSION,
  status: 'ANSWERED',
  intent: 'HOW_TO',
  featureId: 'clients.create',
  answer: {
    title: 'New client',
    purpose: 'Lets you create a new client.',
    // Steps as the engine emits them: the pointing sequence is offered per step
    // by the contract, never assembled by the panel (ADR 0022).
    steps: [
      {
        text: 'Choose "New client".',
        semanticId: 'clients.create',
        actions: [
          { kind: 'scroll', semanticId: 'clients.create' },
          { kind: 'highlight', semanticId: 'clients.create' },
        ],
      },
      {
        text: 'Enter the name.',
        semanticId: 'clients.create-dialog.name',
        actions: [
          { kind: 'scroll', semanticId: 'clients.create-dialog.name' },
          { kind: 'highlight', semanticId: 'clients.create-dialog.name' },
        ],
      },
      {
        text: 'Choose "Create client".',
        semanticId: 'clients.create-dialog.submit',
        actions: [
          { kind: 'scroll', semanticId: 'clients.create-dialog.submit' },
          { kind: 'highlight', semanticId: 'clients.create-dialog.submit' },
        ],
      },
    ],
    conditions: [],
    questions: [],
  },
  actions: [{ kind: 'highlight', semanticId: 'clients.create' }],
  pruned: [],
};

/**
 * A panel over an executor that only knows about controls in `mounted`.
 *
 * Anything else answers `target_not_available`, which is what the real
 * executor does for a control inside a dialog nobody has opened.
 */
async function panel(mounted: readonly string[]) {
  const executed: GuideSafeAction[] = [];
  const clearPointer = vi.fn();
  render(
    <StatewaveGuide
      ask={() => RESPONSE}
      execute={async (action: GuideSafeAction) => {
        executed.push(action);
        const id = 'semanticId' in action ? action.semanticId : '';
        return mounted.includes(id)
          ? ({ status: 'done', action } as never)
          : ({ status: 'target_not_available', action } as never);
      }}
      clearPointer={clearPointer}
      open
      onClose={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Ask the guide a question'), {
    target: { value: 'How do I create a client?' },
  });
  fireEvent.click(screen.getByLabelText('Send'));
  await screen.findByText('Lets you create a new client.');
  fireEvent.click(screen.getByTestId('guide-step-through'));
  return { executed, clearPointer };
}

/** Every control the panel pointed at, in order — the ring's actual path. */
const pointedIds = (executed: readonly GuideSafeAction[]): string[] =>
  executed
    .filter((action) => action.kind === 'highlight')
    .map((action) => ('semanticId' in action ? action.semanticId : ''));

/**
 * Every control the panel *tried*, whatever the action kind.
 *
 * A sequence stops at the first unavailable target, so when a step's control is
 * not mounted the run ends on the `scroll` and the `highlight` never executes.
 * Asserting only on highlights would make "it tried and failed" look identical
 * to "it never tried".
 */
const attemptedIds = (executed: readonly GuideSafeAction[]): string[] =>
  executed.map((action) => ('semanticId' in action ? action.semanticId : ''));

describe('the ring follows the active step', () => {
  it('Show me points at the current step, not the response headline', async () => {
    const { executed } = await panel(['clients.create', 'clients.create-dialog.name']);
    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));
    await waitFor(() => expect(pointedIds(executed)).toEqual(['clients.create']));

    // Advance. The ring must move to step two's control, not stay on step one's.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(pointedIds(executed)).toEqual(['clients.create', 'clients.create-dialog.name']),
    );
  });

  it('retracts the ring when the next step is not on screen', async () => {
    // Only the trigger is mounted — the dialog has not been opened yet, which
    // is exactly where the report came from.
    const { executed, clearPointer } = await panel(['clients.create']);
    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));
    await screen.findByText('Highlighted in the app');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // The attempt is made, it fails honestly, and the stale ring is taken down.
    await waitFor(() => expect(clearPointer).toHaveBeenCalled());
    expect(attemptedIds(executed)).toContain('clients.create-dialog.name');
    // …and it never claimed to have pointed at it.
    expect(pointedIds(executed)).not.toContain('clients.create-dialog.name');
    await waitFor(() => expect(screen.queryByText('Highlighted in the app')).toBeNull());
  });

  it('says why, instead of pointing at nothing', async () => {
    await panel(['clients.create']);
    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));
    await screen.findByText('Highlighted in the app');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // Silence would be better than a lie; a sentence is better than silence.
    await screen.findByText('That is not on screen at the moment.');
  });

  it('points at the step once its control is mounted', async () => {
    const { executed } = await panel(['clients.create', 'clients.create-dialog.name']);
    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));
    await waitFor(() => expect(pointedIds(executed)).toContain('clients.create'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(pointedIds(executed)).toContain('clients.create-dialog.name'));
    await screen.findByText('Highlighted in the app');
  });

  it('does not start pointing at things the user never asked to be shown', async () => {
    // Stepping without Show me must stay quiet. A walkthrough that starts
    // highlighting on its own is the guide taking over the screen.
    const { executed, clearPointer } = await panel(['clients.create']);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(executed).toHaveLength(0);
    expect(clearPointer).not.toHaveBeenCalled();
  });
});
