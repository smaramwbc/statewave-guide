/**
 * A development-only playground for the theme API, laid out as the reference
 * shows it: a card with a gear in the header, one labelled row per token, icon
 * buttons for density and position, and a reset in a tinted footer.
 *
 * Every control writes into the same typed configuration a host would write by
 * hand, and **Copy config** emits exactly that. It reads a contrast ratio for
 * the combinations that matter and warns rather than correcting: silently
 * adjusting a colour somebody chose would be this package overruling a host's
 * design decision.
 *
 * Persistence is `localStorage`, which is appropriate for a playground and is
 * not memory in any sense this project means the word.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { GuideBranding, GuideLayoutInput, GuideThemeInput } from '@statewavedev/guide-react';
import { defaultGuideTheme } from '@statewavedev/guide-react';
import {
  GuideCloseIcon as Close,
  GuideDensityIcon as DensityIcon,
  GuideGearIcon as Gear,
  GuidePositionIcon as PositionIcon,
  GuideResetIcon as Reset,
} from '@statewavedev/guide-react';

const STORAGE_KEY = 'statewave-guide-playground';

export interface PlaygroundConfig {
  theme: GuideThemeInput;
  branding: GuideBranding;
  layout: GuideLayoutInput;
}

export const emptyConfig: PlaygroundConfig = { theme: {}, branding: {}, layout: {} };

function luminance(hex: string): number | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return undefined;
  const channels = [0, 2, 4].map(
    (offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** WCAG contrast ratio, when both colours are hex. */
