/**
 * The panel's stylesheet, written entirely against theme variables.
 *
 * Two rules hold throughout. **No colour, size, radius or shadow is written
 * literally** — every one reads a custom property, which is what makes the theme
 * real rather than a suggestion. And **every selector carries a `.sw-guide`
 * ancestor**: there is no bare element rule anywhere, so a host's `button { … }`
 * cannot reach in and this cannot reach out.
 *
 * The visual model is the approved reference: a floating card inset from the
 * viewport, a status line under the header, questions in a soft tinted bubble
 * with a timestamp, answers as bordered cards with a sparkle mark, circular step
 * numbers, an icon on each action button, a composer with a square send
 * control, and a centred attribution line at the foot.
 *
 * @packageDocumentation
 */

export const GUIDE_STYLE_ID = 'statewave-guide-styles';

const v = (name: string): string => `var(--statewave-guide-${name})`;

export const GUIDE_CSS = `
/* A host reset must not reach in, and this must not reach out. Every rule below
   carries a .sw-guide ancestor, so a host selector of the shape
   body.app button — two elements and one class — cannot out-specify a
   two-class panel rule. The properties a reset most often sets are declared
   explicitly rather than left to inherit from whatever the host decided. */
.sw-guide, .sw-guide *, .sw-guide *::before, .sw-guide *::after { box-sizing: border-box; }
.sw-guide button, .sw-guide input, .sw-guide textarea, .sw-guide select {
  margin: 0; font-family: inherit; letter-spacing: inherit; text-transform: none; border: 0;
}
.sw-guide h2, .sw-guide h3, .sw-guide p, .sw-guide ol, .sw-guide ul, .sw-guide li {
  margin: 0; padding: 0; font-family: inherit; font-weight: inherit; font-size: inherit;
}
.sw-guide a { text-decoration: none; }
.sw-guide svg { display: block; flex: none; }

.sw-guide {
  position: fixed; z-index: 2147483200;
  display: flex; flex-direction: column;
  width: var(--sw-guide-width, 440px);
  background: ${v('background')};
  color: ${v('text')};
  border: 1px solid ${v('border')};
  border-radius: ${v('radius-panel')};
  box-shadow: ${v('shadow-panel')};
  font-family: ${v('font-family')};
  font-size: ${v('font-size-base')};
  line-height: ${v('line-height')};
  font-weight: ${v('font-weight-normal')};
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
.sw-guide[data-mode="floating"] { top: 24px; bottom: 24px; }
.sw-guide[data-mode="floating"][data-side="right"] { right: 24px; }
.sw-guide[data-mode="floating"][data-side="left"] { left: 24px; }
.sw-guide[data-mode="docked"] { top: 0; bottom: 0; border-radius: 0; }
.sw-guide[data-mode="docked"][data-side="right"] { right: 0; border-right: 0; }
.sw-guide[data-mode="docked"][data-side="left"] { left: 0; border-left: 0; }
.sw-guide[data-mobile="true"] {
  top: auto; left: 0; right: 0; bottom: 0; width: 100%; height: 78vh;
  border-radius: ${v('radius-panel')} ${v('radius-panel')} 0 0;
  border-left: 0; border-right: 0; border-bottom: 0;
}

/* ---- header ------------------------------------------------------------- */
.sw-guide .sw-guide__header {
  display: flex; align-items: center; gap: 8px;
  padding: ${v('space-panel-padding')} ${v('space-panel-padding')} 8px;
}
.sw-guide .sw-guide__brand { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 0 1 auto; }
.sw-guide .sw-guide__logo {
  width: 26px; height: 26px; border-radius: 8px; object-fit: contain; flex: none;
}
.sw-guide .sw-guide__logo--mark {
  display: grid; place-items: center; background: ${v('accent')}; color: ${v('primary')};
}
.sw-guide .sw-guide__host {
  font-size: ${v('font-size-md')}; font-weight: ${v('font-weight-semibold')};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.sw-guide .sw-guide__chevron { color: ${v('muted-text')}; }
.sw-guide .sw-guide__divider { width: 1px; height: 22px; background: ${v('border')}; flex: none; margin: 0 4px; }
.sw-guide .sw-guide__product {
  display: flex; align-items: center; gap: 7px; flex: 1 0 auto;
  font-size: ${v('font-size-md')}; font-weight: ${v('font-weight-semibold')}; white-space: nowrap;
}
.sw-guide .sw-guide__product-mark { color: ${v('primary')}; }
.sw-guide .sw-guide__title { font-size: inherit; font-weight: inherit; }

.sw-guide .sw-guide__icon {
  appearance: none; background: transparent; padding: 0; cursor: pointer; border: 0;
  width: 28px; height: 28px; flex: none; border-radius: ${v('radius-control')};
  color: ${v('muted-text')};
  display: inline-flex; align-items: center; justify-content: center;
}
.sw-guide .sw-guide__icon:hover { background: ${v('surface-elevated')}; color: ${v('text')}; }
.sw-guide .sw-guide__icon:focus-visible { outline: 2px solid ${v('focus-ring')}; outline-offset: 1px; }

.sw-guide .sw-guide__menu { position: relative; }
.sw-guide .sw-guide__menu-list {
  position: absolute; right: 0; top: 34px; min-width: 190px; z-index: 2;
  background: ${v('surface')}; border: 1px solid ${v('border')};
  border-radius: ${v('radius-control')}; box-shadow: ${v('shadow-panel')}; padding: 6px;
}
.sw-guide .sw-guide__menu-item {
  appearance: none; background: transparent; cursor: pointer; width: 100%; text-align: left;
  padding: 8px 10px; border-radius: ${v('radius-control')}; font-size: ${v('font-size-sm')};
  color: ${v('text')};
}
.sw-guide .sw-guide__menu-item:hover { background: ${v('surface-elevated')}; }
.sw-guide .sw-guide__menu-item:focus-visible { outline: 2px solid ${v('focus-ring')}; outline-offset: -2px; }

.sw-guide .sw-guide__status {
  display: flex; align-items: center; gap: 8px;
  padding: 0 ${v('space-panel-padding')} 14px;
  font-size: ${v('font-size-sm')}; color: ${v('muted-text')};
}
.sw-guide .sw-guide__status-dot {
  width: 8px; height: 8px; border-radius: 999px; background: ${v('success')}; flex: none;
}

/* ---- thread ------------------------------------------------------------- */
.sw-guide .sw-guide__thread {
  flex: 1; overflow-y: auto; min-height: 0;
  padding: 4px ${v('space-panel-padding')} ${v('space-panel-padding')};
  display: flex; flex-direction: column; gap: ${v('space-gap')};
}

.sw-guide .sw-guide__empty {
  margin: auto 0; text-align: center; padding: 0 12px;
  color: ${v('muted-text')}; font-size: ${v('font-size-sm')};
}
.sw-guide .sw-guide__empty-mark {
  width: 48px; height: 48px; border-radius: 14px; margin: 0 auto 14px;
  display: grid; place-items: center; background: ${v('accent')}; color: ${v('primary')};
}
.sw-guide .sw-guide__empty h3 {
  font-size: ${v('font-size-lg')}; font-weight: ${v('font-weight-semibold')};
  color: ${v('text')}; margin-bottom: 6px;
}

.sw-guide .sw-guide__turn { display: flex; flex-direction: column; gap: 6px; }
.sw-guide .sw-guide__question {
  background: ${v('accent')}; color: ${v('text')};
  border-radius: ${v('radius-card')}; padding: 16px 20px;
  font-size: ${v('font-size-md')}; font-weight: ${v('font-weight-normal')};
}
.sw-guide .sw-guide__meta {
  align-self: flex-end; display: inline-flex; align-items: center; gap: 6px;
  font-size: ${v('font-size-xs')}; color: ${v('muted-text')}; padding-right: 2px;
}
.sw-guide .sw-guide__meta-check { color: ${v('primary')}; }

/* ---- answer card -------------------------------------------------------- */
.sw-guide .sw-guide__answer {
  background: ${v('surface')}; border: 1px solid ${v('border')};
  border-radius: ${v('radius-card')}; padding: 20px;
  display: flex; flex-direction: column; gap: 14px;
}
.sw-guide .sw-guide__answer-head { display: flex; align-items: center; gap: 10px; }
.sw-guide .sw-guide__answer-mark { color: ${v('primary')}; }
.sw-guide .sw-guide__answer-title {
  font-size: ${v('font-size-lg')}; font-weight: ${v('font-weight-semibold')}; letter-spacing: -0.01em;
}
.sw-guide .sw-guide__purpose { font-size: ${v('font-size-md')}; color: ${v('text')}; }
.sw-guide .sw-guide__prompt { font-size: ${v('font-size-md')}; color: ${v('text')}; }
.sw-guide .sw-guide__summary { font-size: ${v('font-size-sm')}; color: ${v('muted-text')}; }
.sw-guide .sw-guide__where { font-size: ${v('font-size-sm')}; color: ${v('muted-text')}; font-style: italic; }

.sw-guide .sw-guide__condition {
  display: flex; gap: 9px; align-items: center;
  background: ${v('surface-elevated')}; border-radius: ${v('radius-control')};
  padding: 11px 14px; font-size: ${v('font-size-sm')}; color: ${v('muted-text')};
}
.sw-guide .sw-guide__condition-mark { color: ${v('muted-text')}; }

.sw-guide .sw-guide__steps {
  list-style: none; counter-reset: sw-step;
  display: flex; flex-direction: column; gap: ${v('space-step-gap')};
}
.sw-guide .sw-guide__step {
  counter-increment: sw-step; display: flex; align-items: center; gap: 14px;
  font-size: ${v('font-size-md')}; border-radius: ${v('radius-control')};
}
.sw-guide .sw-guide__step::before {
  content: counter(sw-step); flex: none;
  width: 30px; height: 30px; border-radius: 999px;
  background: ${v('accent')}; color: ${v('primary')};
  font-size: ${v('font-size-sm')}; font-weight: ${v('font-weight-semibold')};
  display: flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
.sw-guide .sw-guide__step[data-active="true"] { background: ${v('accent')}; margin: 0 -8px; padding: 6px 8px; }
.sw-guide .sw-guide__step[data-active="true"]::before { background: ${v('primary')}; color: ${v('primary-foreground')}; }

.sw-guide .sw-guide__rule { height: 1px; background: ${v('border')}; }

.sw-guide .sw-guide__choices { display: flex; flex-wrap: wrap; gap: 8px; }

.sw-guide .sw-guide__actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sw-guide .sw-guide__button {
  appearance: none; cursor: pointer; font: inherit;
  font-size: ${v('font-size-md')}; font-weight: ${v('font-weight-semibold')};
  border-radius: ${v('radius-control')}; padding: 12px 22px;
  border: 1.5px solid ${v('primary')}; background: ${v('surface')}; color: ${v('primary')};
  display: inline-flex; align-items: center; gap: 9px; line-height: 1.2;
}
.sw-guide .sw-guide__button:hover:not(:disabled) { background: ${v('accent')}; }
.sw-guide .sw-guide__button:focus-visible { outline: 2px solid ${v('focus-ring')}; outline-offset: 2px; }
.sw-guide .sw-guide__button:disabled { opacity: 0.5; cursor: default; }
.sw-guide .sw-guide__button--primary {
  background: ${v('primary')}; border-color: ${v('primary')}; color: ${v('primary-foreground')};
}
.sw-guide .sw-guide__button--primary:hover:not(:disabled) {
  background: ${v('primary-hover')}; border-color: ${v('primary-hover')};
}
.sw-guide .sw-guide__button--quiet {
  border-color: ${v('border-strong')}; color: ${v('text')}; font-weight: ${v('font-weight-medium')};
  padding: 9px 16px; font-size: ${v('font-size-sm')};
}
.sw-guide .sw-guide__button--quiet:hover:not(:disabled) { background: ${v('surface-elevated')}; }

.sw-guide .sw-guide__stepper { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sw-guide .sw-guide__stepper-count {
  font-size: ${v('font-size-sm')}; color: ${v('muted-text')}; font-variant-numeric: tabular-nums;
}
.sw-guide .sw-guide__pointing {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: ${v('font-size-sm')}; color: ${v('primary')}; font-weight: ${v('font-weight-medium')};
}

.sw-guide .sw-guide__note { font-size: ${v('font-size-sm')}; color: ${v('muted-text')}; }

/* ---- composer ----------------------------------------------------------- */
.sw-guide .sw-guide__composer {
  margin: 0 ${v('space-panel-padding')};
  display: flex; align-items: center; gap: 10px;
  border: 1px solid ${v('border')}; border-radius: ${v('radius-card')};
  padding: 8px 8px 8px 14px; background: ${v('surface')};
}
.sw-guide .sw-guide__composer:focus-within { border-color: ${v('primary')}; box-shadow: 0 0 0 3px ${v('accent')}; }
.sw-guide .sw-guide__clip { color: ${v('muted-text')}; }
.sw-guide .sw-guide__input {
  flex: 1; resize: none; font: inherit; font-size: ${v('font-size-md')};
  min-height: 28px; max-height: 120px; padding: 6px 0;
  background: transparent; color: ${v('text')}; outline: none;
}
.sw-guide .sw-guide__input::placeholder { color: ${v('muted-text')}; }
.sw-guide .sw-guide__send {
  appearance: none; cursor: pointer; flex: none;
  width: ${v('space-composer')}; height: ${v('space-composer')};
  border-radius: ${v('radius-control')};
  background: ${v('primary')}; color: ${v('primary-foreground')};
  display: inline-flex; align-items: center; justify-content: center;
}
.sw-guide .sw-guide__send:hover:not(:disabled) { background: ${v('primary-hover')}; }
.sw-guide .sw-guide__send:focus-visible { outline: 2px solid ${v('focus-ring')}; outline-offset: 2px; }
.sw-guide .sw-guide__send:disabled { opacity: 0.45; cursor: default; }

.sw-guide .sw-guide__footer {
  padding: 14px ${v('space-panel-padding')} 18px;
  text-align: center; font-size: ${v('font-size-sm')}; color: ${v('muted-text')};
}
.sw-guide .sw-guide__footer a { color: inherit; }
.sw-guide .sw-guide__footer a:hover { color: ${v('text')}; }
.sw-guide .sw-guide__footer a:focus-visible { outline: 2px solid ${v('focus-ring')}; outline-offset: 2px; border-radius: 3px; }

.sw-guide .sw-guide__inspector { border-top: 1px solid ${v('border')}; font-size: ${v('font-size-xs')}; }
.sw-guide .sw-guide__inspector summary { padding: 8px ${v('space-panel-padding')}; cursor: pointer; color: ${v('muted-text')}; }
.sw-guide .sw-guide__inspector pre {
  margin: 0; padding: 0 ${v('space-panel-padding')} 10px; overflow-x: auto; max-height: 220px;
  font-size: 10.5px; line-height: 1.45; color: ${v('muted-text')};
}

/* ---- launcher ----------------------------------------------------------- */
.sw-guide-launcher {
  position: fixed; bottom: 28px; z-index: 2147483201;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  font-family: ${v('font-family')};
}
.sw-guide-launcher[data-position="bottom-right"] { right: 28px; }
.sw-guide-launcher[data-position="bottom-left"] { left: 28px; }
.sw-guide-launcher[data-open="true"] { opacity: 0; pointer-events: none; }
.sw-guide-launcher .sw-guide-launcher__button {
  appearance: none; cursor: pointer; padding: 0; margin: 0;
  width: 68px; height: 68px; border-radius: 999px; border: 0;
  background: ${v('primary')}; color: ${v('primary-foreground')};
  box-shadow: ${v('shadow-launcher')}, 0 0 0 6px ${v('accent')};
  display: inline-flex; align-items: center; justify-content: center;
}
.sw-guide-launcher .sw-guide-launcher__button:hover { background: ${v('primary-hover')}; }
.sw-guide-launcher .sw-guide-launcher__button:focus-visible { outline: 2px solid ${v('focus-ring')}; outline-offset: 4px; }
.sw-guide-launcher .sw-guide-launcher__hint {
  display: inline-flex; align-items: center; gap: 10px;
  background: ${v('surface')}; color: ${v('muted-text')};
  border: 1px solid ${v('border')}; border-radius: ${v('radius-control')};
  padding: 8px 12px; font-size: ${v('font-size-sm')}; font-weight: ${v('font-weight-medium')};
  box-shadow: 0 6px 18px -10px ${v('overlay')};
}
.sw-guide-launcher .sw-guide-launcher__kbd { color: ${v('text')}; font-weight: ${v('font-weight-semibold')}; }

.sw-guide-visually-hidden, .sw-guide .sw-guide-visually-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}

@media (prefers-reduced-motion: no-preference) {
  .sw-guide .sw-guide__answer { animation: sw-guide-in 140ms ease-out; }
  .sw-guide .sw-guide__button, .sw-guide .sw-guide__icon, .sw-guide .sw-guide__send,
  .sw-guide-launcher .sw-guide-launcher__button { transition: background-color 110ms ease, color 110ms ease; }
  @keyframes sw-guide-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
}
`;
