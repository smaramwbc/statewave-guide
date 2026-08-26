/** The invoice domain, as the frontend sees it. */

/** Where an invoice is in its lifecycle. */
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

/** An invoice as returned by `GET /invoices`. */
export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  amountInCents: number;
  status: InvoiceStatus;
  issuedAt: string;
}

/** The fields a user supplies when raising an invoice. */
export interface InvoiceDraft {
  clientId: string;
  amountInCents: number;
  note?: string;
}
