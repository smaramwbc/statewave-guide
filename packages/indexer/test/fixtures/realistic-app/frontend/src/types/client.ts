/** The client domain, as the frontend sees it. */

/** Billing tier. */
export type PlanTier = 'free' | 'team' | 'enterprise';

/** Lifecycle state shown as a badge in the table. */
export type ClientStatus = 'active' | 'trial' | 'churned';

/** A client as returned by `GET /clients`. */
export interface Client {
  id: string;
  name: string;
  email: string;
  plan: PlanTier;
  status: ClientStatus;
  createdAt: string;
}

/** The fields a user can supply when creating or editing a client. */
export interface ClientDraft {
  name: string;
  email: string;
  plan: PlanTier;
}

/** Query accepted by the list endpoint. */
export interface ClientListQuery {
  search?: string;
  status?: ClientStatus;
  page?: number;
  pageSize?: number;
}

/** One page of anything. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** One row of the audit trail. */
export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
}

/**
 * A trap: this is a *type* whose name matches a controller and whose shape
 * matches a service member. It is not callable and must never appear as a
 * `function:` node.
 */
export type CreateClient = (draft: ClientDraft) => Promise<Client>;
