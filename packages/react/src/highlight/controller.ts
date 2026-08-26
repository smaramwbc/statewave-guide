/**
 * The guidance engine.
 *
 * Everything an agent can do to the user's attention goes through this file:
 * highlight a semantic id, scroll to a semantic id, clear. There is no method
 * that takes a selector, and there is none that returns a node.
 *
 * Failure is data, never an exception, and the data is a {@link GuideError}
 * from the shared vocabulary rather than a private one. `highlight('ghost.id')`
 * resolves to `{ success: false, error: { code: 'target_not_found', … } }` and
 * leaves the document exactly as it found it — no half-built overlay, no
 * orphaned listeners. Every error carries `details.elementId`, so a caller can
 * act on the failure without reading the message.
 *
 * @packageDocumentation
 */

import {
  guideError,
  isValidGuideElementId,
  type GuideError,
  type GuideErrorCode,
  type HighlightPlacement,
} from '@statewavedev/guide-shared';
import type { GuideElementRegistry } from '../element-registry.js';
import { internalsOf } from '../registry-internals.js';
import { createOverlay, type OverlayHandle, type ResolvedHighlightOptions } from './overlay.js';
import { scrollElementIntoView, waitForScrollEnd, type ScrollSettleOutcome } from './scroll.js';
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
  /**
   * Cancels the call.
   *
   * Aborting while the target is being scrolled into view resolves the call as
   * `cancelled` *and takes the spotlight back down* — a caller that cancelled is
   * not left looking at an overlay it believes it cancelled.
   *
   * Per-call only: a signal set on {@link HighlightControllerOptions.defaults}
   * is ignored, because a default cancellation would cancel every later call
   * once it fired.
   */
  signal?: AbortSignal;
}

/**
 * The outcome of a {@link HighlightController.highlight} call.
 *
 * `error.code` is one of `invalid_input`, `target_not_found`,
 * `target_not_mounted` or `cancelled`.
 *
 * Not `timeout`: a scroll that never settles still leaves a correct, live
 * highlight on the element, so it succeeds and reports the unsettled page
 * through the warning sink. `scrollTo` does surface `timeout`, because there
 * scrolling was the entire job.
 */
export type HighlightResult =
  { success: true; id: string } | { success: false; id: string; error: GuideError };

/**
 * The outcome of a {@link HighlightController.scrollTo} call.
 *
 * Same codes as {@link HighlightResult}, plus `timeout`.
 */
export type ScrollResult =
  { success: true; id: string } | { success: false; id: string; error: GuideError };

/**
 * The outcome of a {@link HighlightController.checkTarget} call.
 *
 * Deliberately the same shape as {@link HighlightResult}: "can this id be acted
 * on?" and "was it acted on?" fail for exactly the same reasons, and a caller
 * that handles one handles the other.
 */
export type TargetResult =
  { success: true; id: string } | { success: false; id: string; error: GuideError };

/** Options for {@link HighlightController.scrollTo}. */
export interface ScrollToOptions {
  /** Vertical alignment of the target. Defaults to `center`. */
  block?: ScrollLogicalPosition;
  /** Scroll behaviour. Defaults to `smooth`. */
  behavior?: ScrollBehavior;
  /** Cancels the call. Aborting resolves it as `cancelled`. */
  signal?: AbortSignal;
}

