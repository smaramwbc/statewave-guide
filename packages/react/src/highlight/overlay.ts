/**
 * The overlay DOM: a ring, a callout, and optionally four dimmers.
 *
 * Nothing here is modal. The ring marks the target and the callout says what to
 * do with it; the page around them keeps its own contrast, and every node in
 * the overlay is `pointer-events: none` — so the control being pointed at, and
 * everything near it, stays as clickable as it was before the guide said
 * anything. That is the whole point of pointing at a control: the user is meant
 * to use it.
 *
 * Dimming is off by default and available to a host that wants a modal
 * spotlight. It is built as four fixed rectangles covering everything above,
 * below, left and right of the target rather than a cut-out, which leaves the
 * target untouched — no clip-path, no SVG mask, no compositing surprises. The
 * nodes are only created when dimming is on, so a host that leaves it off is
 * not paying for four empty divs on every highlight.
 *
 * @packageDocumentation
 */

import type { HighlightPlacement } from '@statewavedev/guide-shared';
import { GUIDE_OVERLAY_ATTRIBUTE, HIGHLIGHT_CLASS, RING_PRESSED_ATTRIBUTE } from './styles.js';

/** A highlight request with every optional field filled in. */
export interface ResolvedHighlightOptions {
  title: string | undefined;
  message: string | undefined;
  placement: HighlightPlacement;
  padding: number;
  durationMs: number | undefined;
  scrollIntoView: boolean;
}

/** Handle onto a mounted overlay. */
export interface OverlayHandle {
  /** Moves the spotlight, the ring and the popover to fit `rect`. */
  position(rect: DOMRect, options: ResolvedHighlightOptions): void;
  /** Sets the popover text. Hides the popover when both are empty. */
  setContent(title: string | undefined, message: string | undefined): void;
  /**
   * Marks the ring as the control having just been operated.
   *
   * A press the guide makes on the user's behalf produces none of the feedback
   * a real one does — no `:active`, no focus flash, nothing. The dialog simply
   * appears, and the reader has no way to connect it to the button. This is the
   * missing half of that: the guide's own mark on the control, briefly saying
   * "this is the one I pressed".
   */
  setPressed(pressed: boolean): void;
  /** Removes the overlay from the document. */
  destroy(): void;
}

/** Estimated popover size, used before the browser has laid it out. */
const ESTIMATED_POPOVER_WIDTH = 260;
const ESTIMATED_POPOVER_HEIGHT = 96;
/** Gap between the target and the popover, and the popover's viewport margin. */
const POPOVER_GAP = 12;
const VIEWPORT_MARGIN = 8;
/** Half the caret's diagonal, and how close to a corner it may sit. */
const CARET_SIZE = 6;
const CARET_INSET = 14;

/**
 * jsdom returns zeros from `getBoundingClientRect`, and a detached node can
 * produce `NaN`. Neither may ever reach a style value.
 */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function px(value: number): string {
  return `${Math.round(finite(value))}px`;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(finite(value), min), max);
}

