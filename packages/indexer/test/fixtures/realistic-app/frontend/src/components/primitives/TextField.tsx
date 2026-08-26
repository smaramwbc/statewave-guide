/** A labelled text input. Forwards every unknown prop to the `<input>`. */
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

/** Props of {@link TextField}. */
export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** A labelled text input. `forwardRef` so react-hook-form can register it. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, ...rest },
  ref,
) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <input id={inputId} ref={ref} className="field__input" {...rest} />
      {hint !== undefined ? <span className="field__hint">{hint}</span> : null}
      {error !== undefined ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
});
