/**
 * The guidance engine.
 *
 * Everything an agent can do to the user's attention goes through this file:
 * highlight a semantic id, scroll to a semantic id, clear. There is no method
 * that takes a selector, and there is none that returns a node.
 *
 * Failure is data, never an exception. `highlight('does.not.exist')` resolves
 * to `{ ok: false, reason: 'not-registered' }` and leaves the document exactly
 * as it found it — no half-built overlay, no orphaned listeners.
 *
 * @packageDocumentation
 */

import type { HighlightPlacement } from '@statewavedev/guide-shared';
import type { InternalElementRegistry } from '../element-registry.js';
import { createOverlay, type OverlayHandle, type ResolvedHighlightOptions } from './overlay.js';
import { scrollElementIntoView, waitForScrollEnd } from './scroll.js';
import { injectHighlightStyles } from './styles.js';

/** How a highlight should look and behave. */
export interface HighlightOptions {
  /** Heading shown in the popover. */
  title?: string;
  /** Body text shown in the popover. */
  message?: string;
  /** Preferred popover placement. Defaults to `auto`. */
  placement?: HighlightPlacement;
  /** Pixels between the target and the spotlight edge. Defaults to 8. */
  padding?: number;
  /** Clear the highlight automatically after this many milliseconds. */
  durationMs?: number;
  /** Scroll the target into view first. Defaults to `true`. */
  scrollIntoView?: boolean;
}

/** Why a highlight or a scroll could not happen. */
export type HighlightFailureReason = 'not-registered' | 'not-mounted';

/** The outcome of a {@link HighlightController.highlight} call. */
export type HighlightResult =
  | { ok: true; id: string }
  | { ok: false; id: string; reason: HighlightFailureReason; message: string };

/** The outcome of a {@link HighlightController.scrollTo} call. */
export type ScrollResult =
  | { ok: true; id: string }
  | { ok: false; id: string; reason: HighlightFailureReason; message: string };

/** Options for {@link HighlightController.scrollTo}. */
export interface ScrollToOptions {
  /** Vertical alignment of the target. Defaults to `center`. */
  block?: ScrollLogicalPosition;
  /** Scroll behaviour. Defaults to `smooth`. */
  behavior?: ScrollBehavior;
}

/** Drives the built-in spotlight. */
export interface HighlightController {
  /** Highlights an element. Resolves once any scrolling has settled. Never throws. */
  highlight(id: string, options?: HighlightOptions): Promise<HighlightResult>;
  /** Removes the current highlight. Safe to call when nothing is highlighted. */
  clear(): void;
  /** Scrolls an element into view. Resolves when the scroll settles. Never throws. */
  scrollTo(id: string, options?: ScrollToOptions): Promise<ScrollResult>;
  /** The semantic id currently highlighted, or `null`. */
  readonly activeId: string | null;
  /** Subscribes to highlight changes. Returns an unsubscribe function. */
  subscribe(listener: (activeId: string | null) => void): () => void;
  /**
   * Removes every listener, cancels every frame and timer, and takes the
   * overlay out of the DOM. The controller stays usable afterwards, which is
   * what makes React StrictMode's double-mount harmless.
   */
  destroy(): void;
}

/** Configuration for {@link createHighlightController}. */
export interface HighlightControllerOptions {
  /** The live element registry. The only thing that can resolve an id to a node. */
  registry: InternalElementRegistry;
  /** Document to draw into. Defaults to the ambient `document`. */
  document?: Document;
  /** Window to listen on. Defaults to the document's default view. */
  window?: Window;
  /**
   * Defaults applied to every highlight.
   *
   * Read once, when the controller is created.
   */
  defaults?: Partial<HighlightOptions>;
  /** Where development warnings go. This package never writes to the console itself. */
  onWarning?: (message: string) => void;
}

const DEFAULT_PADDING = 8;

/** What the controller is currently pointing at. */
interface ActiveHighlight {
  id: string;
  node: HTMLElement;
  options: ResolvedHighlightOptions;
}

