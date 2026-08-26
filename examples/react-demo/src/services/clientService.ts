import { api } from '../lib/api';
import { API_BASE_URL } from '../lib/api';
import type { Client } from '../data/clients';

/** Input accepted by the create endpoint. */
export interface CreateClientInput {
  name: string;
  industry: string;
}

/**
 * The frontend's client operations.
 *
 * An object literal whose members are functions, assigned to a module-scope
 * const — which is what makes the indexer recognise it as a service
 * structurally, rather than because its name happens to end in "Service".
 *
 * Note the deliberate split below. `list` and `create` build their URL inline
 * from a module constant, so the indexer can prove the endpoint and join it to
 * the backend route. `remove` goes through the `api` wrapper, where the base URL
 * is applied one call deeper and the path arrives as a parameter — so the
 * indexer refuses to guess and emits `UNRESOLVED_API_PATH` instead.
 *
 * Both shapes are completely ordinary in real code. Keeping one of each is the
 * point: the Inspector shows a proven path for the first and an honest gap for
 * the second.
 */
export const clientService = {
  async list(): Promise<Client[]> {
    const response = await fetch(`${API_BASE_URL}/clients`, { method: 'GET' });
    return (await response.json()) as Client[];
  },

  async create(input: CreateClientInput): Promise<Client> {
    const response = await fetch(`${API_BASE_URL}/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`POST /clients failed: ${response.status}`);
    return (await response.json()) as Client;
  },

  /** Routed through the wrapper on purpose — see the note above. */
  async remove(clientId: string): Promise<void> {
    return api.delete<void>(`/clients/${clientId}`);
  },
};
