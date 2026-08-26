/**
 * Invoice routes.
 *
 * Mounted at `${API_PREFIX}/invoices`, so the paths here are relative to the
 * collection: `'/'` is `GET /invoices`, not `GET /`. Composing the mount point
 * with the registration is the only way to get the canonical path right.
 */
import { Router } from 'express';
import { createInvoice, listInvoices, streamInvoicePdf } from '../controllers/invoiceController';
import { requireEveryPermission, requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { createInvoiceSchema } from '../validation/invoiceSchemas';
import { Permissions } from '../lib/permissions';

export const invoicesRouter = Router();

invoicesRouter.get('/', requirePermission(Permissions.InvoiceRead), listInvoices);
invoicesRouter.post('/', requirePermission(Permissions.InvoiceCreate), validate(createInvoiceSchema), createInvoice);
// Two permissions, from an array rather than a single literal argument. The
// endpoint requires both; an extractor that reads only the first loses one.
invoicesRouter.get('/:invoiceId/pdf', requireEveryPermission([Permissions.InvoiceRead, Permissions.ClientRead]), streamInvoicePdf);