/** Creates a {@link HighlightController}. */
export function createHighlightController(
  options: HighlightControllerOptions,
): HighlightController {
  const registry = options.registry;
  const defaults = options.defaults ?? {};
  const doc = options.document ?? (typeof document === 'undefined' ? null : document);
  const win = options.window ?? doc?.defaultView ?? (typeof window === 'undefined' ? null : window);

  const listeners = new Set<(activeId: string | null) => void>();

  let overlay: OverlayHandle | null = null;
  let active: ActiveHighlight | null = null;
  let activeId: string | null = null;
  let listening = false;
  let mutationObserver: MutationObserver | null = null;
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Every scroll-settle wait that has not resolved yet.
   *
   * `waitForScrollEnd` owns a timer and a frame loop, and neither belongs to the
   * controller once it has been destroyed — so `clear()` aborts them rather than
   * leaving them measuring a node the host has already unmounted.
   */
  const pendingScrollWaits = new Set<AbortController>();
  /**
   * Guards against an older `highlight()` finishing its scroll after a newer
   * one has taken over. Bumped by every highlight and by every clear.
   */
  let sequence = 0;

  function warn(message: string): void {
    options.onWarning?.(message);
  }

  function setActiveId(next: string | null): void {
    if (activeId === next) return;
    activeId = next;
    for (const listener of [...listeners]) listener(activeId);
  }

  function resolveOptions(input: HighlightOptions): ResolvedHighlightOptions {
    // Merged field by field rather than by spreading: an explicit `undefined`
    // in `input` must not erase a configured default.
    return {
      title: input.title ?? defaults.title,
      message: input.message ?? defaults.message,
      placement: input.placement ?? defaults.placement ?? 'auto',
      padding: input.padding ?? defaults.padding ?? DEFAULT_PADDING,
      durationMs: input.durationMs ?? defaults.durationMs,
      scrollIntoView: input.scrollIntoView ?? defaults.scrollIntoView ?? true,
    };
  }

  function cancelTimer(): void {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function cancelScrollWaits(): void {
    if (pendingScrollWaits.size === 0) return;
    for (const pending of [...pendingScrollWaits]) pending.abort();
    pendingScrollWaits.clear();
  }

  /** Scrolls, then waits for the page to settle — cancellably. */
  async function settleScroll(node: HTMLElement): Promise<void> {
    if (!win) return;
    const pending = new AbortController();
    pendingScrollWaits.add(pending);
    try {
      await waitForScrollEnd(win, { node, signal: pending.signal });
    } finally {
      pendingScrollWaits.delete(pending);
    }
  }

  function cancelFrame(): void {
    if (frame === null) return;
    if (win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame);
    frame = null;
  }

  function reposition(): void {
    if (!active || !overlay) return;
    // The cheapest possible unmount detector, and it runs exactly where the
    // work already is: no unconditional rAF loop while nothing is highlighted.
    if (!active.node.isConnected) {
      clear();
      return;
    }
    overlay.position(active.node.getBoundingClientRect(), active.options);
  }

  function scheduleReposition(): void {
    if (!active) return;
    if (frame !== null) return;
    if (!win || typeof win.requestAnimationFrame !== 'function') {
      reposition();
      return;
    }
    // Many scroll events, one layout pass.
    frame = win.requestAnimationFrame(() => {
      frame = null;
      reposition();
    });
  }

  function onViewportChange(): void {
    scheduleReposition();
  }

  function onMutation(): void {
    if (active && !active.node.isConnected) {
      clear();
      return;
    }
    scheduleReposition();
  }

  function attachListeners(): void {
    if (listening || !doc) return;
    listening = true;
    // Capture, so scrolling inside a nested container is caught too; passive,
    // because the handler never calls preventDefault.
    doc.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    win?.addEventListener('resize', onViewportChange, { passive: true });

    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(onMutation);
      mutationObserver.observe(doc.documentElement ?? doc, { childList: true, subtree: true });
    }
  }

  function detachListeners(): void {
    if (!listening) return;
    listening = false;
    doc?.removeEventListener('scroll', onViewportChange, { capture: true });
    win?.removeEventListener('resize', onViewportChange);
    mutationObserver?.disconnect();
    mutationObserver = null;
  }

  function ensureOverlay(): OverlayHandle | null {
    if (!doc) return null;
    if (!overlay) {
      injectHighlightStyles(doc);
      overlay = createOverlay(doc);
    }
    return overlay;
  }

  function clear(): void {
    sequence += 1;
    cancelTimer();
    cancelFrame();
    cancelScrollWaits();
    detachListeners();
    overlay?.destroy();
    overlay = null;
    active = null;
    setActiveId(null);
  }

  function failure(id: string, reason: HighlightFailureReason): HighlightResult & { ok: false } {
    const message =
      reason === 'not-mounted'
        ? `Guide element "${id}" is registered but is not currently mounted in the document.`
        : `No guide element is registered as "${id}".`;
    warn(message);
    return { ok: false, id, reason, message };
  }

  /** Resolves the id, or explains which of the two ways it failed. */
  function locate(id: string): HTMLElement | HighlightFailureReason {
    const node = registry.resolveNode(id);
    if (node) return node;
    return registry.has(id) ? 'not-mounted' : 'not-registered';
  }

  async function highlight(id: string, input: HighlightOptions = {}): Promise<HighlightResult> {
    const located = locate(id);
    if (typeof located === 'string') return failure(id, located);
    if (!doc) return failure(id, 'not-mounted');

    const resolved = resolveOptions(input);
    const token = (sequence += 1);

    cancelTimer();
    const handle = ensureOverlay();
    if (!handle) return failure(id, 'not-mounted');

    active = { id, node: located, options: resolved };
    handle.setContent(resolved.title, resolved.message);
    reposition();
    attachListeners();
    setActiveId(id);

    if (resolved.scrollIntoView) {
      scrollElementIntoView(located, { block: 'center', behavior: 'smooth' });
      await settleScroll(located);
    }

    // A newer highlight (or a clear) took over while we were scrolling. It owns
    // the overlay now; report our own success and get out of its way.
    if (token !== sequence) return { ok: true, id };

    if (!located.isConnected) {
      clear();
      return {
        ok: false,
        id,
        reason: 'not-mounted',
        message: `Guide element "${id}" left the document while it was being scrolled into view.`,
      };
    }

    reposition();

    if (resolved.durationMs !== undefined) {
      timer = setTimeout(() => {
        timer = null;
        clear();
      }, resolved.durationMs);
    }

    return { ok: true, id };
  }

  async function scrollTo(id: string, input: ScrollToOptions = {}): Promise<ScrollResult> {
    const located = locate(id);
    if (typeof located === 'string') return failure(id, located);

    scrollElementIntoView(located, {
      block: input.block ?? 'center',
      behavior: input.behavior ?? 'smooth',
    });
    await settleScroll(located);

    return { ok: true, id };
  }

  return {
    highlight,
    clear,
    scrollTo,
    get activeId() {
      return activeId;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      clear();
      listeners.clear();
    },
  };
}
