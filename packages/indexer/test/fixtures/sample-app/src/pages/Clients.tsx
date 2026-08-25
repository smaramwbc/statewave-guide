import { ClientDialog } from '../components/ClientDialog';
import type { Client } from '../types/client';

export interface ClientsProps {
  clients: Client[];
}

export function Clients({ clients }: ClientsProps) {
  return (
    <section data-guide="clients" aria-label="Clients">
      <header>
        <h1>Clients</h1>
        <button data-guide="clients.create">New Client</button>
      </header>
      <table data-guide="clients.table" data-guide-label="Client list">
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>{client.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ClientDialog data-guide="clients.dialog" data-guide-type="dialog" />
    </section>
  );
}
