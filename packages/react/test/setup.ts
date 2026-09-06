/**
 * jsdom is missing three things this package legitimately uses. Rather than
 * bending the source around the gaps, they are filled here — and filled in a
 * way a test can drive, so visibility and scrolling stay deterministic instead
 * of becoming sleeps.
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/** A fake IntersectionObserver a test can fire by hand. */
export interface FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  targets: Set<Element>;
  /** Reports the given intersection state for every observed target. */
  trigger(isIntersecting: boolean, only?: Element[]): void;
}

/** Every observer created since the last reset, newest last. */
export const intersectionObservers: FakeIntersectionObserver[] = [];

class MockIntersectionObserver implements FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  targets = new Set<Element>();
  readonly root: Element | Document | null = null;
  readonly rootMargin = '0px';
  readonly thresholds: readonly number[] = [0];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    intersectionObservers.push(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    const index = intersectionObservers.indexOf(this);
    if (index >= 0) intersectionObservers.splice(index, 1);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(isIntersecting: boolean, only?: Element[]): void {
    const targets = only ?? [...this.targets];
    const entries = targets.map(
      (target) =>
        ({
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
          time: 0,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
        }) as IntersectionObserverEntry,
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;

// jsdom implements neither of these; the source guards for their absence, and
// the tests need them present so the guarded paths are not the only ones run.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    /* jsdom does not lay out or scroll. */
  };
}
window.scrollTo = function scrollTo(): void {
  /* jsdom throws "not implemented" from the real one. */
} as typeof window.scrollTo;

/**
 * Gives a node a real rect. `getBoundingClientRect` returns zeros everywhere in
 * jsdom, which is exactly the degenerate case the overlay maths has to survive
 * — so zeros stay the default and a test opts in to geometry.
 */
export function stubRect(node: Element, rect: Partial<DOMRect>): void {
  const full = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    ...rect,
  };
  node.getBoundingClientRect = () => ({ ...full, toJSON: () => full }) as DOMRect;
}

afterEach(() => {
  cleanup();
  intersectionObservers.length = 0;
  // Every test starts from an empty document. The registry resolves ids out of
  // the DOM by design, so a node left behind by one test would be found by the
  // next one.
  document.body.replaceChildren();
  document.querySelectorAll('[data-statewave-guide]').forEach((node) => node.remove());
});

// A fourth gap: jsdom has no `matchMedia`, and the panel asks for one to decide
// whether it is on a narrow screen. Non-matching is the desktop case, which is
// what these tests are describing.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