export function contrast(a: string, b: string): number | undefined {
  const left = luminance(a);
  const right = luminance(b);
  if (left === undefined || right === undefined) return undefined;
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

const SWATCHES = ['#635bff', '#0ea5e9', '#10b981', '#f97316', '#ec4899', '#1f2937'];
const FONTS: [string, string][] = [
  ['Inter', defaultGuideTheme.typography.fontFamily],
  ['System', 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'],
  ['Georgia', 'ui-serif, Georgia, serif'],
  ['Monospace', 'ui-monospace, SFMono-Regular, Menlo, monospace'],
];

export function Customizer(props: {
  config: PlaygroundConfig;
  onChange(config: PlaygroundConfig): void;
  onClose?(): void;
}): ReactElement {
  const { config, onChange } = props;
  const colors = { ...defaultGuideTheme.colors, ...(config.theme.colors ?? {}) };

  const set = useCallback(
    (patch: Partial<PlaygroundConfig>) => onChange({ ...config, ...patch }),
    [config, onChange],
  );
  const setTheme = (patch: GuideThemeInput): void => set({ theme: { ...config.theme, ...patch } });
  const setColor = (key: string, value: string): void =>
    setTheme({ colors: { ...(config.theme.colors ?? {}), [key]: value } });

  const warnings = useMemo(() => {
    const out: string[] = [];
    const pairs: [string, string, string, number][] = [
      ['text on background', colors.text, colors.background, 4.5],
      ['primary button', colors.primaryForeground, colors.primary, 4.5],
      ['muted text', colors.mutedText, colors.background, 4.5],
      ['condition box', colors.mutedText, colors.surfaceElevated, 4.5],
    ];
    for (const [label, fg, bg, minimum] of pairs) {
      const ratio = contrast(fg, bg);
      if (ratio !== undefined && ratio < minimum)
        out.push(`${label}: ${ratio.toFixed(1)}:1 (needs ${minimum}:1)`);
    }
    return out;
  }, [colors]);

  const exported = useMemo(() => {
    const block = (value: unknown): string => JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
    return `<StatewaveGuide\n  branding={${block(config.branding)}}\n  theme={${block(config.theme)}}\n  layout={${block(config.layout)}}\n/>`;
  }, [config]);

  const position = config.layout.mobileMode === 'full' ? 'sheet' : (config.layout.side ?? 'right');

  return (
    <aside className="pg" data-testid="customizer" aria-label="Customize Statewave Guide">
      <header className="pg__head">
        <span className="pg__head-icon" aria-hidden="true">
          <Gear />
        </span>
        <strong>Customize Statewave Guide</strong>
        {props.onClose !== undefined && (
          <button
            type="button"
            className="pg__close"
            aria-label="Close customizer"
            onClick={props.onClose}
          >
            <Close />
          </button>
        )}
      </header>
      <p className="pg__sub">Make it your own.</p>

      <div className="pg__body">
        <label className="pg__field">
          <span className="pg__label">Product name</span>
          <input
            className="pg__input"
            data-testid="pg-product-name"
            value={config.branding.productName ?? ''}
            placeholder="Acme CRM"
            onChange={(e) =>
              set({ branding: { ...config.branding, productName: e.target.value || undefined } })
            }
          />
        </label>

        <div className="pg__field">
          <span className="pg__label">Color</span>
          <div className="pg__swatches">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="pg__swatch"
                data-testid={`pg-color-${swatch.slice(1)}`}
                aria-label={`Primary ${swatch}`}
                aria-pressed={colors.primary.toLowerCase() === swatch}
                style={{ '--swatch': swatch } as React.CSSProperties}
                onClick={() => setColor('primary', swatch)}
              />
            ))}
          </div>
        </div>

        <label className="pg__field">
          <span className="pg__label">Font</span>
          <span className="pg__select">
            <select
              data-testid="pg-font"
              value={config.theme.typography?.fontFamily ?? defaultGuideTheme.typography.fontFamily}
              onChange={(e) =>
                setTheme({
                  typography: { ...(config.theme.typography ?? {}), fontFamily: e.target.value },
                })
              }
            >
              {FONTS.map(([label, stack]) => (
                <option key={label} value={stack}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </label>

        <div className="pg__field">
          <span className="pg__label">Radius</span>
          <div className="pg__row">
            {[6, 8, 12, 16].map((radius) => (
              <button
                key={radius}
                type="button"
                className="pg__chip"
                data-testid={`pg-radius-${radius}`}
                aria-pressed={(config.theme.radius ?? 12) === radius}
                onClick={() => setTheme({ radius })}
              >
                {radius}px
              </button>
            ))}
          </div>
        </div>

        <div className="pg__field">
          <span className="pg__label">Density</span>
          <div className="pg__row pg__row--icons">
            {(['compact', 'comfortable', 'spacious'] as const).map((density, index) => (
              <button
                key={density}
                type="button"
                className="pg__chip pg__chip--icon"
                data-testid={`pg-density-${density}`}
                aria-label={`${density} density`}
                aria-pressed={(config.theme.density ?? 'comfortable') === density}
                onClick={() => setTheme({ density })}
              >
                <DensityIcon level={index as 0 | 1 | 2} />
              </button>
            ))}
          </div>
        </div>

        <div className="pg__field">
          <span className="pg__label">Position</span>
          <div className="pg__row pg__row--icons">
            {(['left', 'right', 'sheet'] as const).map((where) => (
              <button
                key={where}
                type="button"
                className="pg__chip pg__chip--icon"
                data-testid={`pg-side-${where}`}
                aria-label={where === 'sheet' ? 'Bottom sheet' : `Panel on the ${where}`}
                aria-pressed={position === where}
                onClick={() =>
                  set({
                    layout:
                      where === 'sheet'
                        ? { ...config.layout, mobileMode: 'full', mobileBreakpoint: 100000 }
                        : {
                            ...config.layout,
                            side: where,
                            mobileMode: 'sheet',
                            mobileBreakpoint: 720,
                          },
                  })
                }
              >
                <PositionIcon where={where} />
              </button>
            ))}
          </div>
        </div>

        <div className="pg__field">
          <span className="pg__label">Appearance</span>
          <div className="pg__row">
            {(['light', 'dark', 'system'] as const).map((appearance) => (
              <button
                key={appearance}
                type="button"
                className="pg__chip"
                data-testid={`pg-appearance-${appearance}`}
                aria-pressed={(config.theme.appearance ?? 'system') === appearance}
                onClick={() => setTheme({ appearance })}
              >
                {appearance}
              </button>
            ))}
          </div>
        </div>

        <label className="pg__field">
          <span className="pg__label">
            Width <span className="pg__value">{config.layout.width ?? 420}px</span>
          </span>
          <input
            type="range"
            min={320}
            max={560}
            data-testid="pg-width"
            value={config.layout.width ?? 420}
            onChange={(e) => set({ layout: { ...config.layout, width: Number(e.target.value) } })}
          />
        </label>

        {warnings.length > 0 && (
          <div className="pg__warn" data-testid="pg-contrast-warning">
            <strong>Contrast</strong>
            {warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        )}

        <details className="pg__export">
          <summary>Copy config</summary>
          <pre data-testid="pg-config">{exported}</pre>
        </details>
      </div>

      <footer className="pg__foot">
        <button
          type="button"
          className="pg__reset"
          data-testid="pg-reset"
          onClick={() => onChange(emptyConfig)}
        >
          <Reset />
          Reset to defaults
        </button>
      </footer>
    </aside>
  );
}

/** Playground state, kept in `localStorage`. Development only. */
export function usePlayground(): [PlaygroundConfig, (config: PlaygroundConfig) => void] {
  const [config, setConfig] = useState<PlaygroundConfig>(() => {
    try {
      const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
      return stored === null || stored === undefined
        ? emptyConfig
        : (JSON.parse(stored) as PlaygroundConfig);
    } catch {
      return emptyConfig;
    }
  });
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // A playground that cannot persist is still a playground.
    }
  }, [config]);
  return [config, setConfig];
}
