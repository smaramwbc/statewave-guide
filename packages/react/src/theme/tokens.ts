/**
 * What a host application may change about how the guide looks.
 *
 * The rule that shapes this whole file: **presentation is configurable and truth
 * is not.** A theme can make the guide look like it was built by the team that
 * built the application around it, and there is no value anywhere in it that can
 * change what the guide says, which control it points at, what it refuses, or
 * what a user is allowed to be told. Twelve loops went into establishing where
 * those decisions live, and a colour is not one of them.
 *
 * Tokens rather than class names, because a class name is a promise about DOM
 * structure and this package does not make that promise. Everything here becomes
 * a CSS custom property with a `--statewave-guide-` prefix, which a host can also
 * override from its own stylesheet without rebuilding anything.
 *
 * @packageDocumentation
 */

/** Every colour the panel uses. */
export interface GuideColorTokens {
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  mutedText: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  danger: string;
  overlay: string;
  focusRing: string;
}

/**
 * Type, including the host's own stack.
 *
 * `fontFamily` is a plain CSS font stack and nothing fetches it. A guide that
 * pulled a webfont into somebody else's application would be making a network
 * request on their behalf, on their users' connections, for a decoration.
 */
export interface GuideTypographyTokens {
  fontFamily: string;
  /** The base size everything else is derived from. */
  fontSizeBase: string;
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeMd: string;
  fontSizeLg: string;
  fontWeightNormal: string;
  fontWeightMedium: string;
  fontWeightSemibold: string;
  lineHeight: string;
}

/** Corner radii, as a scale rather than a number sprinkled everywhere. */
export interface GuideRadiusTokens {
  panel: string;
  card: string;
  control: string;
}

/** Depth. Subtle by default; a guide is not a modal. */
export interface GuideShadowTokens {
  panel: string;
  launcher: string;
  highlight: string;
}

/**
 * How much room things take.
 *
 * Density changes spacing and never type semantics: a compact panel is a panel
 * with less air, not one with smaller headings, because shrinking type to fit is
 * how an accessible interface stops being one.
 */
export type GuideDensity = 'compact' | 'comfortable' | 'spacious';

/** Light, dark, or whatever the viewer's system says. */
export type GuideAppearance = 'light' | 'dark' | 'system';

/** The full theme. */
export interface GuideTheme {
  appearance: GuideAppearance;
  density: GuideDensity;
  colors: GuideColorTokens;
  /** Overrides applied only when the resolved appearance is dark. */
  darkColors: Partial<GuideColorTokens>;
  typography: GuideTypographyTokens;
  radius: GuideRadiusTokens;
  shadows: GuideShadowTokens;
}

/** A theme with any subset of fields supplied. */
export type PartialGuideTheme = {
  [K in keyof GuideTheme]?: GuideTheme[K] extends string ? GuideTheme[K] : Partial<GuideTheme[K]>;
};

/**
 * The Statewave identity, and a reasonable default for anybody who does not
 * want to think about it.
 *
 * Restrained on purpose: a guide is a guest, and a guest that arrives in a
 * gradient is a guest people close.
 */
export const defaultGuideTheme: GuideTheme = {
  appearance: 'system',
  density: 'comfortable',
  colors: {
    primary: '#635bff',
    primaryHover: '#5148f0',
    primaryForeground: '#ffffff',
    accent: '#ecebff',
    accentForeground: '#4f46e5',
    background: '#ffffff',
    surface: '#ffffff',
    surfaceElevated: '#f3f4f6',
    text: '#111827',
    mutedText: '#5f6673',
    border: '#e5e7eb',
    borderStrong: '#d1d5db',
    success: '#12805c',
    warning: '#9a6100',
    danger: '#b42318',
    overlay: 'rgba(17, 24, 39, 0.4)',
    focusRing: '#635bff',
  },
  darkColors: {
    primary: '#8b84ff',
    primaryHover: '#9d97ff',
    primaryForeground: '#12101f',
    accent: '#26244a',
    accentForeground: '#c7c3ff',
    background: '#0f1117',
    surface: '#141720',
    surfaceElevated: '#1b1f2a',
    text: '#e9ebf0',
    mutedText: '#9aa1b1',
    border: '#262b36',
    borderStrong: '#39404f',
    success: '#3ecf9a',
    warning: '#e0a23c',
    danger: '#f0736a',
    overlay: 'rgba(4, 6, 11, 0.6)',
    focusRing: '#8b84ff',
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSizeBase: '15px',
    fontSizeXs: '12px',
    fontSizeSm: '13.5px',
    fontSizeMd: '15px',
    fontSizeLg: '17px',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    fontWeightSemibold: '600',
    lineHeight: '1.55',
  },
  radius: { panel: '20px', card: '16px', control: '10px' },
  shadows: {
    panel: '0 1px 2px rgba(17, 24, 39, 0.04), 0 24px 60px -24px rgba(17, 24, 39, 0.28)',
    launcher: '0 10px 30px -8px rgba(99, 91, 255, 0.55)',
    highlight: '0 0 0 3px rgba(99, 91, 255, 0.35)',
  },
};

/** Spacing per density. Padding and gaps only — never type. */
export const DENSITY_SPACING: Readonly<
  Record<GuideDensity, { panelPadding: string; gap: string; stepGap: string; composer: string }>
> = {
  compact: { panelPadding: '14px', gap: '12px', stepGap: '8px', composer: '40px' },
  comfortable: { panelPadding: '20px', gap: '18px', stepGap: '14px', composer: '48px' },
  spacious: { panelPadding: '26px', gap: '26px', stepGap: '20px', composer: '54px' },
};
