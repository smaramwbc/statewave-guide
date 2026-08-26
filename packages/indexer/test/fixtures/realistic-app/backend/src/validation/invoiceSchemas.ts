/** Zod schemas for the invoice endpoints. */
import { z } from 'zod';

/** Body of `POST /invoices`. */
export const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  amountInCents: z.number().int().nonnegative(),
  note: z.string().max(500).optional(),
});

/** Query string of `GET /invoices`. */
export const invoiceListQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
  status: z.enum(['draft', 'sent', 'paid', 'void']).optional(),
});

/** Validated body of `POST /invoices`. */
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
