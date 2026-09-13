/**
 * A control that does something says what it did.
 *
 * Reported from the running panel: the overflow menu's items fired and the menu
 * shut instantly, so choosing an answer detail or resetting guide memory looked
 * identical whether it had worked, was still in flight, or had failed. Two of
 * those items write to a store that may be across a network.
 *
 * The rule these pin: a menu that closes before its work is done cannot report
 * the outcome, so it stays open until there is one — and a failure keeps it open
 * rather than tidying itself away. Quietly closing over a "forget me" that did
 * not forget is the worst available outcome, because the user walks away
 * believing it.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GUIDE_QUERY_CONTRACT_VERSION } from '@statewavedev/guide-core';
import type { GuideQueryResponse } from '@statewavedev/guide-core';
import { StatewaveGuide } from '../src/panel/StatewaveGuide.js';
import type { GuideMemoryWriteOutcome } from '../src/memory/use-guide-memory.js';

afterEach(cleanup);

const RESPONSE: GuideQueryResponse = {
  contractVersion: GUIDE_QUERY_CONTRACT_VERSION,
  status: 'ANSWERED',
  intent: 'HOW_TO',
  featureId: 'clients.create',
  answer: {
    title: 'New client',
    purpose: 'Lets you create a new client.',
    steps: [{ text: 'Choose "New client".', semanticId: 'clients.create' }],
    conditions: [],
    questions: [],
  },
  actions: [],
  pruned: [],
};

/** A panel whose memory writes resolve however the test says. */
function openMenu(outcome: GuideMemoryWriteOutcome | 'HANG', detail: 'AUTO' | 'FULL' = 'AUTO') {
  let settle: ((value: GuideMemoryWriteOutcome) => void) | undefined;
  const write = (): Promise<GuideMemoryWriteOutcome> =>
    outcome === 'HANG'
      ? new Promise<GuideMemoryWriteOutcome>((resolve) => {
          settle = resolve;
        })
      : Promise.resolve(outcome);

  render(
    <StatewaveGuide
      ask={() => RESPONSE}
      execute={async (action) => ({ status: 'done', action }) as never}
      memory={{ guidanceDetail: detail, onSetDetail: write, onReset: write }}
      open
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText('More options'));
  return { finish: (value: GuideMemoryWriteOutcome) => settle?.(value) };
}

const stateOf = (testId: string): string | null =>
  screen.getByTestId(testId).getAttribute('data-state');

describe('the overflow menu says what it did', () => {
  it('spins while a write is in flight, and keeps the menu open', async () => {
    const { finish } = openMenu('HANG');

    fireEvent.click(screen.getByTestId('guide-reset-memory'));

    await waitFor(() => expect(stateOf('guide-reset-memory')).toBe('RUNNING'));
    // Still open: a menu that has already closed has nowhere to put the answer.
    expect(screen.getByTestId('guide-reset-memory')).toBeDefined();
    // And not pressable twice while it is working.
    expect(screen.getByTestId('guide-reset-memory')).toHaveProperty('disabled', true);

    finish('APPLIED');
    await waitFor(() => expect(stateOf('guide-reset-memory')).toBe('DONE'));
  });

  it('confirms, then gets out of the way', async () => {
    openMenu('APPLIED');

    fireEvent.click(screen.getByTestId('guide-detail-full'));

    await waitFor(() => expect(stateOf('guide-detail-full')).toBe('DONE'));
    // The tick is shown, and then the menu closes on its own.
    await waitFor(() => expect(screen.queryByTestId('guide-detail-full')).toBeNull(), {
      timeout: 3000,
    });
  });

  /**
   * The one that matters. A write that did not take must not be tidied away —
   * the user has to be able to see that the thing they asked for did not
   * happen, and to try again.
   */
  it('shows a failure, and refuses to close over it', async () => {
    openMenu('FAILED');

    fireEvent.click(screen.getByTestId('guide-reset-memory'));

    await waitFor(() => expect(stateOf('guide-reset-memory')).toBe('FAILED'));
    await screen.findByText('That did not save');
    // Given more than long enough for a success to have dismissed itself.
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(screen.getByTestId('guide-reset-memory')).toBeDefined();
    expect(stateOf('guide-reset-memory')).toBe('FAILED');
  });

  /**
   * Memory being switched off is not a failure — nothing was attempted, so
   * there is nothing to warn about.
   */
  it('does not cry failure when there was nothing to write', async () => {
    openMenu('UNAVAILABLE');

    fireEvent.click(screen.getByTestId('guide-detail-full'));

    await waitFor(() => expect(stateOf('guide-detail-full')).toBe('DONE'));
  });

  /**
   * The second gap in the report: the menu showed which detail level was in
   * force only through `aria-checked`, so a sighted user opening it could not
   * tell what they were getting.
   */
  it('marks the answer detail that is actually in force', async () => {
    openMenu('APPLIED', 'FULL');

    const selected = screen
      .getByTestId('guide-detail-full')
      .querySelector('[data-kind="selected"]');
    expect(selected).not.toBeNull();
    expect(
      screen.getByTestId('guide-detail-auto').querySelector('[data-kind="selected"]'),
    ).toBeNull();
  });

  /** A local, instant action still confirms. Silence reads as a broken button. */
  it('confirms even the action that needs no network', async () => {
    openMenu('APPLIED');

    fireEvent.click(screen.getByTestId('guide-clear-conversation'));

    await waitFor(() => expect(stateOf('guide-clear-conversation')).toBe('DONE'));
  });
});
