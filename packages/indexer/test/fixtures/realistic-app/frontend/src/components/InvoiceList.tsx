/**
 * Invoices for one client.
 *
 * Holds the `navigate` trap: a local function with the same name as
 * react-router's hook result, which routes nowhere.
 */
import { useState } from 'react';
import { formatCurrency, formatDate } from '../lib/format';
import { formatDate as formatIsoDate } from '../lib/legacy-format';
import type { Invoice } from '../types/invoice';

/** Props of {@link InvoiceList}. */
export interface InvoiceListProps {
  invoices: Invoice[];
  onSelect: (invoice: Invoice) => void;
}

/** Invoices for one client. */
export function InvoiceList({ invoices, onSelect }: InvoiceListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * Not `useNavigate()`. Same name, no router, no route change — it parks a
   * marker in local state.
   *
   * The argument is deliberately a route-shaped string, and `clearSelection`
   * below calls it with a bare literal, so the trap has something to bite on: a
   * name-keyed extractor sees `navigate('/invoices')` and emits a route change
   * that does not happen.
   */
  const navigate = (to: string): void => {
    setActiveId(to);
  };

  /** Clears the highlight. */
  const clearSelection = (): void => {
    navigate('/invoices');
  };

  /** Selects a row. */
  const selectRow = (invoice: Invoice): void => {
    navigate(`/invoices/${invoice.id}`);
    onSelect(invoice);
  };

  return (
    <ul className="invoice-list" data-guide="invoices.list">
      <li>
        <button type="button" data-guide="invoices.list.clear" onClick={clearSelection}>
          Clear selection
        </button>
      </li>
      {invoices.map((invoice) => (
        <li
          key={invoice.id}
          data-guide="invoices.list.row"
          className={`/invoices/${invoice.id}` === activeId ? 'is-active' : undefined}
        >
          <button type="button" data-guide="invoices.list.open" onClick={() => selectRow(invoice)}>
            {invoice.number}
          </button>
          {/* A computed guide id: no literal, so no element. */}
          <span data-guide={`invoices.list.${invoice.status}`}>{invoice.status}</span>
          <span className="invoice-list__amount">{formatCurrency(invoice.amountInCents)}</span>
          <time dateTime={invoice.issuedAt} title={formatIsoDate(invoice.issuedAt)}>
            {formatDate(invoice.issuedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
