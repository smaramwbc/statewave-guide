/**
 * The guide pressing a button, made visible.
 *
 * Reported from the running demo: Show me opened the dialog without the reader
 * ever seeing the button being pressed. A programmatic click fires no `:active`
 * state and no feedback of any kind, so the only thing on screen is a dialog
 * appearing from nowhere — and nothing connects it to the control the guide
 * actually operated.
 *
 * The acknowledgement is drawn on the guide's own ring rather than by reaching
 * into the host's styles, and it lands *before* the click. That ordering is the
 * whole thing: the click advances the walkthrough synchronously, so a mark made
 * afterwards would appear on whichever control the ring had already moved to —
 * the guide claiming to have pressed something it never touched.
 */

import { describe, expect, it } from 'vitest';
import { createElementRegistry } from '../src/element-registry.js';
import { internalsOf } from '../src/registry-internals.js';
import { createHighlightController } from '../src/highlight/controller.js';
import { createStepInteraction } from '../src/step-interaction.js';
import { stubRect } from './setup.js';

function harness() {
  const registry = createElementRegistry();
  const controller = createHighlightController({ registry });
  const internals = internalsOf(registry);

  const mount = (id: string): HTMLButtonElement => {
    const node = document.createElement('button');
    node.setAttribute('data-guide', id);
    document.body.append(node);
    stubRect(node, { top: 40, left: 20, width: 120, height: 30, bottom: 70, right: 140 });
    internals.register({ id });
    internals.setNode(id, node);
    return node;
  };
  return { registry, controller, mount };
}

const ring = (): Element | null => document.querySelector('.sw-guide-ring');
const isPressed = (): boolean => ring()?.hasAttribute('data-pressed') === true;

describe('acknowledging a press the guide made', () => {
  it('leaves the mark up for the caller to press under, then takes it off', async () => {
    const { controller, mount } = harness();
    mount('clients.create');
    await controller.highlight('clients.create', { scrollIntoView: false });
    expect(isPressed()).toBe(false);

    await controller.showPress();

    // Still marked when it resolves. The caller presses next, and the press has
    // to happen while the control is marked.
    expect(isPressed()).toBe(true);
    // And it does not stay marked for a press that advanced nothing.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(isPressed()).toBe(false);
    controller.destroy();
  });

  /**
   * The ordering that matters. Recorded from inside the click handler, which is
   * the only place that can prove the mark was up while the press happened.
   */
  it('shows the mark while the click is happening, not after', async () => {
    const { registry, controller, mount } = harness();
    const node = mount('clients.create');
    await controller.highlight('clients.create', { scrollIntoView: false });

    let pressedAtClick: boolean | undefined;
    node.addEventListener('click', () => {
      pressedAtClick = isPressed();
    });

    const interaction = createStepInteraction(registry, { highlight: controller });
    await interaction.press('clients.create');

    expect(pressedAtClick).toBe(true);
    controller.destroy();
  });

  /**
   * A mark left over from the previous control would be the guide claiming a
   * press it never made, on the very next thing it points at.
   */
  it('never carries a mark onto the next control', async () => {
    const { registry, controller, mount } = harness();
    mount('clients.create');
    mount('clients.create-dialog.email');
    await controller.highlight('clients.create', { scrollIntoView: false });

    const interaction = createStepInteraction(registry, { highlight: controller });
    const pressing = interaction.press('clients.create');
    // Mid-press: the mark is up. Move the ring on, the way advancing a step does.
    expect(isPressed()).toBe(true);
    await controller.highlight('clients.create-dialog.email', { scrollIntoView: false });
    expect(isPressed()).toBe(false);

    await pressing;
    expect(isPressed()).toBe(false);
    controller.destroy();
  });

  /** A host that draws no ring still gets its click. The mark is the extra. */
  it('presses without a controller to acknowledge with', async () => {
    const { registry, mount } = harness();
    const node = mount('clients.create');
    let clicked = 0;
    node.addEventListener('click', () => {
      clicked += 1;
    });

    const interaction = createStepInteraction(registry);
    expect(await interaction.press('clients.create')).toBe(true);
    expect(clicked).toBe(1);
  });

  /** Nothing highlighted, nothing to acknowledge with, and no crash. */
  it('does nothing when there is no ring', async () => {
    const { controller } = harness();
    await controller.showPress();
    expect(ring()).toBeNull();
    controller.destroy();
  });
});
