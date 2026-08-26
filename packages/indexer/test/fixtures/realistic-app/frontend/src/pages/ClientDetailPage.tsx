/**
 * One client, its invoices and its destructive actions.
 *
 * The dialog on this page is controlled by `useDialog`, so the open flag is not
 * a `useState` call in this module. That is the deliberate counterpart to
 * `ClientsPage`: same user-visible behaviour, one hop further away from the
 * syntax.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/primitives/Button';
import { Spinner } from '../components/primitives/Spinner';
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog';
import { InvoiceList } from '../components/InvoiceList';
import { PermissionGate } from '../permissions/PermissionGate';
import { Permissions } from '../permissions/permissions';
import { useDialog } from '../hooks/useDialog';
import { useInvoices } from '../hooks/useInvoices';
import { clientService } from '../services/clientService';
import type { AuditEntry, Client, PlanTier } from '../types/client';
import type { Invoice } from '../types/invoice';

/** One client. */
export function ClientDetailPage() {
  const { clientId = '' } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const confirmDelete = useDialog();
  const { invoices } = useInvoices(clientId);
  const [client, setClient] = useState<Client | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  /** Loads the client this page is about. */
  const load = useCallback(async () => {
    setClient(await clientService.get(clientId));
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Opens the confirmation dialog.
   *
   * `confirmDelete.open` is a member of the object `useDialog` returns, so the
   * call resolves; whether the *dialog* it opens can be identified is a
   * different question, and one this fixture answers with "not from syntax".
   */
  const askToDelete = useCallback(() => {
    confirmDelete.open();
  }, [confirmDelete]);

  /** Deletes, then returns to the list. */
  const confirmDeleteClient = async (): Promise<void> => {
    await clientService.remove(clientId);
    confirmDelete.close();
    navigate('/clients');
  };

  /** Renames the client in place. */
  const saveName = async (name: string): Promise<void> => {
    await clientService.update(clientId, { name });
    await load();
  };

  /**
   * Moves the client to another plan.
   *
   * The write verb is decided here and handed to the service, which is what
   * makes `clientService.save` unresolvable *on a chain a user can walk*:
   * `client-detail.change-plan` -> `changePlan` -> `clientService.save` -> no
   * endpoint. An unresolved edge on dead code costs nothing; this one is a
   * reported gap in a live flow.
   */
  const changePlan = async (plan: PlanTier): Promise<void> => {
    await clientService.save({ plan }, clientId, 'patch');
    await load();
  };

  /** Pulls the audit trail, which is served outside the axios client. */
  const loadAudit = async (): Promise<void> => {
    setAudit(await clientService.auditTrail(clientId));
  };

  /** Where "Back" goes. Read from history state, so not a literal. */
  const backTo = (window.history.state?.from as string | undefined) ?? '/clients';

  const openInvoice = (invoice: Invoice): void => {
    navigate(`/invoices?highlight=${invoice.id}`);
  };

  if (client === null) return <Spinner label="Loading client" />;

  return (
    <section className="page" data-guide="client-detail">
      <header className="page__header">
        <h1 data-guide="client-detail.name">{client.name}</h1>
        {/* A dynamic destination: the value is known only at runtime. */}
        <Link to={backTo} data-guide="client-detail.back">
          Back
        </Link>
      </header>

      <Toolbarish>
        <PermissionGate permission={Permissions.ClientUpdate}>
          <Button data-guide="client-detail.rename" onClick={() => void saveName(`${client.name} (renamed)`)}>
            Rename
          </Button>
        </PermissionGate>
        <Button data-guide="client-detail.audit" variant="ghost" onClick={loadAudit}>
          Audit trail
        </Button>
        <PermissionGate permission={Permissions.ClientUpdate}>
          <Button data-guide="client-detail.change-plan" onClick={() => void changePlan('enterprise')}>
            Upgrade
          </Button>
        </PermissionGate>
        <PermissionGate permission={Permissions.ClientDelete}>
          <Button data-guide="client-detail.delete" variant="danger" onClick={askToDelete}>
            Delete
          </Button>
        </PermissionGate>
        <Link to="/invoices" data-guide="client-detail.invoices-link">
          All invoices
        </Link>
      </Toolbarish>

      <InvoiceList invoices={invoices} onSelect={openInvoice} />

      <ol className="audit" data-guide="client-detail.audit-list">
        {audit.map((entry) => (
          <li key={`${entry.at}-${entry.action}`}>
            {entry.actor} — {entry.action}
          </li>
        ))}
      </ol>

      <ConfirmDeleteDialog
        open={confirmDelete.isOpen}
        clientName={client.name}
        onDismiss={confirmDelete.close}
        onConfirm={confirmDeleteClient}
      />
    </section>
  );
}

/** A local layout wrapper, declared after the component that uses it. */
function Toolbarish({ children }: { children: ReactNode }) {
  return <div className="toolbar toolbar--end">{children}</div>;
}
