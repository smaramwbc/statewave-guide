import { useEffect, useRef, useState } from 'react';
import { clientService } from '../services/clientService';

export interface NewClientDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The create-client form.
 *
 * `submitClient` is the middle of the behaviour chain the Inspector reconstructs:
 * the form submits to it, it calls `clientService.create`, and that calls
 * `POST /api/clients` — which is the same graph node the backend's route
 * registration attaches to.
 */
export function NewClientDialog({ open, onClose }: NewClientDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function submitClient() {
    setError(null);
    try {
      await clientService.create({ name, industry });
      onClose();
    } catch {
      // The demo has no backend running; the failure is expected and harmless.
      setError('No API is running — but the call is real, and the indexer sees it.');
    }
  }

  return (
    <dialog ref={dialogRef} data-guide="clients.create-dialog" onClose={onClose}>
      <h3>New client</h3>
      <form
        data-guide="clients.create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitClient();
        }}
      >
        <label>
          <span>Name</span>
          <input
            data-guide="clients.create-form.name"
            placeholder="Northwind Trading"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>
        <label>
          <span>Industry</span>
          <input
            data-guide="clients.create-form.industry"
            placeholder="Logistics"
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
          />
        </label>
        {error && <p className="lede">{error}</p>}
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
