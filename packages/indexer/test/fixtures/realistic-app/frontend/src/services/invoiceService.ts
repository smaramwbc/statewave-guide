/**
 * Invoice operations.
 *
 * Written as free functions aggregated into a shorthand object literal, which
 * is the second common service shape. The members are the same
 * `service.member` nodes as `clientService`'s, but the declaration is one hop
 * away from the object.
 */
import { api, unwrap } from '../lib/http';
import { INVOICES_PATH } from '../lib/constants';
import type { Invoice, InvoiceDraft } from '../types/invoice';

/** `GET /invoices`, optionally narrowed to one client. */
async function list(clientId?: string): Promise<Invoice[]> {
  return unwrap(api.get<Invoice[]>(INVOICES_PATH, { params: { clientId } }));
}

/** `POST /invoices`. */
async function create(draft: InvoiceDraft): Promise<Invoice> {
  return unwrap(api.post<Invoice>(INVOICES_PATH, draft));
}

/** Marks an invoice paid. Delegates to {@link create} for the credit note. */
async function markPaid(invoice: Invoice): Promise<Invoice> {
  const updated = await unwrap(api.post<Invoice>(INVOICES_PATH, { clientId: invoice.clientId, amountInCents: 0 }));
  return { ...updated, status: 'paid' };
}

export const invoiceService = { list, create, markPaid };
