/**
 * The handful of glyphs the panel uses, as inline SVG.
 *
 * Inline so nothing is fetched, `currentColor` so every one takes the theme,
 * `aria-hidden` so none of them is read aloud beside the text that already says
 * what they mean.
 */

import type { ReactElement } from 'react';

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': true,
  focusable: false,
} as const;

export const Sparkle = ({ size = 18 }: { size?: number }): ReactElement => (
  <svg {...base} width={size} height={size}>
    <path
      fill="currentColor"
      d="M12 2.5c.3 3.9 2.6 7.2 6.5 9.5-3.9 2.3-6.2 5.6-6.5 9.5-.3-3.9-2.6-7.2-6.5-9.5 3.9-2.3 6.2-5.6 6.5-9.5z"
    />
    <path
      fill="currentColor"
      d="M19 14.5c.15 1.6 1.1 2.9 2.5 3.5-1.4.6-2.35 1.9-2.5 3.5-.15-1.6-1.1-2.9-2.5-3.5 1.4-.6 2.35-1.9 2.5-3.5z"
    />
  </svg>
);

export const Play = (): ReactElement => (
  <svg {...base} width={16} height={16}>
    <path d="M7 5.5v13l10-6.5-10-6.5z" fill="currentColor" />
  </svg>
);

export const ListIcon = (): ReactElement => (
  <svg {...base} width={16} height={16} stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const Paperclip = (): ReactElement => (
  <svg
    {...base}
    width={18}
    height={18}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6" />
  </svg>
);

export const Send = (): ReactElement => (
  <svg {...base} width={20} height={20}>
    <path d="M2.5 12 21 3.5l-7.2 17-2.4-7.9L2.5 12z" fill="currentColor" />
  </svg>
);

export const Info = (): ReactElement => (
  <svg
    {...base}
    width={16}
    height={16}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const Dots = (): ReactElement => (
  <svg {...base} width={18} height={18}>
    <circle cx="5" cy="12" r="1.7" fill="currentColor" />
    <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    <circle cx="19" cy="12" r="1.7" fill="currentColor" />
  </svg>
);

export const Close = (): ReactElement => (
  <svg {...base} width={18} height={18} stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Chevron = (): ReactElement => (
  <svg
    {...base}
    width={14}
    height={14}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const Check = ({ double = false }: { double?: boolean }): ReactElement => (
  <svg
    {...base}
    width={16}
    height={16}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={double ? 'M2 12.5l4 4L14 8M9 16.5l1.5 1.5L20 9' : 'M5 12.5l4 4L18 8'} />
  </svg>
);

export const Gear = (): ReactElement => (
  <svg
    {...base}
    width={16}
    height={16}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const Reset = (): ReactElement => (
  <svg
    {...base}
    width={16}
    height={16}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

/** Density: three stacked lines at three spacings. */
export const DensityIcon = ({ level }: { level: 0 | 1 | 2 }): ReactElement => {
  const gap = [7, 5, 3.5][level]!;
  const y = 12 - gap;
  return (
    <svg
      {...base}
      width={18}
      height={18}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d={`M5 ${y}h14M5 12h14M5 ${12 + gap}h14`} />
    </svg>
  );
};

/** Position: a frame with the panel on one side, or a sheet along the bottom. */
export const PositionIcon = ({ where }: { where: 'left' | 'right' | 'sheet' }): ReactElement => (
  <svg
    {...base}
    width={18}
    height={18}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    {where === 'left' && (
      <rect x="5.5" y="6.5" width="5" height="11" rx="1" fill="currentColor" stroke="none" />
    )}
    {where === 'right' && (
      <rect x="13.5" y="6.5" width="5" height="11" rx="1" fill="currentColor" stroke="none" />
    )}
    {where === 'sheet' && (
      <rect x="5.5" y="12.5" width="13" height="5" rx="1" fill="currentColor" stroke="none" />
    )}
  </svg>
);
