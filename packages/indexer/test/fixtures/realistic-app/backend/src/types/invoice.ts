/** The invoice domain, as the database stores it. */

/** A row of the `invoices` table. */
export interface InvoiceRecord {
  id: string;
  number: string;
  client_id: string;
  amount_in_cents: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
  issued_at: string;
}

/** An invoice as the API returns it. */
export interface InvoiceDto {
  id: string;
  number: string;
  clientId: string;
  amountInCents: number;
  status: 'draft' | 'sent' | 'paid' | 'void';
  issuedAt: string;
}
