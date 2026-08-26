/**
 * Invoices, with a *native* form.
 *
 * `ClientForm` submits through react-hook-form's `handleSubmit` wrapper; this
 * page submits through a plain `onSubmit={handler}`. Both shapes have to
 * produce a `submits_to` edge, and only one of them needs an inference rule.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/primitives/Button';
import { InvoiceList } from '../components/InvoiceList';
import { Toolbar } from '../components/Toolbar';
import { PermissionGate } from '../permissions/PermissionGate';
import { Permissions } from '../permissions/permissions';
import { useInvoices } from '../hooks/useInvoices';
import { invoiceService } from '../services';
import type { Invoice } from '../types/invoice';

/** Every invoice, plus a form for raising one. */
export function InvoicesPage() {
  const navigate = useNavigate();
  const { invoices, loading, reload } = useInvoices();
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('0');
  const [problem, setProblem] = useState<string | null>(null);

  /** Native submit handler: takes the event, prevents the default, posts. */
  const createInvoice = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setProblem(null);
    try {
      await invoiceService.create({ clientId, amountInCents: Math.round(Number(amount) * 100) });
      await reload();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'Could not raise the invoice');
    }
  };

  /** Sends the user to the client the invoice belongs to. */
  const showClient = (invoice: Invoice): void => {
    navigate(`/clients/${invoice.clientId}`);
  };

  return (
    <section className="page" data-guide="invoices">
      <header className="page__header">
        <h1>Invoices</h1>
        <Toolbar align="end">
          <Button data-guide="invoices.refresh" variant="ghost" onClick={() => void reload()}>
            Refresh
          </Button>
        </Toolbar>
      </header>

      <PermissionGate permission={Permissions.InvoiceCreate} fallback={<p>You cannot raise invoices.</p>}>
        <form className="invoice-form" data-guide="invoices.create-form" onSubmit={createInvoice}>
          <input
            data-guide="invoices.create-form.client"
            value={clientId}
            placeholder="Client id"
            onChange={(event) => setClientId(event.target.value)}
          />
          <input
            data-guide="invoices.create-form.amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <Button data-guide="invoices.create-form.submit" type="submit" variant="primary">
            Raise invoice
          </Button>
        </form>
      </PermissionGate>

      {problem !== null ? (
        <p className="alert" role="alert" data-guide="invoices.error">
          {problem}
        </p>
      ) : null}

      {loading ? null : <InvoiceList invoices={invoices} onSelect={showClient} />}
    </section>
  );
}
