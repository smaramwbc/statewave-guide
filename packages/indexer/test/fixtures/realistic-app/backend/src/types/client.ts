/** The client domain, as the database stores it. */

/** Billing tier. */
export type PlanTier = 'free' | 'team' | 'enterprise';

/** A row of the `clients` table. */
export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  plan: PlanTier;
  status: 'active' | 'trial' | 'churned';
  created_at: string;
}

/** A client as the API returns it. */
export interface ClientDto {
  id: string;
  name: string;
  email: string;
  plan: PlanTier;
  status: 'active' | 'trial' | 'churned';
  createdAt: string;
}

/** One page of anything. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** One entry of the audit trail. */
export interface AuditRecord {
  at: string;
  actor: string;
  action: string;
}
