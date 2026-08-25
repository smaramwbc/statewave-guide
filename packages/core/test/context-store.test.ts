import { describe, expect, it, vi } from 'vitest';
import { createContextStore } from '../src/index.js';

describe('createContextStore', () => {
  it('starts empty and validates the initial value', () => {
    expect(createContextStore().get()).toEqual({});
    expect(createContextStore({ route: '/clients' }).get()).toEqual({ route: '/clients' });
  });

  it('replaces the whole context on set', () => {
    const store = createContextStore({ route: '/a', permissions: ['x'] });
    store.set({ route: '/b' });
    expect(store.get()).toEqual({ route: '/b' });
  });

  it('rejects a malformed context loudly', () => {
    const store = createContextStore();
    expect(() => store.set({ permissions: 'clients.read' } as never)).toThrow();
    expect(store.get()).toEqual({});
  });

  it('strips unknown top-level keys — host data belongs under metadata', () => {
    const store = createContextStore();
    store.set({ route: '/a', tenant: 'acme' } as never);
    expect(store.get()).toEqual({ route: '/a' });
  });

  describe('patch', () => {
    it('leaves untouched fields alone', () => {
      // The reason patch exists: a router reporting a route change must not
      // erase the permissions the auth layer reported a moment earlier.
      const store = createContextStore({ route: '/a', permissions: ['clients.read'] });
      store.patch({ route: '/b' });
      expect(store.get()).toEqual({ route: '/b', permissions: ['clients.read'] });
    });

    it('treats undefined as "leave alone" and null as "clear"', () => {
      const store = createContextStore({ route: '/a', screen: 'A', userId: 'u1' });
      store.patch({ route: undefined, screen: null });
      expect(store.get()).toEqual({ route: '/a', userId: 'u1' });
    });

    it('validates the merged result', () => {
      const store = createContextStore({ route: '/a' });
      expect(() => store.patch({ selectedEntity: { type: 'client' } as never })).toThrow();
      expect(store.get()).toEqual({ route: '/a' });
    });
  });

  describe('subscribe', () => {
    it('notifies listeners with the new context', () => {
      const store = createContextStore();
      const listener = vi.fn();
      store.subscribe(listener);

      store.set({ route: '/a' });
      store.patch({ screen: 'A' });

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenLastCalledWith({ route: '/a', screen: 'A' });
    });

    it('stops notifying after unsubscribe', () => {
      const store = createContextStore();
      const listener = vi.fn();
      store.subscribe(listener)();

      store.set({ route: '/a' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('survives a listener that unsubscribes during notification', () => {
      const store = createContextStore();
      const second = vi.fn();
      const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
      store.subscribe(second);

      expect(() => store.set({ route: '/a' })).not.toThrow();
      expect(second).toHaveBeenCalledOnce();
    });

    it('hands out a fresh object each change so identity comparison works', () => {
      const store = createContextStore({ route: '/a' });
      const before = store.get();
      store.patch({ screen: 'A' });
      expect(store.get()).not.toBe(before);
    });
  });
});
