/**
 * The client list.
 *
 * Two things here are deliberately hard. The row handlers are props, wrapped in
 * arrows, so the function they eventually reach lives in another module. And
 * every row shares one `data-guide`, because a semantic id names a *kind* of
 * element, not an instance.
 */
import { Button } from './primitives/Button';
import { formatDate } from '../lib/format';
import { hasPermission } from '../permissions/permissions';
import { useSession } from '../permissions/SessionContext';
import type { Client } from '../types/client';

/** Props of {@link ClientTable}. */
export interface ClientTableProps {
  clients: Client[];
  onOpen: (client: Client) => void;
  onDelete: (client: Client) => void;
}

/** The client list. */
export function ClientTable({ clients, onOpen, onDelete }: ClientTableProps) {
  const session = useSession();

  // The function half of the permission story: no subtree to gate, so the
  // check is a plain call with a literal argument.
  if (!hasPermission(session, 'clients:read')) {
    return (
      <p className="empty" data-guide="clients.table.forbidden">
        You do not have access to the client list.
      </p>
    );
  }

  return (
    <table className="table" data-guide="clients.table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
          <th scope="col">Plan</th>
          <th scope="col">Since</th>
          <th scope="col">
            <span className="visually-hidden">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {clients.map((client) => (
          <tr key={client.id} data-guide="clients.table.row" onClick={() => onOpen(client)}>
            <td>{client.name}</td>
            <td>{client.email}</td>
            <td>{client.plan}</td>
            <td>{formatDate(client.createdAt)}</td>
            <td>
              <Button
                data-guide="clients.table.delete"
                variant="danger"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(client);
                }}
              >
                Delete
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
