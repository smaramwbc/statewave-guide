/**
 * The dialog the "New client" button opens.
 *
 * Thin on purpose: dialog chrome plus the form. The `data-guide` for the dialog
 * is written on a wrapper element inside `Dialog`'s children rather than passed
 * to `Dialog` as a prop, because a forwarded id is not something a syntax-only
 * indexer can see.
 */
import { Dialog } from './primitives/Dialog';
import { ClientForm } from './ClientForm';
import type { Client } from '../types/client';

/** Props of {@link NewClientDialog}. */
export interface NewClientDialogProps {
  onDismiss: () => void;
  onCreated: (client: Client) => void;
}

/** The create-client dialog. */
export function NewClientDialog({ onDismiss, onCreated }: NewClientDialogProps) {
  return (
    <Dialog open title="New client" onDismiss={onDismiss}>
      <div className="new-client" data-guide="clients.create-dialog">
        <p className="new-client__blurb">Clients appear in the list as soon as they are created.</p>
        <ClientForm onCreated={onCreated} onCancel={onDismiss} />
      </div>
    </Dialog>
  );
}
