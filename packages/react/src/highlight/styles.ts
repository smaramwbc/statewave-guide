/**
 * The stylesheet for the built-in guidance overlay.
 *
 * Deliberately tiny. Statewave Guide ships its own spotlight rather than
 * depending on a tour library, and the point of that decision is architectural
 * — the overlay is driven by semantic ids, not selectors — not visual. A host
 * that wants a designed experience restyles these classes or builds its own
 * overlay on top of the same controller.
 *
 * @packageDocumentation
 */

/** Marks the single `<style>` element this module injects. */
export const GUIDE_STYLE_ATTRIBUTE = 'data-statewave-guide';

/** Marks the overlay root, so a host can find (or hide) the whole thing. */
export const GUIDE_OVERLAY_ATTRIBUTE = 'data-statewave-guide-overlay';

/** Class names used by the overlay. Stable enough for a host to restyle. */
export const HIGHLIGHT_CLASS = {
  root: 'sw-guide-overlay',
  dim: 'sw-guide-dim',
  ring: 'sw-guide-ring',
  popover: 'sw-guide-popover',
  title: 'sw-guide-popover-title',
  message: 'sw-guide-popover-message',
} as const;

const CSS_TEXT = `
.${HIGHLIGHT_CLASS.root} {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
.${HIGHLIGHT_CLASS.dim} {
  position: fixed;
  background: rgba(15, 23, 42, 0.55);
  pointer-events: none;
  transition: opacity 120ms ease;
}
.${HIGHLIGHT_CLASS.ring} {
  position: fixed;
  border: 2px solid #38bdf8;
  border-radius: 6px;
  pointer-events: none;
  transition: top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease;
}
.${HIGHLIGHT_CLASS.popover} {
  position: fixed;
  max-width: 280px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #f8fafc;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);
  pointer-events: auto;
  transition: top 120ms ease, left 120ms ease, opacity 120ms ease;
}
.${HIGHLIGHT_CLASS.title} {
  font-weight: 600;
  margin-bottom: 4px;
}
.${HIGHLIGHT_CLASS.message} {
  opacity: 0.85;
}
@media (prefers-reduced-motion: reduce) {
  .${HIGHLIGHT_CLASS.dim},
  .${HIGHLIGHT_CLASS.ring},
  .${HIGHLIGHT_CLASS.popover} {
    transition: none;
  }
}
`;

/**
 * Appends the overlay stylesheet to `document`, at most once.
 *
 * Idempotent by construction: the marker attribute is both the flag and the
 * hook a host would use to override the styles.
 */
export function injectHighlightStyles(document: Document): void {
  const host = document.head || document.documentElement;
  if (!host) return;
  if (document.querySelector(`style[${GUIDE_STYLE_ATTRIBUTE}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(GUIDE_STYLE_ATTRIBUTE, '');
  style.textContent = CSS_TEXT;
  host.appendChild(style);
}
