/** Loads the invoices belonging to one client. */
import { useCallback, useEffect, useState } from 'react';
import { invoiceService } from '../services/invoiceService';
import type { Invoice } from '../types/invoice';

/** What {@link useInvoices} hands back. */
export interface UseInvoicesResult {
  invoices: Invoice[];
  loading: boolean;
  reload: () => Promise<void>;
}

/** Invoices for `clientId`, or every invoice when it is omitted. */
export function useInvoices(clientId?: string): UseInvoicesResult {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setInvoices(await invoiceService.list(clientId));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { invoices, loading, reload };
}
