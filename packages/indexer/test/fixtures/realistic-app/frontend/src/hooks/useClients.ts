/**
 * Loads a page of clients and keeps it fresh.
 *
 * The hop the graph has to make here is `useClients` -> barrel -> declaring
 * module -> `clientService.list`, which is the shortest realistic example of a
 * hook that wraps a service.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clientService } from '../services';
import type { Client, ClientListQuery } from '../types/client';

/** What {@link useClients} hands back. */
export interface UseClientsResult {
  clients: Client[];
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** One page of clients, plus a `reload` the caller can hang a button off. */
export function useClients(query: ClientListQuery = {}): UseClientsResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableQuery = useMemo<ClientListQuery>(
    () => ({ search: query.search, status: query.status, page: query.page, pageSize: query.pageSize }),
    [query.search, query.status, query.page, query.pageSize],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await clientService.list(stableQuery);
      setClients(page.items);
      setTotal(page.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load clients');
    } finally {
      setLoading(false);
    }
  }, [stableQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { clients, total, loading, error, reload };
}
