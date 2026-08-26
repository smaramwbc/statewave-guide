/**
 * The application's button.
 *
 * Every `data-guide` in this codebase that names a button is written on *this*
 * component, not on the intrinsic `<button>` it renders. The attribute reaches
 * the DOM through `...rest`, so the element the indexer records has the tag
 * name `Button` while the element a user clicks is a `<button>`.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Visual weight. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Props of {@link Button}. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  icon?: ReactNode;
}

/** A button. */
export function Button({ variant = 'secondary', loading = false, icon, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant}${loading ? ' is-loading' : ''}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {icon !== undefined ? <span className="btn__icon">{icon}</span> : null}
      <span className="btn__label">{children}</span>
    </button>
  );
}
