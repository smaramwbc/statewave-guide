import { useEffect, useRef } from 'react';

export interface NewClientDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The create-client form.
 *
 * Nothing here is wired to a backend — the demo exists to prove the guidance
 * path, and saving a client would be a `confirm`-risk action, which Day 0
 * deliberately has no confirmation UI for.
 */
export function NewClientDialog({ open, onClose }: NewClientDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={dialogRef} data-guide="clients.create-dialog" onClose={onClose}>
      <h3>New client</h3>
      <form
        data-guide="clients.create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <label>
          <span>Name</span>
          <input data-guide="clients.create-form.name" placeholder="Northwind Trading" autoFocus />
        </label>
        <label>
          <span>Industry</span>
          <input data-guide="clients.create-form.industry" placeholder="Logistics" />
        </label>
        <div className="row-actions">
          <button className="primary" type="submit" data-guide="clients.create-form.submit">
            Create client
          </button>
          <button type="button" onClick={onClose} data-guide="clients.create-form.cancel">
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
