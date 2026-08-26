/** A row of actions above a page's content. */
import type { ReactNode } from 'react';

/** Props of {@link Toolbar}. */
export interface ToolbarProps {
  children: ReactNode;
  align?: 'start' | 'end';
}

/** A row of actions. */
export function Toolbar({ children, align = 'start' }: ToolbarProps) {
  return (
    <div className={`toolbar toolbar--${align}`} role="toolbar">
      {children}
    </div>
  );
}
