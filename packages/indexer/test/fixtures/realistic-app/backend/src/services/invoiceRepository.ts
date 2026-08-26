/**
 * Invoice persistence.
 *
 * Deliberately shares *nothing* with the frontend's `invoiceService`: not the
 * module basename, not the exported const, not one member name. The frontend
 * calls `invoiceService.create`; this file declares `invoiceRepository.insert`.
 * The only thing that can join the two sides on `api:POST:/invoices` is the
 * path, which is the claim the fixture makes about the frontend/backend join.
 *
 * `clientService` is the opposite arrangement on purpose — same name on both
 * sides, same six members — so the fixture holds both cases at once.
 */
import { randomUUID } from 'node:crypto';
import { query } from '../lib/db';
import type { InvoiceDto, InvoiceRecord } from '../types/invoice';
import type { CreateInvoiceInput } from '../validation/invoiceSchemas';

/** Maps a database row to the API shape. */
function toDto(record: InvoiceRecord): InvoiceDto {
  return {
    id: record.id,
    number: record.number,
    clientId: record.client_id,
    amountInCents: record.amount_in_cents,
    status: record.status,
    issuedAt: record.issued_at,
  };
}

export const invoiceRepository = {
  /** Every invoice, optionally narrowed to one client. */
  async findPage(clientId?: string): Promise<InvoiceDto[]> {
    const rows = await query<InvoiceRecord>(
      'select * from invoices where ($1 is null or client_id = $1) order by issued_at desc',
      [clientId ?? null],
    );
    return rows.map(toDto);
  },

  /** Raises an invoice. */
  async insert(input: CreateInvoiceInput): Promise<InvoiceDto> {
    const id = `inv_${randomUUID()}`;
    const rows = await query<InvoiceRecord>(
      'insert into invoices (id, client_id, amount_in_cents, status) values ($1, $2, $3, $4) returning *',
      [id, input.clientId, input.amountInCents, 'draft'],
    );
    return toDto(rows[0]!);
  },

  /** Renders an invoice as a PDF. */
  async renderDocument(invoiceId: string): Promise<Buffer> {
    const rows = await query<InvoiceRecord>('select * from invoices where id = $1', [invoiceId]);
    return Buffer.from(`%PDF-1.4 invoice ${rows[0]?.number ?? invoiceId}`);
  },
};
