import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GuideElement } from '@statewavedev/guide-react';
import { NewClientDialog } from '../components/NewClientDialog';
import { clients } from '../data/clients';

/**
 * The screen the guide demo revolves around.
 *
 * `clients.create` is the identifier used throughout the README, the indexer
 * fixtures and the demo panel — one string, written here once.
 *
 * Note that the hero elements carry BOTH a literal `data-guide` attribute and a
 * `<GuideElement>` wrapper, and the two do different jobs:
 *
 * - the attribute is what the **indexer** reads out of this file, because a
 *   `<GuideElement id="…">` prop is not something it can prove is a UI element
 * - the wrapper is what registers the element with the **runtime**, adding the
 *   label and description, and tracking mount and visibility
 *
 * Either alone works — the guide can resolve an attribute-only element straight
 * from the DOM, and a wrapper-only element registers fine but stays absent from
 * the Product Model. Using both is what makes the two views agree.
 */
export function Clients() {
  const [createOpen, setCreateOpen] = useState(false);

  /**
   * A named handler, not an inline arrow.
   *
   * This is the first hop of the behaviour chain the Inspector reconstructs.
   * It is also what the `state-flag-gates-element` rule needs: it calls
   * `setCreateOpen(true)`, and the same `createOpen` binding gates
   * `<NewClientDialog>` below. All three facts must be present for the indexer
   * to record `openCreateClient --opens--> NewClientDialog`.
   */
  function openCreateClient() {
    setCreateOpen(true);
  }

  function closeCreateClient() {
    setCreateOpen(false);
  }

  return (
    <main data-guide="clients" data-guide-type="section">
      <h2>Clients</h2>
      <p className="lede">Everyone your workspace is working with.</p>

      <section>
        <div className="row-actions">
          <GuideElement
            id="clients.create"
            type="button"
            label="New Client"
            description="Opens the form for creating a new client in this workspace."
          >
            <button className="primary" data-guide="clients.create" onClick={openCreateClient}>
              New Client
            </button>
          </GuideElement>
          <button data-guide="clients.export">Export</button>
        </div>

        <GuideElement
          id="clients.table"
          type="table"
          label="Client list"
          description="Every client in the workspace, with owner and status."
        >
          <table data-guide="clients.table" data-guide-label="Client list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Industry</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link to={`/clients/${client.id}`}>{client.name}</Link>
                  </td>
                  <td>{client.industry}</td>
                  <td>{client.status}</td>
                  <td>{client.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GuideElement>
      </section>

      <NewClientDialog open={createOpen} onClose={closeCreateClient} />
    </main>
  );
}
