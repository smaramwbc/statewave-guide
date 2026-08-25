import type { ReactNode } from 'react';

export interface ClientDialogProps {
  children?: ReactNode;
}

export const ClientDialog = ({ children }: ClientDialogProps) => (
  <dialog data-guide="clients.dialog.root" data-guide-label="Client details">
    {children}
  </dialog>
);
