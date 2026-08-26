/**
 * Everything the UI can do to a client.
 *
 * Shape matters here: one exported const holding an object literal whose
 * members are async methods. That is the `object-literal-service` shape, and it
 * is what makes `clientService.create` addressable as
 * `function:frontend/src/services/clientService.ts#clientService.create`.
 */
import { api, unwrap } from '../lib/http';
import { API_BASE_URL } from '../lib/http';
import { callEndpoint, endpoints } from '../lib/endpoints';
import type { AuditEntry, Client, ClientDraft, ClientListQuery, Paginated } from '../types/client';

/**
 * The collection path, relative to the client's `baseURL`.
 *
 * Written once as a module-scope constant so that the `module-constant-string`
 * rule has something to resolve. `/api` is deliberately absent: the axios
 * instance adds it.
 */
const CLIENTS_PATH = '/clients';

/** A write verb. Which one is a caller's decision, not this module's. */
export type HttpWriteMethod = 'post' | 'put' | 'patch';

export const clientService = {
  /** `GET /clients` — one page of clients, newest first. */
  async list(query: ClientListQuery = {}): Promise<Paginated<Client>> {
    return unwrap(api.get<Paginated<Client>>(CLIENTS_PATH, { params: query }));
  },

  /** `GET /clients/:clientId` — a template path with one variable segment. */
  async get(clientId: string): Promise<Client> {
    return unwrap(api.get<Client>(`/clients/${clientId}`));
  },

  /**
   * `POST /clients` — the flagship write.
   *
   * @example
   * ```ts
   * const client = await clientService.create({ name: 'Acme', email: 'ops@acme.test', plan: 'team' });
   * ```
   */
  async create(draft: ClientDraft): Promise<Client> {
    return unwrap(api.post<Client>(CLIENTS_PATH, draft));
  },

  /** `PUT /clients/:clientId` — the constant and the variable segment combined. */
  async update(clientId: string, patch: Partial<ClientDraft>): Promise<Client> {
    return unwrap(api.put<Client>(`${CLIENTS_PATH}/${clientId}`, patch));
  },

  /**
   * `DELETE /clients/:clientId`.
   *
   * The interpolated expression is called `id` here and the route calls the
   * segment `:clientId`. Nothing at runtime depends on the two agreeing, so
   * whether the sides join is a decision about what names a path parameter.
   */
  async remove(id: string): Promise<void> {
    await api.delete<void>(`/clients/${id}`);
  },

  /**
   * `POST /clients`, described rather than called.
   *
   * The method and the path are properties of an object in `lib/endpoints.ts`
   * and the request is issued there too, so nothing at this call site names
   * either one. Used by the retry path in `ClientForm`.
   */
  async createFromSpec(draft: ClientDraft): Promise<Client> {
    return callEndpoint<Client>(endpoints.createClient, draft);
  },

  /**
   * Write a partial client with a caller-chosen verb.
   *
   * Adversarial on purpose, and on a live path: `ClientDetailPage` reaches this
   * from a button. The method arrives as an argument, so it is not a fact this
   * module holds at all — it is not a two-armed ternary that could be folded,
   * and `'patch'` is one of the values callers pass, which no route serves. The
   * path is knowable, the method is not, and an endpoint is a (method, path)
   * pair, so there is nothing here an honest indexer can record.
   */
  async save(patch: Partial<ClientDraft>, clientId: string, method: HttpWriteMethod): Promise<Client> {
    const path = `${CLIENTS_PATH}/${clientId}`;
    return unwrap(api[method]<Client>(path, patch));
  },

  /**
   * The audit trail is streamed, so it bypasses the axios client and has to
   * spell the base URL out itself.
   */
  async auditTrail(clientId: string): Promise<AuditEntry[]> {
    const response = await fetch(`${API_BASE_URL}${CLIENTS_PATH}/${clientId}/audit`);
    if (!response.ok) throw new Error(`Audit trail unavailable (${response.status})`);
    return (await response.json()) as AuditEntry[];
  },
};

/** The service's own type, so consumers can accept a stub in tests. */
export type ClientService = typeof clientService;
