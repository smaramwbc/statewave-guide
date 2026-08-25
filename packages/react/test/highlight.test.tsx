import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { createElementRegistry, type InternalElementRegistry } from '../src/element-registry.js';
import {
  createHighlightController,
  type HighlightController,
} from '../src/highlight/controller.js';
import { GuideElement } from '../src/guide-element.js';
import { StatewaveGuideProvider } from '../src/provider.js';
import { useGuide } from '../src/use-guide.js';
import { stubRect } from './setup.js';

function engine(): { registry: InternalElementRegistry; controller: HighlightController } {
  const registry = createElementRegistry();
  const controller = createHighlightController({ registry });
  return { registry, controller };
}

function mountedButton(id: string): HTMLButtonElement {
  const node = document.createElement('button');
  node.setAttribute('data-guide', id);
  document.body.appendChild(node);
  return node;
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

    expect(result).toEqual({ ok: true, id: 'clients.create' });
    expect(controller.activeId).toBe('clients.create');

    const overlay = overlayNodes();
    expect(overlay.root).not.toBeNull();
    expect(overlay.dimmers).toBe(4);
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

    expect(result).toMatchObject({ ok: false, id: 'clients.create', reason: 'not-registered' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('clients.create');
    expect(overlayNodes().root).toBeNull();
    expect(document.querySelectorAll('.sw-guide-dim')).toHaveLength(0);
    expect(controller.activeId).toBeNull();

    controller.destroy();
  });

  it('refuses a registered id whose node is not mounted', async () => {
    const { registry, controller } = engine();
    registry.register({ id: 'clients.create' });

    const result = await controller.highlight('clients.create');

    expect(result).toMatchObject({ ok: false, reason: 'not-mounted' });
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
      ok: true,
      id: 'clients.create',
    });
    await expect(controller.highlight('clients.create')).resolves.toEqual({
      ok: true,
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
      ok: false,
      reason: 'not-registered',
    });
    await expect(controller.scrollTo(injected)).resolves.toMatchObject({
      ok: false,
      reason: 'not-registered',
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
      await pending;

      // `waitForScrollEnd` owns a timeout and a self-perpetuating frame loop.
      // Left running they keep measuring a node the host has already unmounted.
      expect(vi.getTimerCount()).toBe(0);
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
    ).resolves.toEqual({ ok: true, id: 'clients.export' });

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
    ).resolves.toEqual({ ok: true, id: 'clients.create' });

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