/** Drives the built-in spotlight. */
export interface HighlightController {
  /** Highlights an element. Resolves once any scrolling has settled. Never throws. */
  highlight(id: string, options?: HighlightOptions): Promise<HighlightResult>;
  /** Removes the current highlight. Safe to call when nothing is highlighted. */
  clear(): void;
  /** Scrolls an element into view. Resolves when the scroll settles. Never throws. */
  scrollTo(id: string, options?: ScrollToOptions): Promise<ScrollResult>;
  /**
   * Reports whether a semantic id can be acted on right now, without touching
   * it and without returning what it found.
   *
   * This is how an action that delegates to the host — `open`, say — classifies
   * a bad target as `target_not_found` instead of letting it surface as a
   * generic failure from somebody else's handler.
   */
  checkTarget(id: string): TargetResult;
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
  /**
   * The live element registry, as returned by `createElementRegistry()`.
   *
   * The public type carries no DOM access at all; the controller reaches the
   * node-resolving half through the package-private friend table, which is why
   * this must be a registry this package created rather than any object that
   * satisfies the interface.
   */
  registry: GuideElementRegistry;
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

/** Either the node, or the structured reason there isn't one. */
type Located = { success: true; node: HTMLElement } | { success: false; error: GuideError };

/** Builds an engine error. Every one of them names the element it was about. */
function elementError(code: GuideErrorCode, id: string, message: string): GuideError {
  return guideError(code, message, { details: { elementId: id } });
}

/**
 * Reads a signal's current state.
 *
 * A function rather than an inline comparison, because TypeScript types
 * `AbortSignal.aborted` as a `readonly boolean` and narrows it to `false` for
 * the rest of the scope once one comparison has been made — exactly wrong for a
 * value whose whole purpose is to change while we are awaiting.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/**
 * Creates a {@link HighlightController}.
 *
 * @throws if `options.registry` did not come from `createElementRegistry()`.
 * The controller is the one part of the system that needs a node, and it can
 * only get one from a registry this package built.
 */
export function createHighlightController(
  options: HighlightControllerOptions,
): HighlightController {
  const registry = options.registry;
  // The friend-access half. Nothing on `registry` itself resolves a node, and
  // this is the only place in the package that asks for one.
  const registryInternals = internalsOf(registry);
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

  /**
   * Scrolls, then waits for the page to settle — cancellably from both ends.
   *
   * The controller's own `AbortController` is what `clear()` and `destroy()`
   * reach; a `signal` the caller passed is chained onto it, so one wait answers
   * to teardown and to the request that started it.
   */
  async function settleScroll(
    node: HTMLElement,
    signal?: AbortSignal,
  ): Promise<ScrollSettleOutcome> {
    if (!win) return 'settled';
    if (isAborted(signal)) return 'cancelled';
    const pending = new AbortController();
    pendingScrollWaits.add(pending);
    const onCallerAbort = (): void => {
      pending.abort();
    };
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    try {
      return await waitForScrollEnd(win, { node, signal: pending.signal });
    } finally {
      signal?.removeEventListener('abort', onCallerAbort);
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

  /** Reports a failure, and says so through the warning sink on the way out. */
  function fail(id: string, error: GuideError): { success: false; id: string; error: GuideError } {
    warn(error.message);
    return { success: false, id, error };
  }

  /**
   * Reports a cancellation.
   *
   * Quiet on purpose: a wait aborted by `clear()` or `destroy()` is ordinary
   * teardown, not something a developer needs to be told about.
   */
  function cancelled(id: string): { success: false; id: string; error: GuideError } {
    return {
      success: false,
      id,
      error: elementError(
        'cancelled',
        id,
        `The guidance operation on "${id}" was cancelled before it finished.`,
      ),
    };
  }

  function timedOut(id: string): { success: false; id: string; error: GuideError } {
    return fail(
      id,
      elementError(
        'timeout',
        id,
        `Scrolling "${id}" into view did not settle within the time budget.`,
      ),
    );
  }

  /**
   * Reports a target that went away mid-flight.
   *
   * Distinct from {@link cancelled} on purpose: "you cancelled me" and "the
   * thing you asked about stopped existing" are different facts, and a caller
   * that retries on one should not retry on the other.
   */
  function leftDocument(id: string): { success: false; id: string; error: GuideError } {
    return fail(
      id,
      elementError(
        'target_not_mounted',
        id,
        `Guide element "${id}" left the document while it was being scrolled into view.`,
      ),
    );
  }

  /** Resolves the id, or explains — in the shared vocabulary — why it could not. */
  function locate(id: string): Located {
    if (typeof id !== 'string' || !isValidGuideElementId(id)) {
      return {
        success: false,
        error: elementError(
          'invalid_input',
          id,
          `"${String(id)}" is not a valid Statewave Guide element id. ` +
            `Ids are dot-separated lowercase segments such as "clients.create"; ` +
            `CSS selectors and DOM paths are never valid ids.`,
        ),
      };
    }

    const node = registryInternals.resolveNode(id);
    if (node) return { success: true, node };

    return {
      success: false,
      error: registry.has(id)
        ? elementError(
            'target_not_mounted',
            id,
            `Guide element "${id}" is registered but is not currently mounted in the document.`,
          )
        : elementError('target_not_found', id, `No guide element is registered as "${id}".`),
    };
  }

  function checkTarget(id: string): TargetResult {
    const located = locate(id);
    // Deliberately does not return `located.node`: the answer is whether the id
    // resolves, never what it resolved to.
    return located.success ? { success: true, id } : { success: false, id, error: located.error };
  }

  async function highlight(id: string, input: HighlightOptions = {}): Promise<HighlightResult> {
    // Checked before anything is built, so a request that was already cancelled
    // when it arrived never flashes an overlay on its way to being refused.
    if (isAborted(input.signal)) return cancelled(id);

    const located = locate(id);
    if (!located.success) return fail(id, located.error);
    const node = located.node;

    if (!doc) {
      return fail(
        id,
        elementError(
          'target_not_mounted',
          id,
          `Guide element "${id}" cannot be highlighted: there is no document to draw into.`,
        ),
      );
    }

    const resolved = resolveOptions(input);
    const token = (sequence += 1);

    cancelTimer();
    const handle = ensureOverlay();
    if (!handle) {
      return fail(
        id,
        elementError(
          'target_not_mounted',
          id,
          `Guide element "${id}" cannot be highlighted: the overlay could not be created.`,
        ),
      );
    }

    active = { id, node, options: resolved };
    handle.setContent(resolved.title, resolved.message);
    reposition();
    attachListeners();
    setActiveId(id);

    let outcome: ScrollSettleOutcome = 'settled';
    if (resolved.scrollIntoView) {
      scrollElementIntoView(node, { block: 'center', behavior: 'smooth' });
      outcome = await settleScroll(node, input.signal);
    }

    // The caller cancelled. Read before the outcome, so an abort that lands in
    // the same tick the scroll happens to settle is still honoured rather than
    // coming back as a success with the spotlight left standing. This is also
    // the only abort that leaves anything to take down: `clear()` and
    // `destroy()` have already done it.
    if (isAborted(input.signal)) {
      if (active?.node === node) clear();
      return cancelled(id);
    }

    if (outcome === 'cancelled') {
      // Two remaining reasons a settle wait aborts, and they are different
      // answers. Reporting both as `cancelled` made the `target_not_mounted`
      // branch below unreachable in any document that has a MutationObserver —
      // which is every real one — so a target that vanished mid-scroll looked
      // exactly like a caller that had changed its mind.
      if (!node.isConnected) {
        if (active?.node === node) clear();
        return leftDocument(id);
      }
      return cancelled(id);
    }

    // A newer highlight took over while we were scrolling. It owns the overlay
    // now; report our own success and get out of its way.
    if (token !== sequence) return { success: true, id };

    // Still reachable where there is no MutationObserver to notice the removal.
    if (!node.isConnected) {
      clear();
      return leftDocument(id);
    }

    reposition();

    if (resolved.durationMs !== undefined) {
      timer = setTimeout(() => {
        timer = null;
        clear();
      }, resolved.durationMs);
    }

    // The page never stopped moving inside the time budget — but the element
    // was found, the spotlight is on it, and the scroll and resize listeners
    // keep it there. That is a highlight that worked, so it is reported as one:
    // failing here would have contradicted this module's own promise that a
    // failure leaves no overlay behind, and would have made any target next to
    // a CSS animation or a spinner permanently un-highlightable, since
    // `scrollIntoView` defaults to true. The developer hears about it through
    // the warning sink instead.
    if (outcome === 'timeout') {
      warn(
        `Scrolling "${id}" into view did not settle within the time budget. ` +
          `The highlight is in place and keeps following the element; something on the ` +
          `page is still moving.`,
      );
    }

    return { success: true, id };
  }

  async function scrollTo(id: string, input: ScrollToOptions = {}): Promise<ScrollResult> {
    if (isAborted(input.signal)) return cancelled(id);

    const located = locate(id);
    if (!located.success) return fail(id, located.error);
    const node = located.node;

    scrollElementIntoView(node, {
      block: input.block ?? 'center',
      behavior: input.behavior ?? 'smooth',
    });
    const outcome = await settleScroll(node, input.signal);

    if (isAborted(input.signal)) return cancelled(id);
    if (outcome === 'cancelled') {
      // Same split as `highlight`, minus the overlay: `scrollTo` builds
      // nothing, so there is nothing to take down either way.
      if (!node.isConnected) return leftDocument(id);
      return cancelled(id);
    }
    // Unlike `highlight`, a timeout here *is* the failure: scrolling was the
    // whole job, and nothing was left behind that a caller could still use.
    if (outcome === 'timeout') return timedOut(id);

    return { success: true, id };
  }

  return {
    highlight,
    clear,
    scrollTo,
    checkTarget,
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