function createLayer(document: Document, className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

/** How the overlay should look. Not what it points at. */
export interface OverlayAppearance {
  /**
   * Dim the rest of the page while something is highlighted. Defaults to false.
   *
   * Off by default because pointing at a control is an invitation to use it,
   * and a page behind a 55% scrim reads as a page that has been switched off.
   * A host running a first-run tour, where nothing else *should* be touched,
   * turns it on.
   */
  dim?: boolean;
}

/** Creates the overlay and appends it to `document.body`. */
export function createOverlay(
  document: Document,
  appearance: OverlayAppearance = {},
): OverlayHandle {
  const root = createLayer(document, HIGHLIGHT_CLASS.root);
  root.setAttribute(GUIDE_OVERLAY_ATTRIBUTE, '');

  const dimmers =
    appearance.dim === true
      ? {
          top: createLayer(document, HIGHLIGHT_CLASS.dim),
          bottom: createLayer(document, HIGHLIGHT_CLASS.dim),
          left: createLayer(document, HIGHLIGHT_CLASS.dim),
          right: createLayer(document, HIGHLIGHT_CLASS.dim),
        }
      : undefined;
  for (const dimmer of Object.values(dimmers ?? {})) {
    // The dimmers are decoration. A screen reader must not walk through four
    // empty divs on its way to the thing we are pointing at.
    dimmer.setAttribute('aria-hidden', 'true');
    root.appendChild(dimmer);
  }

  const ring = createLayer(document, HIGHLIGHT_CLASS.ring);
  ring.setAttribute('aria-hidden', 'true');
  root.appendChild(ring);

  const popover = createLayer(document, HIGHLIGHT_CLASS.popover);
  popover.setAttribute('role', 'status');
  popover.setAttribute('aria-live', 'polite');
  const titleElement = createLayer(document, HIGHLIGHT_CLASS.title);
  const messageElement = createLayer(document, HIGHLIGHT_CLASS.message);
  // The caret is what makes this a callout rather than a notification that
  // happened to land nearby: it says *which* control the words are about, which
  // matters most in a dense form where six fields sit within 40 pixels.
  const caret = createLayer(document, HIGHLIGHT_CLASS.caret);
  caret.setAttribute('aria-hidden', 'true');
  popover.append(titleElement, messageElement, caret);
  root.appendChild(popover);

  (document.body || document.documentElement).appendChild(root);

  function viewport(): { width: number; height: number } {
    const view = document.defaultView;
    return {
      width: finite(view?.innerWidth ?? document.documentElement.clientWidth ?? 0),
      height: finite(view?.innerHeight ?? document.documentElement.clientHeight ?? 0),
    };
  }

  function box(
    element: HTMLElement,
    left: number,
    top: number,
    width: number,
    height: number,
  ): void {
    element.style.left = px(left);
    element.style.top = px(top);
    element.style.width = px(Math.max(0, width));
    element.style.height = px(Math.max(0, height));
  }

  /** Picks a side with enough room, preferring below then above. */
  function autoPlacement(
    spot: { x: number; y: number; width: number; height: number },
    size: { width: number; height: number },
    view: { width: number; height: number },
  ): Exclude<HighlightPlacement, 'auto'> {
    if (view.height - (spot.y + spot.height) >= size.height + POPOVER_GAP) return 'bottom';
    if (spot.y >= size.height + POPOVER_GAP) return 'top';
    if (view.width - (spot.x + spot.width) >= size.width + POPOVER_GAP) return 'right';
    if (spot.x >= size.width + POPOVER_GAP) return 'left';
    return 'bottom';
  }

  return {
    position(rect, options) {
      const view = viewport();
      const padding = Math.max(0, finite(options.padding));

      const rawX = finite(rect.left) - padding;
      const rawY = finite(rect.top) - padding;
      const x = clamp(rawX, 0, view.width);
      const y = clamp(rawY, 0, view.height);
      const width = clamp(finite(rect.width) + padding * 2 - (x - rawX), 0, view.width - x);
      const height = clamp(finite(rect.height) + padding * 2 - (y - rawY), 0, view.height - y);

      if (dimmers !== undefined) {
        box(dimmers.top, 0, 0, view.width, y);
        box(dimmers.bottom, 0, y + height, view.width, view.height - (y + height));
        box(dimmers.left, 0, y, x, height);
        box(dimmers.right, x + width, y, view.width - (x + width), height);
      }
      box(ring, x, y, width, height);

      if (popover.style.display === 'none') return;

      const size = {
        width: popover.offsetWidth || ESTIMATED_POPOVER_WIDTH,
        height: popover.offsetHeight || ESTIMATED_POPOVER_HEIGHT,
      };
      const spot = { x, y, width, height };
      const placement =
        options.placement === 'auto' ? autoPlacement(spot, size, view) : options.placement;

      let left = x;
      let top = y;
      switch (placement) {
        case 'top':
          left = x + width / 2 - size.width / 2;
          top = y - size.height - POPOVER_GAP;
          break;
        case 'left':
          left = x - size.width - POPOVER_GAP;
          top = y + height / 2 - size.height / 2;
          break;
        case 'right':
          left = x + width + POPOVER_GAP;
          top = y + height / 2 - size.height / 2;
          break;
        case 'bottom':
        default:
          left = x + width / 2 - size.width / 2;
          top = y + height + POPOVER_GAP;
          break;
      }

      const placedLeft = clamp(
        left,
        VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, view.width - size.width - VIEWPORT_MARGIN),
      );
      const placedTop = clamp(
        top,
        VIEWPORT_MARGIN,
        Math.max(VIEWPORT_MARGIN, view.height - size.height - VIEWPORT_MARGIN),
      );
      popover.style.left = px(placedLeft);
      popover.style.top = px(placedTop);

      // Which edge the caret sits on. CSS reads this rather than a class so a
      // host restyling the callout can key off the same attribute.
      popover.setAttribute('data-placement', placement);

      // The caret tracks the target, not the middle of the callout. Near a
      // viewport edge the callout is pushed back inside and the two stop
      // coinciding — a caret left centred would then point confidently at
      // whatever happens to be beside the control.
      const targetCentreX = x + width / 2;
      const targetCentreY = y + height / 2;
      if (placement === 'top' || placement === 'bottom') {
        caret.style.left = px(
          clamp(targetCentreX - placedLeft - CARET_SIZE, CARET_INSET, size.width - CARET_INSET),
        );
        caret.style.top = '';
      } else {
        caret.style.top = px(
          clamp(targetCentreY - placedTop - CARET_SIZE, CARET_INSET, size.height - CARET_INSET),
        );
        caret.style.left = '';
      }
    },

    setContent(title, message) {
      titleElement.textContent = title ?? '';
      titleElement.style.display = title ? '' : 'none';
      messageElement.textContent = message ?? '';
      messageElement.style.display = message ? '' : 'none';
      popover.style.display = title || message ? '' : 'none';
    },

    setPressed(pressed) {
      if (pressed) ring.setAttribute(RING_PRESSED_ATTRIBUTE, '');
      else ring.removeAttribute(RING_PRESSED_ATTRIBUTE);
    },

    destroy() {
      root.remove();
    },
  };
}
