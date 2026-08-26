/**
 * Invoice HTTP handlers.
 *
 * The names do not line up with the persistence layer: `listInvoices` calls
 * `findPage`, `createInvoice` calls `insert`, `streamInvoicePdf` calls
 * `renderDocument`. A resolver keyed on the verb+resource convention that the
 * client controller follows gets nothing here and has to use the imports.
 */
import type { NextFunction, Request, Response } from 'express';
import { invoiceRepository } from '../services/invoiceRepository';
import { invoiceListQuerySchema } from '../validation/invoiceSchemas';
import type { CreateInvoiceInput } from '../validation/invoiceSchemas';

/** `GET /invoices`. */
export async function listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = invoiceListQuerySchema.parse(req.query);
    res.json(await invoiceRepository.findPage(query.clientId));
  } catch (cause) {
    next(cause);
  }
}

/**
 * `POST /invoices`.
 *
 * The body is already validated by the `validate(createInvoiceSchema)`
 * middleware on the route, so this handler trusts it.
 */
export async function createInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = req.body as CreateInvoiceInput;
    const created = await invoiceRepository.insert(input);
    res.status(201).json(created);
  } catch (cause) {
    next(cause);
  }
}

/** `GET /invoices/:invoiceId/pdf` — a backend-only endpoint. */
export async function streamInvoicePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pdf = await invoiceRepository.renderDocument(String(req.params.invoiceId));
    res.type('application/pdf').send(pdf);
  } catch (cause) {
    next(cause);
  }
}
