/**
 * A toolbar action.
 *
 * The handler arrives on a prop called `action`, not `onClick`. That is the
 * point: `action` is also a plain HTML attribute name, so an indexer that
 * treats every function-valued prop as a handler will manufacture edges here.
 */
import { Button } from './primitives/Button';
import type { ButtonHTMLAttributes } from 'react';

/** Props of {@link ToolbarButton}. */
export interface ToolbarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'action'> {
  label: string;
  /** Invoked on click. Not named `onClick` on purpose. */
  action: () => void;
  danger?: boolean;
}

/** A toolbar action. */
export function ToolbarButton({ label, action, danger = false, ...rest }: ToolbarButtonProps) {
  return (
    <Button variant={danger ? 'danger' : 'ghost'} data-guide="toolbar.action" onClick={action} {...rest}>
      {label}
    </Button>
  );
}
