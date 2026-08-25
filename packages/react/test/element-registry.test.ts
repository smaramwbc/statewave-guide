import { describe, expect, it, vi } from 'vitest';
import { createElementRegistry } from '../src/element-registry.js';
import { intersectionObservers } from './setup.js';

function connectedNode(id?: string): HTMLButtonElement {
  const node = document.createElement('button');
  if (id) node.setAttribute('data-guide', id);
  document.body.appendChild(node);
  return node;
}

describe('createElementRegistry', () => {
  it('yields a DOM-free view of a registration', () => {
    const registry = createElementRegistry();
    registry.register({ id: 'clients.create', type: 'button', label: 'New Client' });

    expect(registry.get('clients.create')).toEqual({
      id: 'clients.create',
      type: 'button',
      label: 'New Client',
      featureId: 'clients',
      mounted: false,
      visible: false,
    });

    const node = connectedNode();
    registry.setNode('clients.create', node);

    const element = registry.get('clients.create');
    expect(element?.mounted).toBe(true);
    // The point of the public interface: there is no route from a
    // RegisteredElement back to the page.
    for (const value of Object.values(element ?? {})) {
      expect(value).not.toBeInstanceOf(HTMLElement);
    }
    expect(Object.values(element ?? {})).not.toContain(node);
  });

  it('throws on an id that is really a selector', () => {
    const registry = createElementRegistry();
    expect(() => registry.register({ id: '#app > div' })).toThrow(/not a valid/i);
    expect(() => registry.register({ id: 'Clients.Create' })).toThrow(/not a valid/i);
    expect(registry.list()).toEqual([]);
  });

  it('defaults featureId to the id namespace', () => {
    const registry = createElementRegistry();
    registry.register({ id: 'clients.create.submit-button' });
    registry.register({ id: 'dashboard' });
    registry.register({ id: 'clients.export', featureId: 'reporting' });

    expect(registry.get('clients.create.submit-button')?.featureId).toBe('clients.create');
    expect(registry.get('dashboard')?.featureId).toBe('dashboard');
    expect(registry.get('clients.export')?.featureId).toBe('reporting');
  });

  it('does not let a stale disposer remove a re-registration', () => {
    const onWarning = vi.fn();
    const registry = createElementRegistry({ onWarning });

    const disposeFirst = registry.register({ id: 'clients.create', label: 'first' });
    registry.register({ id: 'clients.create', label: 'second' });
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('clients.create'));

    disposeFirst();

    expect(registry.has('clients.create')).toBe(true);
    expect(registry.get('clients.create')?.label).toBe('second');
  });

  it('keeps a stable snapshot identity until something actually changes', () => {
    const registry = createElementRegistry();
    registry.register({ id: 'clients.create', label: 'New Client' });

    const first = registry.getSnapshot();
    expect(registry.getSnapshot()).toBe(first);

    // A no-op update must not invalidate the cache, or useSyncExternalStore
    // re-renders on every unrelated commit.
    registry.update('clients.create', { label: 'New Client' });
    expect(registry.getSnapshot()).toBe(first);

    registry.update('clients.create', { label: 'Add Client' });
    const second = registry.getSnapshot();
    expect(second).not.toBe(first);
    expect(second[0]?.label).toBe('Add Client');

    registry.register({ id: 'clients.export' });
    expect(registry.getSnapshot()).not.toBe(second);
    expect(registry.getSnapshot().map((element) => element.id)).toEqual([
      'clients.create',
      'clients.export',
    ]);
  });

  it('notifies subscribers and stops when unsubscribed', () => {
    const registry = createElementRegistry();
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);

    registry.register({ id: 'clients.create' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    registry.register({ id: 'clients.export' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reports visibility from the IntersectionObserver', () => {
    const registry = createElementRegistry();
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', connectedNode());

    // Mounted, but the observer has not reported yet.
    expect(registry.get('clients.create')?.mounted).toBe(true);
    expect(registry.visibleIds()).toEqual([]);

    intersectionObservers.at(-1)?.trigger(true);
    expect(registry.visibleIds()).toEqual(['clients.create']);

    intersectionObservers.at(-1)?.trigger(false);
    expect(registry.visibleIds()).toEqual([]);
  });

  it('drops the node — and the visibility — when it detaches', () => {
    const registry = createElementRegistry();
    registry.register({ id: 'clients.create' });
    const node = connectedNode();
    registry.setNode('clients.create', node);
    intersectionObservers.at(-1)?.trigger(true);
    expect(registry.get('clients.create')?.visible).toBe(true);

    registry.setNode('clients.create', null);
    expect(registry.get('clients.create')).toMatchObject({ mounted: false, visible: false });
  });

  describe('resolveNode', () => {
    it('prefers the attached node', () => {
      const registry = createElementRegistry();
      const node = connectedNode();
      registry.register({ id: 'clients.create' });
      registry.setNode('clients.create', node);
      expect(registry.resolveNode('clients.create')).toBe(node);
    });

    it('falls back to an element declared only by a data-guide attribute', () => {
      const registry = createElementRegistry();
      const node = connectedNode('clients.export');
      expect(registry.has('clients.export')).toBe(false);
      expect(registry.resolveNode('clients.export')).toBe(node);
    });

    it('recognises the legacy data-ai-id attribute', () => {
      const registry = createElementRegistry();
      const node = document.createElement('div');
      node.setAttribute('data-ai-id', 'clients.legacy');
      document.body.appendChild(node);
      expect(registry.resolveNode('clients.legacy')).toBe(node);
    });

    it('returns null for an unknown id, and when DOM fallback is off', () => {
      const registry = createElementRegistry();
      expect(registry.resolveNode('nothing.here')).toBeNull();

      const strict = createElementRegistry({ resolveFromDom: false });
      connectedNode('clients.create');
      expect(strict.resolveNode('clients.create')).toBeNull();
    });

    it('refuses a selector-shaped id, with or without CSS.escape', () => {
      const registry = createElementRegistry();
      const secret = document.createElement('input');
      secret.type = 'password';
      document.body.appendChild(secret);

      const injected = 'x"], input[type="password';
      expect(registry.resolveNode(injected)).toBeNull();

      // `CSS.escape` is the belt; `isValidGuideElementId` is the braces. A
      // jsdom, happy-dom or prerender document often has no CSS global at all,
      // and that must not be what stands between an id and a DOM query.
      const original = globalThis.CSS;
      try {
        // @ts-expect-error deliberately removing the optional global
        delete globalThis.CSS;
        expect(registry.resolveNode(injected)).toBeNull();
        expect(registry.resolveNode('#app > div:nth-child(4)')).toBeNull();
      } finally {
        globalThis.CSS = original;
      }
    });

    it('ignores a registered node that has left the document', () => {
      const registry = createElementRegistry();
      const node = connectedNode();
      registry.register({ id: 'clients.create' });
      registry.setNode('clients.create', node);
      node.remove();
      expect(registry.resolveNode('clients.create')).toBeNull();
    });
  });

  it('destroy drops every registration and stays usable', () => {
    const registry = createElementRegistry();
    registry.register({ id: 'clients.create' });
    registry.setNode('clients.create', connectedNode());

    registry.destroy();
    expect(registry.list()).toEqual([]);

    registry.register({ id: 'clients.create' });
    expect(registry.has('clients.create')).toBe(true);
  });
});
