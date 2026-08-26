/**
 * Destructive-action confirmation.
 *
 * Passes a literal `guideId` down to `Dialog`, which writes it to `data-guide`
 * through an identifier. Whether `element:client-detail.delete-dialog` exists is
 * therefore a judgement call, and the manifest records it as ambiguous rather
 * than pretending there is one right answer.
 */
import { Button } from './primitives/Button';
import { Dialog } from './primitives/Dialog';

/** Props of {@link ConfirmDeleteDialog}. */
export interface ConfirmDeleteDialogProps {
  open: boolean;
  clientName: string;
  onDismiss: () => void;
  onConfirm: () => void | Promise<void>;
}

/** Asks before deleting. */
export function ConfirmDeleteDialog({ open, clientName, onDismiss, onConfirm }: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      open={open}
      title="Delete client"
      guideId="client-detail.delete-dialog"
      onDismiss={onDismiss}
      footer={
        <>
          <Button data-guide="client-detail.delete-dialog.cancel" variant="ghost" onClick={onDismiss}>
            Keep client
          </Button>
          <Button data-guide="client-detail.delete-dialog.confirm" variant="danger" onClick={() => void onConfirm()}>
            Delete permanently
          </Button>
        </>
      }
    >
      <p>
        Deleting <strong>{clientName}</strong> also deletes their invoices. This cannot be undone.
      </p>
    </Dialog>
  );
}
