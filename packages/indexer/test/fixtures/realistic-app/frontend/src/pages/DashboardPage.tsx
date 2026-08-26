/**
 * The landing page.
 *
 * It loads the client count through `useClients`, navigates to the three main
 * destinations, and carries a handful of things that look like relationships
 * and are not — a stale string key, an endpoint written in prose, an object
 * whose members are strings, a callable-looking type. They are here because
 * this is where they accumulate in a real dashboard, not because the file is a
 * collection.
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateClientButton } from '../components/CreateClientButton';
import { Toolbar } from '../components/Toolbar';
import { ToolbarButton } from '../components/ToolbarButton';
import { PermissionGate } from '../permissions/PermissionGate';
import { Permissions } from '../permissions/permissions';
import { useClients } from '../hooks/useClients';
import { pluralise } from '../lib/format';
import { API_DOCS_HINT } from '../lib/constants';

/**
 * The key the primary toolbar action is looked up under.
 *
 * It spells `openCreateClient`, which is a real function — declared in
 * `ClientsPage`, not here, and not imported. A rename moved the handler and
 * missed the key, so the lookup below misses and the `??` fallback carries it.
 * An indexer that matches string *contents* against declarations in other
 * modules resolves this to the wrong module's function.
 */
const label = 'openCreateClient';

/** An endpoint written in prose. Documentation, not a call. */
const docs = 'POST /clients creates one';

/** An object whose `create` member is a string. Not callable, not a service. */
const clients = { create: 'not a function', list: 'nor this one' };

/** A callable-looking type. Types are not functions. */
type CreateClient = () => void;

/** The dashboard. */
export default function DashboardPage() {
  const navigate = useNavigate();
  const { total } = useClients();

  /** A literal destination inside a `useCallback` body. */
  const goToClients = useCallback(() => {
    navigate('/clients');
  }, [navigate]);

  /** The same, without the memo wrapper. */
  const goToInvoices = (): void => {
    navigate('/invoices');
  };

  /** Navigates to the list and asks it to open its dialog. */
  const startClientCreation = (): void => {
    navigate('/clients', { state: { openCreate: true } });
  };

  /**
   * Handlers this page can address by name.
   *
   * `handlers[label]` is a computed member read whose key resolves to no member
   * of this object, so the value at the call site is the fallback. There is no
   * single function this prop names, and guessing one attributes a user action
   * to a handler that never runs.
   */
  const handlers: Record<string, (() => void) | undefined> = {
    startClientCreation,
    goToClients,
    goToInvoices,
  };

  const noop: CreateClient = () => undefined;
  noop();

  return (
    <section className="page" data-guide="dashboard">
      <h1>Overview</h1>
      <p className="kpi" data-guide="dashboard.client-count">
        {pluralise(total, 'client')}
      </p>
      <Toolbar>
        <PermissionGate permission={Permissions.ClientCreate}>
          <ToolbarButton
            data-guide="dashboard.new-client"
            label="New client"
            action={handlers[label] ?? startClientCreation}
          />
        </PermissionGate>
        <ToolbarButton data-guide="dashboard.view-clients" label="All clients" action={goToClients} />
        <ToolbarButton data-guide="dashboard.view-invoices" label="Invoices" action={goToInvoices} />
      </Toolbar>
      {/* An invalid semantic id: capitals are not allowed by the convention. */}
      <p data-guide="Dashboard.Docs" className="hint">
        {API_DOCS_HINT}
      </p>
      <p data-guide="dashboard.hint" className="hint" title={label}>
        {docs} — {clients.create}
      </p>
      <CreateClientButton />
    </section>
  );
}
