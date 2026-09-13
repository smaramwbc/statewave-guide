import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { createElementRegistry, type GuideElementRegistry } from '../src/element-registry.js';
import { internalsOf, type ElementRegistryInternals } from '../src/registry-internals.js';
import {
  createHighlightController,
  type HighlightController,
} from '../src/highlight/controller.js';
import { GuideElement } from '../src/guide-element.js';
import { StatewaveGuideProvider } from '../src/provider.js';
import { useGuide } from '../src/use-guide.js';
import { stubRect } from './setup.js';

function engine(controllerOptions: { dim?: boolean } = {}): {
  registry: GuideElementRegistry & ElementRegistryInternals;
  controller: HighlightController;
} {
  const registry = createElementRegistry();
  const controller = createHighlightController({ registry, ...controllerOptions });
  // The controller takes the public registry and finds the private half
  // itself; the test keeps both, the way the provider does.
  return { registry: { ...registry, ...internalsOf(registry) }, controller };
}

function mountedButton(id: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.setAttribute('data-guide', id);
  document.body.appendChild(node);
  return node;
}

/**
 * Gives a node a rect that moves on every read.
 *
 * The settle probe looks for two consecutive frames with an unchanged rect, so
 * this is a target the page never stops moving — a CSS animation, a spinner
 * shifting layout, a lazy image landing. It keeps a scroll wait genuinely
 * in-flight for as long as a test needs it.
 */
function neverSettles(node: Element): void {
  let top = 0;
  node.getBoundingClientRect = () => {
    top += 7;
    const rect = {
      x: 0,
      y: top,
      top,
      left: 0,
      right: 120,
      bottom: top + 24,
      width: 120,
      height: 24,
    };
    return { ...rect, toJSON: () => rect } as DOMRect;
  };
}

function overlayNodes(): { root: Element | null; dimmers: number; rings: number } {
  return {
    root: document.querySelector('[data-statewave-guide-overlay]'),
    dimmers: document.querySelectorAll('.sw-guide-dim').length,
    rings: document.querySelectorAll('.sw-guide-ring').length,
  };
}

