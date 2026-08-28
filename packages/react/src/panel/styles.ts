/**
 * The panel's own styles, scoped and shipped with it.
 *
 * A guide is a guest in somebody else's application, so every rule is prefixed
 * and nothing is a bare element selector. The palette comes from CSS custom
 * properties with fallbacks, which is how the panel inherits a host's theme
 * without this package inventing a theming system.
 *
 * The design is deliberately not a chat client. No avatars, no bubble per
 * sentence, no gradient. A question is a short line; an answer is a small
 * document with a heading, a purpose, a numbered procedure and one clear
 * affordance. It should read like part of the application rather than like
 * something bolted to the side of it.
 *
 * @packageDocumentation
 */

export const GUIDE_PANEL_STYLE_ID = 'statewave-guide-panel-styles';

export const GUIDE_PANEL_CSS = `
.swg-panel {
  --swg-bg: var(--guide-surface, #ffffff);
  --swg-fg: var(--guide-text, #16181d);
  --swg-muted: var(--guide-text-muted, #5c6370);
  --swg-line: var(--guide-border, #e3e6ea);
  --swg-accent: var(--guide-accent, #2f5bd7);
  --swg-accent-soft: var(--guide-accent-soft, #eef2fd);
  --swg-shadow: rgba(16, 20, 28, 0.1);

  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(400px, 34vw);
  min-width: 320px;
  display: flex;
  flex-direction: column;
  background: var(--swg-bg);
  color: var(--swg-fg);
  border-left: 1px solid var(--swg-line);
  box-shadow: -1px 0 0 var(--swg-shadow);
  font: 14px/1.5 var(--guide-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  z-index: 2147483000;
}

@media (prefers-color-scheme: dark) {
  .swg-panel:not([data-theme="light"]) {
    --swg-bg: var(--guide-surface, #16181d);
    --swg-fg: var(--guide-text, #e8eaee);
    --swg-muted: var(--guide-text-muted, #9aa2ae);
    --swg-line: var(--guide-border, #2a2e36);
    --swg-accent: var(--guide-accent, #7d9bf0);
    --swg-accent-soft: var(--guide-accent-soft, #1d2637);
  }
}

/* Narrow viewports: the host must stay usable, so the panel becomes a sheet
   rather than swallowing the window. */
@media (max-width: 720px) {
  .swg-panel { width: 100%; min-width: 0; top: auto; height: 72vh; border-left: none; border-top: 1px solid var(--swg-line); }
}

.swg-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border-bottom: 1px solid var(--swg-line);
}
.swg-header__titles { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.swg-header__title { font-size: 13px; font-weight: 600; letter-spacing: 0.01em; margin: 0; }
.swg-header__subtitle { font-size: 12px; color: var(--swg-muted); margin: 0; }
.swg-header__spacer { flex: 1; }

.swg-iconbutton {
  appearance: none; background: transparent; border: 1px solid transparent;
  color: var(--swg-muted); border-radius: 6px; cursor: pointer;
  width: 26px; height: 26px; line-height: 1; font-size: 15px; padding: 0;
}
.swg-iconbutton:hover { background: var(--swg-accent-soft); color: var(--swg-fg); }
.swg-iconbutton:focus-visible { outline: 2px solid var(--swg-accent); outline-offset: 1px; }

.swg-conversation { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 16px; }
.swg-empty { color: var(--swg-muted); font-size: 13px; margin: auto 0; text-align: left; }
.swg-empty__lead { color: var(--swg-fg); font-weight: 500; margin: 0 0 4px; }

.swg-question { font-weight: 550; color: var(--swg-fg); margin: 0; }
.swg-question::before { content: "› "; color: var(--swg-muted); }

.swg-answer { display: flex; flex-direction: column; gap: 10px; }
.swg-answer__title { font-size: 15px; font-weight: 600; margin: 0; }
.swg-answer__purpose { margin: 0; }
.swg-answer__summary { margin: 0; color: var(--swg-muted); }

.swg-conditions { margin: 0; padding: 8px 10px; border-left: 2px solid var(--swg-accent); background: var(--swg-accent-soft); border-radius: 0 4px 4px 0; }
.swg-conditions p { margin: 0; font-size: 13px; }

.swg-steps { margin: 0; padding: 0; list-style: none; counter-reset: swg-step; display: flex; flex-direction: column; gap: 2px; }
.swg-steps li {
  counter-increment: swg-step; position: relative; padding: 6px 8px 6px 30px; border-radius: 5px;
}
.swg-steps li::before {
  content: counter(swg-step); position: absolute; left: 6px; top: 6px;
  width: 18px; height: 18px; border-radius: 50%; background: var(--swg-accent-soft);
  color: var(--swg-accent); font-size: 11px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
}
.swg-steps li[data-current="true"] { background: var(--swg-accent-soft); }

.swg-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.swg-button {
  appearance: none; border: 1px solid var(--swg-line); background: var(--swg-bg); color: var(--swg-fg);
  border-radius: 6px; padding: 5px 11px; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
}
.swg-button:hover:not(:disabled) { border-color: var(--swg-accent); color: var(--swg-accent); }
.swg-button:focus-visible { outline: 2px solid var(--swg-accent); outline-offset: 1px; }
.swg-button:disabled { opacity: 0.5; cursor: default; }
.swg-button--primary { background: var(--swg-accent); border-color: var(--swg-accent); color: #fff; }
.swg-button--primary:hover:not(:disabled) { color: #fff; filter: brightness(1.06); }

.swg-stepper { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.swg-stepper__count { color: var(--swg-muted); font-variant-numeric: tabular-nums; }

.swg-note { font-size: 13px; color: var(--swg-muted); margin: 0; }

.swg-choices { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }

.swg-composer { border-top: 1px solid var(--swg-line); padding: 10px 12px; display: flex; gap: 8px; align-items: flex-end; }
.swg-composer textarea {
  flex: 1; resize: none; border: 1px solid var(--swg-line); border-radius: 6px;
  padding: 7px 9px; font: inherit; background: var(--swg-bg); color: var(--swg-fg); min-height: 34px; max-height: 120px;
}
.swg-composer textarea:focus-visible { outline: 2px solid var(--swg-accent); outline-offset: -1px; border-color: var(--swg-accent); }

.swg-inspector { border-top: 1px solid var(--swg-line); font-size: 12px; }
.swg-inspector summary { padding: 8px 12px; cursor: pointer; color: var(--swg-muted); }
.swg-inspector pre { margin: 0; padding: 0 12px 12px; overflow-x: auto; font-size: 11px; line-height: 1.45; color: var(--swg-muted); }

@media (prefers-reduced-motion: no-preference) {
  .swg-answer { animation: swg-fade 140ms ease-out; }
  @keyframes swg-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
}
`;
