/**
 * The client list — the top of the flagship flow.
 *
 *   element clients.create -> openCreateClient -> NewClientDialog -> ClientForm
 *   -> submitClient -> clientService.create -> POST /clients
 *
 * Every hop above is meant to be provable. The unprovable things on this page
 * (the export via `await import`, the row handlers passed to `ClientTable`) are
 * called out where they appear.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/primitives/Button';
import { Spinner } from '../components/primitives/Spinner';
import { ClientTable } from '../components/ClientTable';
import { NewClientDialog } from '../components/NewClientDialog';
import { Toolbar } from '../components/Toolbar';
import { PermissionGate } from '../permissions/PermissionGate';
import { Permissions } from '../permissions/permissions';
import { useClients } from '../hooks/useClients';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { clientService } from '../services';
import { callConfiguredExport } from '../lib/endpoints';
import { DEFAULT_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from '../lib/constants';
import { pluralise } from '../lib/format';
import type { Client } from '../types/client';

/** The client list. */
export function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const query = useMemo(
    () => ({ search: debouncedSearch, pageSize: DEFAULT_PAGE_SIZE }),
    [debouncedSearch],
  );

  // The list endpoint is GET /clients and it is paginated — see the notes at
  // /clients in the API docs for the query it accepts. Prose in a comment is
  // not a call site.
  const { clients, total, loading, error, reload } = useClients(query);

  // The flag that gates the dialog lives here, in the same component that
  // renders it, so the `opens` edge is provable without leaving this file.
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  /** Opens the create dialog. Referenced by `element:clients.create`. */
  const openCreateClient = useCallback(() => {
    setIsCreateOpen(true);
  }, []);

  /** Closes it again. */
  const closeCreateClient = useCallback(() => {
    setIsCreateOpen(false);
  }, []);

  /** Runs after a successful create: close, refresh, then show the new client. */
  const handleCreated = useCallback(
    async (client: Client) => {
      setIsCreateOpen(false);
      await reload();
      navigate(`/clients/${client.id}`);
    },
    [navigate, reload],
  );

  /** Row activation. Handed to `ClientTable` on a prop. */
  const openClient = (client: Client): void => {
    navigate(`/clients/${client.id}`);
  };

  /** Row deletion. Also handed over on a prop. */
  const deleteClient = async (client: Client): Promise<void> => {
    await clientService.remove(client.id);
    await reload();
  };

  /**
   * CSV export.
   *
   * The module is loaded lazily because it pulls in a formatting library that
   * doubles the bundle. `mod` is a runtime value, so `mod.exportToCsv(...)` is
   * not a statically known callee.
   */
  const exportClients = async (): Promise<void> => {
    const mod = await import('../lib/heavy');
    const csv = mod.exportToCsv(clients);
    mod.downloadBlob(csv, 'clients.csv');
    // And the server-rendered copy, from whatever path the deployment set.
    await callConfiguredExport();
  };

  return (
    <section className="page" data-guide="clients">
      <header className="page__header">
        <h1>
          Clients <span data-guide="clients.count">{pluralise(total, 'client')}</span>
        </h1>
        <Toolbar align="end">
          <PermissionGate permission={Permissions.ClientCreate}>
            <Button data-guide="clients.create" variant="primary" onClick={openCreateClient}>
              New client
            </Button>
          </PermissionGate>
          <Button data-guide="clients.refresh" variant="ghost" onClick={() => void reload()}>
            Refresh
          </Button>
          <Button data-guide="clients.export" variant="ghost" onClick={exportClients}>
            Export CSV
          </Button>
        </Toolbar>
      </header>

      <input
        data-guide="clients.search"
        type="search"
        className="search"
        value={search}
        placeholder="Search clients"
        onChange={(event) => setSearch(event.target.value)}
      />

      {error !== null ? (
        <p className="alert" role="alert" data-guide="clients.error">
          {error}
        </p>
      ) : null}

      {loading ? <Spinner label="Loading clients" /> : <ClientTable clients={clients} onOpen={openClient} onDelete={deleteClient} />}

      {isCreateOpen ? <NewClientDialog onDismiss={closeCreateClient} onCreated={handleCreated} /> : null}
    </section>
  );
}
