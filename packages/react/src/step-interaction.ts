/**
 * Watching for the step the user is on, and — sometimes — taking it for them.
 *
 * Two conveniences with one thing in common: both need a DOM node, and a node
 * is the thing this package hands out least willingly. Everything else the
 * panel does reaches the page through inert safe actions; this is the seam
 * where a guide touches the application, so it is a separate object a host has
 * to pass in deliberately. A `StatewaveGuide` with no `stepInteraction` neither
 * watches nor presses, which is the behaviour every earlier release had.
 *
 * **What is allowed is not decided here.** The query contract decides it, from
 * what each step was compiled as, and puts the verdict on the step
 * (`performance.byGuide`). This module presses what it is told to press. That
 * split is the same one ADR 0022 draws everywhere else: deciding is the
 * contract's, doing is the host's, and a renderer that decided for itself would
 * be the bug.
 *
 * @packageDocumentation
 */

import type { GuideElementRegistry } from './element-registry.js';
import { internalsOf } from './registry-internals.js';
import type { HighlightController } from './highlight/controller.js';

/** The seam a panel uses to watch for, and take, a step's interaction. */
export interface GuideStepInteraction {
  /**
   * Calls `onInteract` when the user operates the control `semanticId` names.
   *
   * Returns a disposer. Listening is passive — the event is observed on its way
   * up and never cancelled, so the application behaves exactly as it would with
   * nobody watching.
   */
  observe(semanticId: string, onInteract: () => void): () => void;
  /**
   * Presses the control `semanticId` names, as the user would.
   *
   * Resolves `false` when nothing is mounted under that id, which is an
   * ordinary outcome — the dialog is not open yet — and not an error.
   */
  press(semanticId: string): Promise<boolean>;
}

/**
 * Binds the two conveniences to a live element registry.
 *
 * ```tsx
 * const stepInteraction = useMemo(() => createStepInteraction(registry), [registry]);
 * <StatewaveGuide … stepInteraction={stepInteraction} />
 * ```
 */
export interface StepInteractionOptions {
  /**
   * The controller drawing the ring, so a press the guide makes is visible.
   *
   * Optional, and worth passing. `node.click()` produces no `:active` state and
   * no feedback of any kind — the dialog simply appears, and nothing connects it
   * to the button. Given the controller, the ring takes the success colour for a
   * moment first, so the reader sees which control was pressed and that the
   * guide is what pressed it.
   */
  highlight?: HighlightController;
}

export function createStepInteraction(
  registry: GuideElementRegistry,
  options: StepInteractionOptions = {},
): GuideStepInteraction {
  const internals = internalsOf(registry);

  return {
    observe(semanticId, onInteract) {
      const node = internals.resolveNode(semanticId);
      if (node === undefined) return () => {};

      // Bubble phase, not capture, and nothing is prevented. A walkthrough that
      // swallowed the click it was waiting for would break the very interaction
      // it exists to notice.
      const listener = (): void => onInteract();
      node.addEventListener('click', listener);
      // Keyboard operation of a button fires a click too, so one listener
      // covers both — except for a form submitted with Enter from a field,
      // which never reaches the button at all. That case is a `confirmation`
      // step, which is never watched for automation anyway.
      return () => node.removeEventListener('click', listener);
    },

    async press(semanticId) {
      const node = internals.resolveNode(semanticId);
      if (node === undefined) return false;
      // Shown before the click, not after — which is the same moment a real
      // button shows `:active`, and the only moment that works here. The click
      // advances the walkthrough synchronously, so an acknowledgement afterwards
      // would be drawn on whichever control the ring had already moved to.
      await options.highlight?.showPress();
      // `click()` rather than a synthesised MouseEvent: it is the same entry
      // point assistive technology uses, so a host that works with a screen
      // reader works with this, and a host that has disabled the control gets
      // the no-op it would give anybody else.
      node.click();
      return true;
    },
  };
}
