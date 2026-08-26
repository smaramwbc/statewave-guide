/** A busy indicator. */

/** Props of {@link Spinner}. */
export interface SpinnerProps {
  label?: string;
}

/** A busy indicator with an accessible label. */
export function Spinner({ label = 'Loading' }: SpinnerProps) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <span className="spinner__dot" />
      <span className="spinner__label">{label}</span>
    </div>
  );
}
