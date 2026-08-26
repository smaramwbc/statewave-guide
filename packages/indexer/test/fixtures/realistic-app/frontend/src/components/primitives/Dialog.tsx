/**
 * The modal primitive.
 *
 * Note `data-guide={guideId}`: the attribute is present but its value is an
 * identifier, so there is no semantic id to record here. A caller that passes a
 * literal is forwarding an id across a component boundary, which a syntax-only
 * indexer cannot follow and must not guess at.
 */
import type { MouseEvent, ReactNode } from 'react';

/** Props of {@link Dialog}. */
export interface DialogProps {
  open: boolean;
  title: string;
  /** Forwarded to `data-guide`. Never a literal at this site. */
  guideId?: string;
  onDismiss: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** A modal dialog rendered in place. */
export function Dialog({ open, title, guideId, onDismiss, children, footer }: DialogProps) {
  if (!open) return null;
  return (
    <div className="dialog__backdrop" role="presentation" {...{ 'data-guide': 'dialog.backdrop' }} onClick={onDismiss}>
      <div className="dialog" role="dialog" aria-modal="true" data-guide={guideId} onClick={stopPropagation}>
        <header className="dialog__header">
          <h2 className="dialog__title">{title}</h2>
          <button type="button" className="dialog__close" aria-label="Close" onClick={onDismiss}>
            &times;
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer !== undefined ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Keeps a click inside the dialog from reaching the backdrop. */
function stopPropagation(event: MouseEvent<HTMLDivElement>): void {
  event.stopPropagation();
}
