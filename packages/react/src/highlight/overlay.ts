/**
 * The overlay DOM: four dimmers, a ring and a popover.
 *
 * The spotlight is cut out rather than painted. Four fixed rectangles cover
 * everything above, below, left and right of the target, which leaves the
 * target itself untouched — no clip-path, no SVG mask, no compositing
 * surprises, and the real element underneath stays fully interactive because
 * every overlay node except the popover is `pointer-events: none`.
 *
 * @packageDocumentation
 */

import type { HighlightPlacement } from '@statewavedev/guide-shared';
import { GUIDE_OVERLAY_ATTRIBUTE, HIGHLIGHT_CLASS } from './styles.js';

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
  /** Removes the overlay from the document. */
  destroy(): void;
}

/** Estimated popover size, used before the browser has laid it out. */
const ESTIMATED_POPOVER_WIDTH = 260;
const ESTIMATED_POPOVER_HEIGHT = 96;
/** Gap between the target and the popover, and the popover's viewport margin. */
const POPOVER_GAP = 12;
const VIEWPORT_MARGIN = 8;

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

/** Creates the overlay and appends it to `document.body`. */
export function createOverlay(document: Document): OverlayHandle {
  const root = createLayer(document, HIGHLIGHT_CLASS.root);
  root.setAttribute(GUIDE_OVERLAY_ATTRIBUTE, '');

  const dimmers = {
    top: createLayer(document, HIGHLIGHT_CLASS.dim),
    bottom: createLayer(document, HIGHLIGHT_CLASS.dim),
    left: createLayer(document, HIGHLIGHT_CLASS.dim),
    right: createLayer(document, HIGHLIGHT_CLASS.dim),
  };
  for (const dimmer of Object.values(dimmers)) {
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
  popover.append(titleElement, messageElement);
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

      box(dimmers.top, 0, 0, view.width, y);
      box(dimmers.bottom, 0, y + height, view.width, view.height - (y + height));
      box(dimmers.left, 0, y, x, height);
      box(dimmers.right, x + width, y, view.width - (x + width), height);
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

      popover.style.left = px(
        clamp(
          left,
          VIEWPORT_MARGIN,
          Math.max(VIEWPORT_MARGIN, view.width - size.width - VIEWPORT_MARGIN),
        ),
      );
      popover.style.top = px(
        clamp(
          top,
          VIEWPORT_MARGIN,
          Math.max(VIEWPORT_MARGIN, view.height - size.height - VIEWPORT_MARGIN),
        ),
      );
    },

    setContent(title, message) {
      titleElement.textContent = title ?? '';
      titleElement.style.display = title ? '' : 'none';
      messageElement.textContent = message ?? '';
      messageElement.style.display = message ? '' : 'none';
      popover.style.display = title || message ? '' : 'none';
    },

    destroy() {
      root.remove();
    },
  };
}
