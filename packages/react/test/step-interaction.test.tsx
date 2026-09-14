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
   * The step the guide must never take — and must still notice.
   *
   * Two different questions that an earlier version answered with one rule.
   * Offering to press the control that commits the change is forbidden, and
   * stays forbidden. Watching for somebody *else* pressing it is not acting; it
   * is how the guide learns the task is finished, and refusing to look meant a
   * walkthrough sat at "3 of 3" while the application went off and created the
   * client.
   */
  it('never offers to commit, but does watch for it', async () => {
    const { watched, fire, interaction } = seam();
    await stepping(interaction);
    // Step one is a trigger, so the advance is an offer to act and moving on
    // without acting is Skip. Step two is typing, so the advance is Next.
    fireEvent.click(screen.getByTestId('guide-step-skip'));
    await waitFor(() => expect(position()).toBe('2 of 3'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(position()).toBe('3 of 3'));

    // No offer to press it.
    expect(screen.queryByTestId('guide-step-perform')).toBeNull();
    // But it is being watched.
    expect(watched).toContain('clients.create-dialog.submit');

    // And doing it ends the walkthrough, rather than leaving the reader to
    // confirm work the guide just watched them finish.
    fire['clients.create-dialog.submit']?.();
    await waitFor(() => expect(screen.queryByText(/of 3$/)).toBeNull());
  });

  /** The completion is recorded, and only by actually completing it. */
  it('records the completion when the last step is done in the application', async () => {
    const kinds: string[] = [];
    const made = seam();
    render(
      <StatewaveGuide
        ask={() => RESPONSE}
        execute={async (action) => ({ status: 'done', action }) as never}
        stepInteraction={made.interaction}
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

    fireEvent.click(screen.getByTestId('guide-step-skip'));
    await waitFor(() => expect(position()).toBe('2 of 3'));
    fireEvent.click(screen.getByTestId('guide-step-next'));
    await waitFor(() => expect(position()).toBe('3 of 3'));
    expect(kinds).not.toContain('STEP_THROUGH_COMPLETED');

    made.fire['clients.create-dialog.submit']?.();

    await waitFor(() => expect(kinds).toContain('STEP_THROUGH_COMPLETED'));
  });

  it('presses the control for the user, and the walkthrough follows', async () => {
    const { pressed, interaction } = seam();
    await stepping(interaction);

    fireEvent.click(screen.getByTestId('guide-step-perform'));

    await waitFor(() => expect(pressed).toEqual(['clients.create']));
    await waitFor(() => expect(position()).toBe('2 of 3'));
  });

  /**
   * Show me points, and points only.
   *
   * It drove the walkthrough for a while — pressing each control the contract
   * allowed, one after another. It worked, and it was the wrong default: a
   * guide that operates an application without being told to, every time, is a
   * guide somebody has to watch. The only press it makes now is the one behind
   * "Do it for me".
   */
  it('never presses anything on its own', async () => {
    const { pressed, interaction } = seam();
    await answered(interaction);

    fireEvent.click(screen.getByRole('button', { name: /Show me/ }));
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(pressed).toEqual([]);
    // And it is not a dead end: the ring can be put down, and the walkthrough
    // is one button away.
    expect(screen.getByTestId('guide-step-through')).toBeDefined();
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
