/**
 * Branding and layout: whose product this is, and where the panel sits.
 *
 * Both are host-owned and both are untrusted. A product name and a logo URL
 * arrive from application code and often, eventually, from a customer's own
 * settings screen — so they are rendered as text and as an `img` source, never
 * as markup. There is no `dangerouslySetInnerHTML` anywhere in this package and
 * a branding string cannot introduce one.
 *
 * Attribution is not part of branding. A host may put its own name in the
 * header; the footer says **Powered by Statewave Guide** either way.
 *
 * @packageDocumentation
 */

import type { ReactNode } from 'react';

/** Whose application the guide is living inside. */
export interface GuideBranding {
  /** Shown beside the guide's own name. Rendered as text. */
  productName?: string;
  /**
   * A logo. A string is used as an image source; a node is rendered as given.
   *
   * A caller passing a node is passing React, which is already theirs to
   * control. A caller passing a string is passing data, and it is treated as
   * data — a URL, never markup.
   */
  productLogo?: string | ReactNode;
}

/** Where the panel sits and how big it is. */
export interface GuideLayout {
  /**
   * A floating card inset from the viewport edge, or a panel docked to it.
   *
   * Floating is the product default: a card that sits over the application
   * reads as part of it. Docked is for hosts that want the guide to own a
   * column, and is what the first interactive product shipped as.
   */
  mode: 'floating' | 'docked';
  side: 'left' | 'right';
  /** Panel width in pixels, clamped to something the host survives. */
  width: number;
  /** What happens on a narrow viewport. */
  mobileMode: 'sheet' | 'full';
  /** Where the collapsed launcher sits. Follows `side` by default. */
  launcherPosition: 'bottom-left' | 'bottom-right';
  /** Below this viewport width the panel becomes a sheet. */
  mobileBreakpoint: number;
}

export const defaultGuideLayout: GuideLayout = {
  mode: 'floating',
  side: 'right',
  width: 440,
  mobileMode: 'sheet',
  launcherPosition: 'bottom-right',
  mobileBreakpoint: 720,
};

/** The bounds a panel width is held to. */
export const MIN_PANEL_WIDTH = 340;
export const MAX_PANEL_WIDTH = 560;

/** Layout as a host may write it. */
export type GuideLayoutInput = Partial<GuideLayout>;

/** What resolution produced, and what it refused. */
export interface ResolvedLayout {
  layout: GuideLayout;
  issues: readonly { path: string; value: unknown; reason: string }[];
}

/**
 * Merges layout configuration onto the defaults.
 *
 * The width clamp is the load-bearing part. A guide is a panel inside somebody
 * else's product, and a panel wide enough to make that product unusable is a
 * broken integration however clearly it was asked for. `NaN` and negatives fall
 * back rather than producing a panel of indeterminate size.
 */
export function resolveLayout(input: GuideLayoutInput | undefined): ResolvedLayout {
  const issues: { path: string; value: unknown; reason: string }[] = [];
  const layout: GuideLayout = { ...defaultGuideLayout };
  if (input === undefined) return { layout, issues };

  if (input.mode !== undefined) {
    if (input.mode === 'floating' || input.mode === 'docked') layout.mode = input.mode;
    else issues.push({ path: 'mode', value: input.mode, reason: 'must be "floating" or "docked"' });
  }
  if (input.side !== undefined) {
    if (input.side === 'left' || input.side === 'right') layout.side = input.side;
    else issues.push({ path: 'side', value: input.side, reason: 'must be "left" or "right"' });
  }
  if (input.width !== undefined) {
    if (typeof input.width === 'number' && Number.isFinite(input.width)) {
      const clamped = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(input.width)));
      if (clamped !== Math.round(input.width)) {
        issues.push({
          path: 'width',
          value: input.width,
          reason: `clamped to ${clamped}px so the host stays usable`,
        });
      }
      layout.width = clamped;
    } else {
      issues.push({ path: 'width', value: input.width, reason: 'not a finite number' });
    }
  }
  if (input.mobileMode !== undefined) {
    if (input.mobileMode === 'sheet' || input.mobileMode === 'full')
      layout.mobileMode = input.mobileMode;
    else issues.push({ path: 'mobileMode', value: input.mobileMode, reason: 'unknown mode' });
  }
  if (input.mobileBreakpoint !== undefined) {
    if (typeof input.mobileBreakpoint === 'number' && input.mobileBreakpoint > 0) {
      layout.mobileBreakpoint = Math.round(input.mobileBreakpoint);
    } else {
      issues.push({
        path: 'mobileBreakpoint',
        value: input.mobileBreakpoint,
        reason: 'not positive',
      });
    }
  }
  layout.launcherPosition =
    input.launcherPosition ?? (layout.side === 'left' ? 'bottom-left' : 'bottom-right');
  return { layout, issues };
}

/** The attribution, which every panel carries. */
export const ATTRIBUTION_TEXT = 'Powered by Statewave Guide';
export const ATTRIBUTION_PRODUCT = 'Statewave Guide';
export const ATTRIBUTION_URL = 'https://statewave.ai';
