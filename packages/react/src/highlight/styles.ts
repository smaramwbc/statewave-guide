/**
 * The stylesheet for the built-in guidance overlay.
 *
 * Deliberately tiny. Statewave Guide ships its own spotlight rather than
 * depending on a tour library, and the point of that decision is architectural
 * — the overlay is driven by semantic ids, not selectors — not visual. A host
 * that wants a designed experience restyles these classes or builds its own
 * overlay on top of the same controller.
 *
 * Every value reads a panel theme variable with a literal fallback, so the
 * callout matches a themed panel when a host publishes those variables
 * somewhere the overlay can see them — it is mounted on `document.body`, not
 * inside the panel — and looks correct with no panel at all.
 *
 * @packageDocumentation
 */

/** Marks the single `<style>` element this module injects. */
export const GUIDE_STYLE_ATTRIBUTE = 'data-statewave-guide';

/** Set on the ring while the guide is pressing the control it surrounds. */
export const RING_PRESSED_ATTRIBUTE = 'data-pressed';

/** Marks the overlay root, so a host can find (or hide) the whole thing. */
export const GUIDE_OVERLAY_ATTRIBUTE = 'data-statewave-guide-overlay';

/** Class names used by the overlay. Stable enough for a host to restyle. */
export const HIGHLIGHT_CLASS = {
  root: 'sw-guide-overlay',
  dim: 'sw-guide-dim',
  ring: 'sw-guide-ring',
  popover: 'sw-guide-popover',
  caret: 'sw-guide-popover-caret',
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
  background: var(--statewave-guide-overlay, rgba(17, 24, 39, 0.4));
  pointer-events: none;
  transition: opacity 120ms ease;
}
.${HIGHLIGHT_CLASS.ring} {
  position: fixed;
  border: 2px solid var(--statewave-guide-primary, #635bff);
  border-radius: var(--statewave-guide-radius-control, 10px);
  box-shadow: var(--statewave-guide-shadow-highlight, 0 0 0 3px rgba(99, 91, 255, 0.35));
  pointer-events: none;
  transition: top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease;
}
/* The guide pressing a control, made visible.
   
   A programmatic click fires no :active state and no feedback of any kind, so
   the only thing the reader sees is a dialog appearing from nowhere. The ring
   takes the success colour and contracts for a moment — the same shape a button
   makes when a finger lands on it, drawn on the guide's own layer rather than
   by reaching into the host's styles. */
.${HIGHLIGHT_CLASS.ring}[${RING_PRESSED_ATTRIBUTE}] {
  border-color: var(--statewave-guide-success, #12805c);
  box-shadow: 0 0 0 5px rgba(18, 128, 92, 0.25);
  animation: sw-guide-press 320ms ease-out;
}
@keyframes sw-guide-press {
  0% { transform: scale(1); }
  45% { transform: scale(0.97); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .${HIGHLIGHT_CLASS.ring}[${RING_PRESSED_ATTRIBUTE}] { animation: none; }
}
.${HIGHLIGHT_CLASS.popover} {
  position: fixed;
  max-width: 260px;
  padding: 10px 13px;
  border: 1px solid var(--statewave-guide-border, #e5e7eb);
  border-radius: var(--statewave-guide-radius-control, 10px);
  background: var(--statewave-guide-surface-elevated, #ffffff);
  color: var(--statewave-guide-text, #111827);
  font-family: var(--statewave-guide-font-family, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: var(--statewave-guide-font-size-sm, 13.5px);
  line-height: 1.45;
  box-shadow: var(--statewave-guide-shadow-panel, 0 1px 2px rgba(17, 24, 39, 0.04), 0 24px 60px -24px rgba(17, 24, 39, 0.28));
  /* Informational, and nothing in it is clickable. Letting pointer events
     through means a callout that lands over the next control does not have to
     be dismissed before the user can reach it. */
  pointer-events: none;
  transition: top 120ms ease, left 120ms ease, opacity 120ms ease;
}
.${HIGHLIGHT_CLASS.caret} {
  position: absolute;
  width: 12px;
  height: 12px;
  background: inherit;
  transform: rotate(45deg);
}
.${HIGHLIGHT_CLASS.popover}[data-placement="bottom"] .${HIGHLIGHT_CLASS.caret} {
  top: -7px;
  border-left: 1px solid var(--statewave-guide-border, #e5e7eb);
  border-top: 1px solid var(--statewave-guide-border, #e5e7eb);
}
.${HIGHLIGHT_CLASS.popover}[data-placement="top"] .${HIGHLIGHT_CLASS.caret} {
  bottom: -7px;
  border-right: 1px solid var(--statewave-guide-border, #e5e7eb);
  border-bottom: 1px solid var(--statewave-guide-border, #e5e7eb);
}
.${HIGHLIGHT_CLASS.popover}[data-placement="right"] .${HIGHLIGHT_CLASS.caret} {
  left: -7px;
  border-left: 1px solid var(--statewave-guide-border, #e5e7eb);
  border-bottom: 1px solid var(--statewave-guide-border, #e5e7eb);
}
.${HIGHLIGHT_CLASS.popover}[data-placement="left"] .${HIGHLIGHT_CLASS.caret} {
  right: -7px;
  border-right: 1px solid var(--statewave-guide-border, #e5e7eb);
  border-top: 1px solid var(--statewave-guide-border, #e5e7eb);
}
.${HIGHLIGHT_CLASS.title} {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--statewave-guide-primary, #635bff);
  margin-bottom: 3px;
}
.${HIGHLIGHT_CLASS.message} {
  color: var(--statewave-guide-text, #111827);
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