describe('highlight controller', () => {
  it('highlights a registered, mounted element and puts the overlay in the document', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    stubRect(node, { top: 120, left: 40, width: 160, height: 32, bottom: 152, right: 200 });
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    const result = await controller.highlight('clients.create', {
      title: 'Create a client',
      message: 'Start here.',
      scrollIntoView: false,
    });

    expect(result).toEqual({ success: true, id: 'clients.create' });
    expect(controller.activeId).toBe('clients.create');

    const overlay = overlayNodes();
    expect(overlay.root).not.toBeNull();
    // Nothing is dimmed. A highlight is an invitation to use the control, and a
    // page behind a scrim reads as a page that has been switched off.
    expect(overlay.dimmers).toBe(0);
    expect(overlay.rings).toBe(1);

    const ring = document.querySelector<HTMLElement>('.sw-guide-ring');
    // padding defaults to 8: 120 - 8 = 112, 32 + 16 = 48.
    expect(ring?.style.top).toBe('112px');
    expect(ring?.style.height).toBe('48px');

    const popover = document.querySelector('.sw-guide-popover');
    expect(popover?.textContent).toContain('Create a client');
    expect(popover?.textContent).toContain('Start here.');

    controller.destroy();
  });

  /**
   * Dimming survives as a choice, not a default.
   *
   * A first-run tour, where nothing else on the page *should* be touched, is a
   * real case. It is just not the case a question-and-answer guide is in.
   */
  it('dims the page only when the host asks for it', async () => {
    const { registry, controller } = engine({ dim: true });
    const node = mountedButton('clients.create');
    stubRect(node, { top: 120, left: 40, width: 160, height: 32, bottom: 152, right: 200 });
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });

    expect(overlayNodes().dimmers).toBe(4);
    controller.destroy();
  });

  /**
   * The callout must never be in the way of the thing it points at.
   *
   * It is auto-placed beside the target, so in a dense form it routinely lands
   * over the next control in the sequence. Nothing inside it is interactive, so
   * clicks belong to the page underneath.
   */
  it('lets every pointer event through to the page', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    stubRect(node, { top: 120, left: 40, width: 160, height: 32, bottom: 152, right: 200 });
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', {
      title: 'Create a client',
      message: 'Start here.',
      scrollIntoView: false,
    });

    const styles = document.querySelector('style[data-statewave-guide]')?.textContent ?? '';
    const popoverRule = styles.slice(styles.indexOf('.sw-guide-popover {'));
    expect(popoverRule.slice(0, popoverRule.indexOf('}'))).toContain('pointer-events: none');
    controller.destroy();
  });

  /**
   * A caret is what makes this a callout rather than a notification that landed
   * nearby — it says *which* control the words are about, which is the whole
   * question in a form where six fields sit within forty pixels.
   */
  it('points the caret at the side the target is on', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    stubRect(node, { top: 10, left: 40, width: 160, height: 32, bottom: 42, right: 200 });
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', {
      message: 'Start here.',
      placement: 'bottom',
      scrollIntoView: false,
    });

    const popover = document.querySelector('.sw-guide-popover');
    expect(popover?.getAttribute('data-placement')).toBe('bottom');
    expect(popover?.querySelector('.sw-guide-popover-caret')).not.toBeNull();
    controller.destroy();
  });

  it('never produces NaN from a zero-size rect', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });

    for (const element of document.querySelectorAll<HTMLElement>(
      '.sw-guide-dim, .sw-guide-ring, .sw-guide-popover',
    )) {
      for (const property of ['top', 'left', 'width', 'height'] as const) {
        expect(element.style[property]).not.toContain('NaN');
      }
    }
    controller.destroy();
  });

  it('refuses an id that was never registered and adds nothing to the document', async () => {
    const { controller } = engine();

    const result = await controller.highlight('clients.create');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('target_not_found');
      expect(result.error.details).toEqual({ elementId: 'clients.create' });
      expect(result.error.message).toContain('clients.create');
    }
    expect(overlayNodes().root).toBeNull();
    expect(document.querySelectorAll('.sw-guide-dim')).toHaveLength(0);
    expect(controller.activeId).toBeNull();

    controller.destroy();
  });

  it('refuses a registered id whose node is not mounted', async () => {
    const { registry, controller } = engine();
    registry.register({ id: 'clients.create' });

    const result = await controller.highlight('clients.create');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('target_not_mounted');
      expect(result.error.details).toEqual({ elementId: 'clients.create' });
    }
    expect(overlayNodes().root).toBeNull();
    controller.destroy();
  });

  it('clear() removes the overlay and is safe to call twice', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });
    expect(overlayNodes().root).not.toBeNull();

    controller.clear();
    expect(overlayNodes().root).toBeNull();
    expect(controller.activeId).toBeNull();

    expect(() => {
      controller.clear();
    }).not.toThrow();
    expect(overlayNodes().root).toBeNull();

    controller.destroy();
  });

  it('clears itself when the highlighted element leaves the document', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });
    expect(controller.activeId).toBe('clients.create');

    node.remove();

    await waitFor(() => {
      expect(controller.activeId).toBeNull();
    });
    expect(overlayNodes().root).toBeNull();

    controller.destroy();
  });

  it('auto-clears after durationMs', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false, durationMs: 10 });
    expect(controller.activeId).toBe('clients.create');

    await waitFor(() => {
      expect(controller.activeId).toBeNull();
    });

    controller.destroy();
  });

  it('resolves the scroll even though jsdom never scrolls', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await expect(controller.scrollTo('clients.create')).resolves.toEqual({
      success: true,
      id: 'clients.create',
    });
    await expect(controller.highlight('clients.create')).resolves.toEqual({
      success: true,
      id: 'clients.create',
    });

    controller.destroy();
  });

  it('repositions on a scroll event without looping when idle', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    stubRect(node, { top: 500, left: 0, width: 100, height: 20, bottom: 520, right: 100 });
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });
    expect(document.querySelector<HTMLElement>('.sw-guide-ring')?.style.top).toBe('492px');

    stubRect(node, { top: 100, left: 0, width: 100, height: 20, bottom: 120, right: 100 });
    document.dispatchEvent(new Event('scroll'));

    await waitFor(() => {
      expect(document.querySelector<HTMLElement>('.sw-guide-ring')?.style.top).toBe('92px');
    });

    controller.destroy();
  });

  it('repositions on a resize as well as on a scroll', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    stubRect(node, { top: 500, left: 0, width: 100, height: 20, bottom: 520, right: 100 });
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });
    expect(document.querySelector<HTMLElement>('.sw-guide-ring')?.style.top).toBe('492px');

    stubRect(node, { top: 100, left: 0, width: 100, height: 20, bottom: 120, right: 100 });
    window.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      expect(document.querySelector<HTMLElement>('.sw-guide-ring')?.style.top).toBe('92px');
    });

    controller.destroy();
  });

  it('does not let a cleared durationMs timer clear a later highlight', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false, durationMs: 10 });
    controller.clear();

    await controller.highlight('clients.create', { scrollIntoView: false });
    await new Promise((resolve) => setTimeout(resolve, 40));

    // The 10ms timer belonged to a highlight that is long gone.
    expect(controller.activeId).toBe('clients.create');

    controller.destroy();
  });

  it('refuses a selector-shaped id handed straight to the controller', async () => {
    const { controller } = engine();
    const secret = document.createElement('input');
    secret.type = 'password';
    document.body.appendChild(secret);

    // `highlight()` and `scrollTo()` take a plain string, and the hooks expose
    // them directly — so the semantic-id check has to hold here too, not only
    // on the action schemas an agent goes through.
    const injected = 'x"], input[type="password';
    await expect(controller.highlight(injected, { scrollIntoView: false })).resolves.toMatchObject({
      success: false,
      error: { code: 'invalid_input', details: { elementId: injected } },
    });
    await expect(controller.scrollTo(injected)).resolves.toMatchObject({
      success: false,
      error: { code: 'invalid_input', details: { elementId: injected } },
    });
    expect(overlayNodes().root).toBeNull();
    expect(controller.activeId).toBeNull();

    controller.destroy();
  });

  it('destroy() cancels a scroll it was still waiting on', async () => {
    vi.useFakeTimers();
    try {
      const { registry, controller } = engine();
      const node = mountedButton('clients.create');
      registry.register({ id: 'clients.create' });
      registry.setNode('clients.create', node);

      const pending = controller.highlight('clients.create', { scrollIntoView: true });
      controller.destroy();
      const result = await pending;

      // A destroyed controller did not fail to find the element — it was told
      // to stop. That is `cancelled`, and it is distinguishable from every
      // other reason a highlight can come back unsuccessful.
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('cancelled');
        expect(result.error.details).toEqual({ elementId: 'clients.create' });
      }

      // `waitForScrollEnd` owns a timeout and a self-perpetuating frame loop.
      // Left running they keep measuring a node the host has already unmounted.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a target that left the document mid-scroll as target_not_mounted', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    neverSettles(node);
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    const pending = controller.highlight('clients.create', { scrollIntoView: true });
    node.remove();
    const result = await pending;

    // The mutation observer aborts the settle wait the moment the target
    // disconnects, so this arrives as an aborted wait exactly like a `clear()`
    // does — and the two must not be reported as the same thing. A caller that
    // retries a cancelled operation would retry forever against an element
    // that has gone.
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('target_not_mounted');
      expect(result.error.details).toEqual({ elementId: 'clients.create' });
    }
    expect(overlayNodes().root).toBeNull();
    expect(controller.activeId).toBeNull();

    controller.destroy();
  });

  it('still reports a caller-initiated clear() mid-scroll as cancelled', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    neverSettles(node);
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    const pending = controller.highlight('clients.create', { scrollIntoView: true });
    controller.clear();
    const result = await pending;

    // Same aborted wait, node still in the document: this one really was a
    // cancel, and it stays one.
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('cancelled');
    expect(node.isConnected).toBe(true);

    controller.destroy();
  });

  it('honours an AbortSignal, and takes the spotlight back down with it', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    neverSettles(node);
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    const abort = new AbortController();
    const pending = controller.highlight('clients.create', {
      scrollIntoView: true,
      signal: abort.signal,
    });
    // The spotlight goes up before the scroll is awaited, so there is something
    // to be left holding if a cancel is not honoured.
    expect(controller.activeId).toBe('clients.create');
    abort.abort();
    const result = await pending;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('cancelled');
      expect(result.error.details).toEqual({ elementId: 'clients.create' });
    }
    // A caller that cancelled is not left looking at an overlay.
    expect(controller.activeId).toBeNull();
    expect(overlayNodes().root).toBeNull();

    controller.destroy();
  });

  it('refuses an already-aborted signal without drawing anything', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    const abort = new AbortController();
    abort.abort();
    const result = await controller.highlight('clients.create', { signal: abort.signal });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('cancelled');
    expect(overlayNodes().root).toBeNull();
    expect(controller.activeId).toBeNull();

    controller.destroy();
  });

  it('keeps a highlight whose scroll never settles, and warns instead of failing', async () => {
    vi.useFakeTimers();
    try {
      const warnings: string[] = [];
      const registry = createElementRegistry();
      const controller = createHighlightController({
        registry,
        onWarning: (message) => warnings.push(message),
      });
      const internals = internalsOf(registry);
      const node = mountedButton('clients.create');
      neverSettles(node);
      internals.register({ id: 'clients.create' });
      internals.setNode('clients.create', node);

      const pending = controller.highlight('clients.create', { title: 'Here' });
      await vi.advanceTimersByTimeAsync(1200);
      const result = await pending;

      // `scrollIntoView` defaults to true, so this is the default path for any
      // target sitting next to an animation, a spinner or a lazy image. The
      // element was found, the spotlight is on it and the listeners keep it
      // there: failing here would have contradicted the promise that a failure
      // leaves nothing behind, and would have made those targets permanently
      // un-highlightable.
      expect(result).toEqual({ success: true, id: 'clients.create' });
      expect(controller.activeId).toBe('clients.create');
      expect(overlayNodes().root).not.toBeNull();
      expect(warnings.some((message) => message.includes('did not settle'))).toBe(true);

      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does report a scrollTo that never settles as timeout', async () => {
    vi.useFakeTimers();
    try {
      const { registry, controller } = engine();
      const node = mountedButton('clients.create');
      neverSettles(node);
      registry.register({ id: 'clients.create' });
      registry.setNode('clients.create', node);

      const pending = controller.scrollTo('clients.create');
      await vi.advanceTimersByTimeAsync(1200);
      const result = await pending;

      // Scrolling was the entire job here, and nothing was left behind that the
      // caller could still use — so unlike `highlight`, this one is a failure.
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('timeout');
        expect(result.error.details).toEqual({ elementId: 'clients.create' });
      }

      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('highlights an element that only the DOM knows about', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.export');

    // Never registered through React: the attribute alone makes it addressable.
    expect(registry.has('clients.export')).toBe(false);
    expect(registry.resolveNode('clients.export')).toBe(node);

    await expect(
      controller.highlight('clients.export', { scrollIntoView: false }),
    ).resolves.toEqual({ success: true, id: 'clients.export' });

    controller.destroy();
  });

  it('destroy() leaves nothing behind and the controller still works', async () => {
    const { registry, controller } = engine();
    const node = mountedButton('clients.create');
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', node);

    await controller.highlight('clients.create', { scrollIntoView: false });
    controller.destroy();

    expect(overlayNodes().root).toBeNull();
    await expect(
      controller.highlight('clients.create', { scrollIntoView: false }),
    ).resolves.toEqual({ success: true, id: 'clients.create' });

    controller.destroy();
  });
});

describe('highlight through React', () => {
  function Highlighter({ id }: { id: string }): ReactNode {
    const { highlightElement, activeHighlightId } = useGuide();
    useEffect(() => {
      void highlightElement(id, { scrollIntoView: false });
    }, [highlightElement, id]);
    return <div data-testid="active">{activeHighlightId ?? 'none'}</div>;
  }

  it('clears the highlight when the highlighted component unmounts', async () => {
    function App({ show }: { show: boolean }): ReactNode {
      return (
        <StatewaveGuideProvider>
          {show ? (
            <GuideElement id="clients.create" type="button">
              <button type="button">New Client</button>
            </GuideElement>
          ) : null}
          <Highlighter id="clients.create" />
        </StatewaveGuideProvider>
      );
    }

    const { rerender } = render(<App show />);
    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('clients.create');
    });

    rerender(<App show={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('none');
    });
    expect(document.querySelector('[data-statewave-guide-overlay]')).toBeNull();
  });
});
