/**
 * Scrolling, and knowing when it stopped.
 *
 * A highlight drawn while the page is still gliding lands in the wrong place,
 * so the controller scrolls first and positions afterwards. The hard part is
 * "afterwards": `scrollIntoView({ behavior: 'smooth' })` gives no completion
 * signal in most browsers, and `scrollend` is not everywhere yet.
 *
 * {@link waitForScrollEnd} therefore always resolves, by one of three routes —
 * a `scrollend` event, a rect that has stopped moving, or a hard timeout. In
 * jsdom, where nothing scrolls at all, it settles in a couple of frames rather
 * than hanging a test suite.
 *
 * @packageDocumentation
 */

/** Options for {@link scrollElementIntoView}. */
export interface ScrollElementOptions {
  /** Vertical alignment of the target. Defaults to `center`. */
  block?: ScrollLogicalPosition;
  /** Scroll behaviour. Defaults to `smooth`. */
  behavior?: ScrollBehavior;
}

/** Options for {@link waitForScrollEnd}. */
export interface WaitForScrollEndOptions {
  /** Element whose rect is watched for stability. Falls back to window scroll offsets. */
  node?: Element;
  /** Hard upper bound. The promise always resolves by then. Defaults to 1000ms. */
  timeoutMs?: number;
  /** Consecutive unchanged frames that count as settled. Defaults to 2. */
  stableFrames?: number;
  /**
   * Cancels the wait.
   *
   * The promise resolves immediately when the signal aborts, and the timer and
   * the frame loop are torn down with it. Without this a controller that was
   * destroyed mid-scroll keeps a self-perpetuating `requestAnimationFrame` loop
   * measuring a node that may already be detached, for as long as `timeoutMs`.
   */
  signal?: AbortSignal;
}

/**
 * Scrolls an element into view.
 *
 * jsdom does not implement `scrollIntoView`, and a host may render into a
 * document that does not either — a missing API degrades to a no-op rather
 * than a crash.
 */
export function scrollElementIntoView(node: Element, options: ScrollElementOptions = {}): void {
  if (typeof node.scrollIntoView !== 'function') return;
  try {
    node.scrollIntoView({
      behavior: options.behavior ?? 'smooth',
      block: options.block ?? 'center',
    });
  } catch {
    // Some environments define the method and then refuse to implement it.
    // A guidance overlay is not worth an exception.
  }
}

/** Resolves once scrolling has settled. Never rejects, never hangs. */
export function waitForScrollEnd(
  win: Window,
  options: WaitForScrollEndOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const stableFrames = options.stableFrames ?? 2;

  const signal = options.signal;
  if (signal?.aborted === true) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const requestFrame =
      typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame.bind(win) : null;
    const cancelFrame =
      typeof win.cancelAnimationFrame === 'function' ? win.cancelAnimationFrame.bind(win) : null;
    const supportsScrollEnd = 'onscrollend' in win;

    let settled = false;
    let frame: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (frame !== null) cancelFrame?.(frame);
      if (timer !== null) clearTimeout(timer);
      if (supportsScrollEnd) win.removeEventListener('scrollend', finish, true);
      signal?.removeEventListener('abort', finish);
      resolve();
    };

    const probe = (): string => {
      const rect = options.node?.getBoundingClientRect();
      const x = rect ? rect.left : (win.scrollX ?? 0);
      const y = rect ? rect.top : (win.scrollY ?? 0);
      return `${Math.round(x)}:${Math.round(y)}:${Math.round(win.scrollX ?? 0)}:${Math.round(win.scrollY ?? 0)}`;
    };

    timer = setTimeout(finish, timeoutMs);
    // Capture, so a scroll that ends inside a nested container is heard too.
    if (supportsScrollEnd) win.addEventListener('scrollend', finish, true);
    signal?.addEventListener('abort', finish, { once: true });

    if (!requestFrame) {
      finish();
      return;
    }

    let stable = 0;
    let previous = probe();
    const step = (): void => {
      if (settled) return;
      const next = probe();
      if (next === previous) {
        stable += 1;
        if (stable >= stableFrames) {
          finish();
          return;
        }
      } else {
        stable = 0;
        previous = next;
      }
      frame = requestFrame(step);
    };
    frame = requestFrame(step);
  });
}
