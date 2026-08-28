/**
 * Turning what a host wrote into what the panel renders.
 *
 * Three jobs: accept a partial configuration without making anybody spell out
 * seventeen colours, refuse a value that would break the panel rather than
 * rendering something broken, and emit CSS custom properties so a host can also
 * reach in from its own stylesheet.
 *
 * The validation matters more than it looks. A theme arrives from application
 * code, sometimes from a database, sometimes from a customer's branding
 * settings — so `primary: "octarine"`, `width: NaN` and `radius: -4` are all
 * things that will eventually be passed in. None of them may produce a panel a
 * user cannot read. Every rejected value falls back to the default and is
 * reported, because silently ignoring configuration is its own kind of bug.
 *
 * @packageDocumentation
 */

import type {
  GuideAppearance,
  GuideDensity,
  GuideRadiusTokens,
  GuideTheme,
  PartialGuideTheme,
} from './tokens.js';
import { DENSITY_SPACING, defaultGuideTheme } from './tokens.js';

/** The variable prefix. One prefix, used everywhere, documented. */
export const CSS_VARIABLE_PREFIX = '--statewave-guide';

/**
 * A theme as a host may write it.
 *
 * `radius` accepts a single number for the common case — one coherent scale,
 * derived — or the full token object for anyone who wants control of each.
 */
export type GuideThemeInput = Omit<PartialGuideTheme, 'radius'> & {
  radius?: number | Partial<GuideRadiusTokens>;
};

/** Something the configuration asked for that could not be honoured. */
export interface ThemeIssue {
  path: string;
  value: unknown;
  reason: string;
}

const APPEARANCES: readonly GuideAppearance[] = ['light', 'dark', 'system'];
const DENSITIES: readonly GuideDensity[] = ['compact', 'comfortable', 'spacious'];

/**
 * Whether a string is a colour this can render.
 *
 * Deliberately syntactic rather than exhaustive: hex, `rgb()`, `hsl()`, and the
 * named colours a browser knows. A value that is not obviously a colour is
 * refused rather than handed to CSS, because CSS's answer to an unparseable
 * colour is to drop the declaration — which produces a panel with, say, no
 * background and black-on-black text, and no indication why.
 */
function isColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length === 0) return false;
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return true;
  if (/^(rgb|hsl|hwb|lab|lch|oklch|oklab|color)a?\([^)]*\)$/i.test(text)) return true;
  return CSS_COLOR_NAMES.has(text.toLowerCase());
}

/**
 * The colour keywords a browser knows.
 *
 * Listed rather than pattern-matched. The first version accepted any short word,
 * which meant `primary: "octarine"` was configuration this happily passed to CSS
 * — and CSS's answer to a colour it cannot parse is to drop the declaration,
 * producing a panel with a missing background and no indication why. A name is
 * either one of these or it is not a colour.
 */
const CSS_COLOR_NAMES: ReadonlySet<string> = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
]);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** A CSS length, or nothing. Rejects negatives and anything unparseable. */
function asLength(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? `${value}px` : undefined;
  }
  if (!isNonEmptyString(value)) return undefined;
  const text = value.trim();
  if (/^-/.test(text)) return undefined;
  return /^\d*\.?\d+(px|rem|em|%|pt)$/.test(text) ? text : undefined;
}

/** What {@link resolveTheme} produced, and what it had to refuse. */
export interface ResolvedTheme {
  theme: GuideTheme;
  issues: readonly ThemeIssue[];
}

