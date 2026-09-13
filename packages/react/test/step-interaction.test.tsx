/**
 * The walkthrough keeps up with the user, and sometimes moves first.
 *
 * Two conveniences, one rule between them. A reader who presses the button the
 * step names should not then have to press Next in the panel — that is
 * bookkeeping the guide is supposed to be doing for them. And where the step
 * only *reveals* the task, the guide may press it on their behalf.
 *
 * What it may never do is finish the job. The permission is decided in the
 * query contract from what each step was compiled as, and these tests pin that
 * the panel obeys it rather than re-deriving it — a panel that looked at the
 * control and decided for itself is exactly the failure ADR 0022 exists for.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GUIDE_QUERY_CONTRACT_VERSION } from '@statewavedev/guide-core';
import type { GuideQueryResponse } from '@statewavedev/guide-core';
import { StatewaveGuide } from '../src/panel/StatewaveGuide.js';
import type { GuideStepInteraction } from '../src/step-interaction.js';

afterEach(cleanup);

const RESPONSE: GuideQueryResponse = {
  contractVersion: GUIDE_QUERY_CONTRACT_VERSION,
  status: 'ANSWERED',
  intent: 'HOW_TO',
  featureId: 'clients.create',
  answer: {
    title: 'New client',
    purpose: 'Lets you create a new client.',
    steps: [
      {
        text: 'Choose "New client".',
        semanticId: 'clients.create',
        performance: { kind: 'PRESS', semanticId: 'clients.create', byGuide: 'ALLOWED' },
      },
      {
        text: 'Enter the name.',
        semanticId: 'clients.create-dialog.name',
        performance: {
          kind: 'TYPE',
          semanticId: 'clients.create-dialog.name',
          byGuide: 'REFUSED',
          refusedBecause: 'SUPPLIES_DATA',
        },
      },
      {
        text: 'Choose "Create client".',
        semanticId: 'clients.create-dialog.submit',
        performance: {
          kind: 'PRESS',
          semanticId: 'clients.create-dialog.submit',
          byGuide: 'REFUSED',
          refusedBecause: 'COMMITS_A_CHANGE',
        },
      },
    ],
    conditions: [],
    questions: [],
  },
  // A response-level pointing sequence, so the panel renders Show me at all.
  actions: [{ kind: 'highlight', semanticId: 'clients.create', label: 'New client' }],
  pruned: [],
};

/** A seam that records what was watched and what was pressed. */
function seam() {
  const watched: string[] = [];
  const pressed: string[] = [];
  const fire: Record<string, () => void> = {};
  const interaction: GuideStepInteraction = {
    observe(semanticId, onInteract) {
      watched.push(semanticId);
      fire[semanticId] = onInteract;
      return () => {
        delete fire[semanticId];
      };
    },
    async press(semanticId) {
      pressed.push(semanticId);
      // A real press fires the click the panel is already watching for.
      fire[semanticId]?.();
      return true;
    },
  };
  return { watched, pressed, fire, interaction };
}

