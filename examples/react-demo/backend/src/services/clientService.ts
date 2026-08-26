import type { CreateClientInput } from '../validation/clientSchemas';

export interface Client {
  id: string;
  name: string;
  industry: string;
}

const clients: Client[] = [];
let nextId = 1;

/**
 * The backend's client operations.
 *
 * Deliberately the same member names as the frontend service. The indexer must
 * NOT join them on that resemblance — the two are connected through the endpoint
 * node they share, and nothing else.
 */
export const clientService = {
  list(): Client[] {
    return clients;
  },

  create(input: CreateClientInput): Client {
    const client: Client = { id: String(nextId++), ...input };
    clients.push(client);
    return client;
  },

  remove(clientId: string): boolean {
    const index = clients.findIndex((client) => client.id === clientId);
    if (index === -1) return false;
    clients.splice(index, 1);
    return true;
  },
};
