/**
 * Open/closed state for a dialog.
 *
 * The flag lives in this module, not in the component that renders the dialog,
 * which is what makes `state-flag-gates-element` stop working for consumers of
 * this hook. That is intentional: see `ClientDetailPage`.
 */
import { useCallback, useMemo, useState } from 'react';

/** The controller a caller gets back. */
export interface DialogController {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** Open/closed state plus the three transitions. */
export function useDialog(initiallyOpen = false): DialogController {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((previous) => !previous), []);

  return useMemo(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle]);
}