/** Rendered and answered, with nothing started yet. */
async function answered(interaction?: GuideStepInteraction) {
  render(
    <StatewaveGuide
      ask={() => RESPONSE}
      execute={async (action) => ({ status: 'done', action }) as never}
      {...(interaction === undefined ? {} : { stepInteraction: interaction })}
      open
      onClose={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText('Ask the guide a question'), {
    target: { value: 'How do I create a client?' },
  });
  fireEvent.click(screen.getByLabelText('Send'));
  await screen.findByText('Lets you create a new client.');
}

async function stepping(interaction?: GuideStepInteraction) {
  render(
    <StatewaveGuide
      ask={() => RESPONSE}
      execute={async (action) => ({ status: 'done', action }) as never}
      {...(interaction === undefined ? {} : { stepInteraction: interaction })}
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
}

const position = (): string => screen.getByText(/^\d+ of \d+$/).textContent ?? '';

describe('the walkthrough and the user', () => {
  it('advances when the user does the step themselves', async () => {
    const { fire, watched, interaction } = seam();
    await stepping(interaction);
    expect(position()).toBe('1 of 3');
    // Not vacuous: if the panel never subscribed there would be nothing to
    // fire, and the assertion below would pass on a walkthrough that simply
    // never moved.
    expect(watched).toContain('clients.create');

    // The user presses "New client" in the application, not in the panel.
    fire['clients.create']?.();

    await waitFor(() => expect(position()).toBe('2 of 3'));
  });

  /**
   * Watching a field would march the walkthrough past work nobody did:
   * clicking into a box is not filling it in.
   */
  it('does not watch a step whose work is typing', async () => {
    const { fire, watched, interaction } = seam();
    await stepping(interaction);
    fire['clients.create']?.();
    await waitFor(() => expect(position()).toBe('2 of 3'));

    expect(watched).not.toContain('clients.create-dialog.name');
    expect(screen.queryByTestId('guide-step-perform')).toBeNull();
  });

  /**
   * The step the guide must never take. It is also never watched — a
   * walkthrough that advanced itself past the commit would be claiming the task
   * was done on evidence it does not have.
   */
  it('never offers to commit, and never watches for it', async () => {
    const { watched, interaction } = seam();
    await stepping(interaction);
    // Step one is a trigger, so the advance is an offer to act and moving on
    // without acting is Skip. Step two is typing, so the advance is Next.
    fireEvent.click(screen.getByTestId('guide-step-skip'));
    await waitFor(() => expect(position()).toBe('2 of 3'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(position()).toBe('3 of 3'));

    expect(screen.queryByTestId('guide-step-perform')).toBeNull();
    expect(watched).not.toContain('clients.create-dialog.submit');
  });

  it('presses the control for the user, and the walkthrough follows', async () => {
    const { pressed, interaction } = seam();
    await stepping(interaction);

    fireEvent.click(screen.getByTestId('guide-step-perform'));

    await waitFor(() => expect(pressed).toEqual(['clients.create']));
    await waitFor(() => expect(position()).toBe('2 of 3'));
  });

  /**
   * The bug this release was reported for.
   *
   * Show me used to run the response's actions once and stop: a ring, a
   * sentence describing the feature, and nothing to do next. Pressing it again
   * re-ran the same sequence, so it read as a button that does nothing. It is
   * now a way *into* the walkthrough.
   */
  it('Show me enters the walkthrough instead of ending there', async () => {
    const { interaction } = seam();
    await answered(interaction);
    expect(screen.queryByText(/of 3$/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));

    await screen.findByText(/of 3$/);
  });

  /**
   * And it demonstrates: it takes the step it is allowed to take, then hands
   * over at the first one only the reader can do. For creating a client that is
   * one press — the dialog opens — and then it stops at the field, because
   * nobody else may type somebody's data.
   */
  it('Show me takes the steps it may, and hands over at the first it may not', async () => {
    const { pressed, interaction } = seam();
    await answered(interaction);

    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));

    await waitFor(() => expect(position()).toBe('2 of 3'), { timeout: 4000 });
    // The trigger, and only the trigger. It did not go on to press the control
    // that commits the change, and it did not attempt to type.
    expect(pressed).toEqual(['clients.create']);
    expect(screen.queryByTestId('guide-step-perform')).toBeNull();
  });

  /**
   * A walkthrough left halfway is an ordinary thing. The exit records nothing —
   * completing one the reader abandoned would write down a completion that
   * never happened.
   */
  it('stops without claiming the walkthrough was finished', async () => {
    const kinds: string[] = [];
    render(
      <StatewaveGuide
        ask={() => RESPONSE}
        execute={async (action) => ({ status: 'done', action }) as never}
        onMemoryEvent={(kind) => kinds.push(kind)}
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

    fireEvent.click(screen.getByTestId('guide-step-stop'));

    expect(kinds).not.toContain('STEP_THROUGH_COMPLETED');
    expect(screen.queryByText(/of 3$/)).toBeNull();
  });

  /**
   * Click, click, click — in one place.
   *
   * The advance used to be three different buttons appearing and disappearing
   * in the same row, so the thing to press next slid sideways between steps and
   * had to be found again each time. One slot, one label that changes.
   */
  it('keeps the advance in one place all the way through', async () => {
    const { interaction } = seam();
    await answered(interaction);
    fireEvent.click(screen.getByTestId('guide-step-through'));

    const slotAt = (): number => {
      const row = screen.getByTestId('guide-panel').querySelector('.sw-guide__actions');
      return [...(row?.children ?? [])].findIndex((node) =>
        node.matches('[data-testid^="guide-step-"]'),
      );
    };
    const first = slotAt();
    expect(first).toBeGreaterThanOrEqual(0);

    fireEvent.click(screen.getByTestId('guide-step-skip'));
    await waitFor(() => expect(position()).toBe('2 of 3'));
    expect(slotAt()).toBe(first);

    fireEvent.click(screen.getByTestId('guide-step-next'));
    await waitFor(() => expect(position()).toBe('3 of 3'));
    expect(slotAt()).toBe(first);
  });

  /**
   * And the keyboard, which is the same fix. Focus lands on the advance at
   * every step, and a button already answers Enter and Space — so the whole
   * walkthrough is reachable without the hand leaving the keys.
   */
  it('puts focus on the advance at every step', async () => {
    const { interaction } = seam();
    await answered(interaction);
    fireEvent.click(screen.getByTestId('guide-step-through'));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('guide-step-perform')),
    );

    fireEvent.click(screen.getByTestId('guide-step-skip'));
    await waitFor(() => expect(position()).toBe('2 of 3'));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('guide-step-next')));
  });

  /**
   * Except mid-word. One of these steps is "enter the client's billing email",
   * and taking the keyboard off somebody to put it on a Next button would be
   * the guide interrupting the work it just asked for.
   */
  it('does not take the keyboard from somebody typing', async () => {
    const { interaction } = seam();
    await answered(interaction);
    fireEvent.click(screen.getByTestId('guide-step-through'));
    await waitFor(() => expect(position()).toBe('1 of 3'));

    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    expect(document.activeElement).toBe(field);

    fireEvent.click(screen.getByTestId('guide-step-skip'));
    await waitFor(() => expect(position()).toBe('2 of 3'));

    expect(document.activeElement).toBe(field);
    field.remove();
  });

  /**
   * A host that supplies no seam gets exactly the panel it had before: no
   * watching, no pressing, nothing reaching into its application.
   */
  it('does nothing at all without a host-supplied seam', async () => {
    await stepping(undefined);
    expect(screen.queryByTestId('guide-step-perform')).toBeNull();
    expect(position()).toBe('1 of 3');
  });
});