/** Merges a host's configuration onto the defaults, rejecting what it cannot use. */
export function resolveTheme(input: GuideThemeInput | undefined): ResolvedTheme {
  const issues: ThemeIssue[] = [];
  const base = defaultGuideTheme;
  if (input === undefined) return { theme: base, issues };

  const take = <T>(path: string, value: unknown, ok: (v: unknown) => boolean, fallback: T): T => {
    if (value === undefined) return fallback;
    if (ok(value)) return value as T;
    issues.push({ path, value, reason: `not a usable value for ${path}` });
    return fallback;
  };

  const colors = { ...base.colors };
  for (const key of Object.keys(base.colors) as (keyof typeof colors)[]) {
    colors[key] = take(`colors.${key}`, input.colors?.[key], isColor, base.colors[key]);
  }
  const darkColors = { ...base.darkColors };
  for (const [key, value] of Object.entries(input.darkColors ?? {})) {
    const typed = key as keyof typeof colors;
    darkColors[typed] = take(
      `darkColors.${key}`,
      value,
      isColor,
      base.darkColors[typed] ?? colors[typed],
    );
  }

  const typography = { ...base.typography };
  typography.fontFamily = take(
    'typography.fontFamily',
    input.typography?.fontFamily,
    isNonEmptyString,
    base.typography.fontFamily,
  );
  for (const key of [
    'fontSizeBase',
    'fontSizeXs',
    'fontSizeSm',
    'fontSizeMd',
    'fontSizeLg',
  ] as const) {
    const supplied = input.typography?.[key];
    const length = asLength(supplied);
    if (supplied !== undefined && length === undefined) {
      issues.push({ path: `typography.${key}`, value: supplied, reason: 'not a valid CSS length' });
    }
    typography[key] = length ?? base.typography[key];
  }
  for (const key of [
    'fontWeightNormal',
    'fontWeightMedium',
    'fontWeightSemibold',
    'lineHeight',
  ] as const) {
    typography[key] = take(
      `typography.${key}`,
      input.typography?.[key],
      isNonEmptyString,
      base.typography[key],
    );
  }

  // One number becomes a coherent scale: cards take the value, controls take a
  // little less, the floating panel a little more.
  let radius = { ...base.radius };
  if (typeof input.radius === 'number') {
    const card = asLength(input.radius);
    if (card === undefined) {
      issues.push({ path: 'radius', value: input.radius, reason: 'not a valid radius' });
    } else {
      const control = asLength(Math.max(0, Math.round(input.radius * 0.7)))!;
      const panel = asLength(Math.round(input.radius * 1.25))!;
      radius = { panel, card, control };
    }
  } else if (input.radius !== undefined) {
    for (const key of ['panel', 'card', 'control'] as const) {
      const supplied = input.radius[key];
      const length = asLength(supplied);
      if (supplied !== undefined && length === undefined) {
        issues.push({ path: `radius.${key}`, value: supplied, reason: 'not a valid radius' });
      }
      radius[key] = length ?? base.radius[key];
    }
  }

  const shadows = { ...base.shadows };
  for (const key of ['panel', 'launcher', 'highlight'] as const) {
    shadows[key] = take(
      `shadows.${key}`,
      input.shadows?.[key],
      isNonEmptyString,
      base.shadows[key],
    );
  }

  const appearance = take<GuideAppearance>(
    'appearance',
    input.appearance,
    (value) => APPEARANCES.includes(value as GuideAppearance),
    base.appearance,
  );
  const density = take<GuideDensity>(
    'density',
    input.density,
    (value) => DENSITIES.includes(value as GuideDensity),
    base.density,
  );

  return {
    theme: { appearance, density, colors, darkColors, typography, radius, shadows },
    issues,
  };
}

/** `fontSizeBase` becomes `--statewave-guide-font-size-base`. */
const dash = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * The theme as CSS custom properties.
 *
 * Applied as inline style on the panel's own root, so it cannot reach the host
 * and the host's cascade cannot reorder it. Dark values are emitted separately
 * and selected by an attribute rather than by inverting anything: automatic
 * inversion produces dark modes where borders vanish and primary buttons glow.
 */
export function themeToCssVariables(theme: GuideTheme, dark: boolean): Record<string, string> {
  const palette = dark ? { ...theme.colors, ...theme.darkColors } : theme.colors;
  const spacing = DENSITY_SPACING[theme.density];
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(palette))
    vars[`${CSS_VARIABLE_PREFIX}-${dash(key)}`] = value;
  for (const [key, value] of Object.entries(theme.typography)) {
    vars[`${CSS_VARIABLE_PREFIX}-${dash(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.radius)) {
    vars[`${CSS_VARIABLE_PREFIX}-radius-${dash(key)}`] = value;
  }
  for (const [key, value] of Object.entries(theme.shadows)) {
    vars[`${CSS_VARIABLE_PREFIX}-shadow-${dash(key)}`] = value;
  }
  for (const [key, value] of Object.entries(spacing)) {
    vars[`${CSS_VARIABLE_PREFIX}-space-${dash(key)}`] = value;
  }
  return vars;
}

/** Every variable name this package generates, for documentation and tests. */
export function cssVariableNames(): string[] {
  return Object.keys(themeToCssVariables(defaultGuideTheme, false)).sort();
}
