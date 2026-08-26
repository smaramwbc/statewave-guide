/**
 * Client persistence.
 *
 * Shares its name and every member name with the frontend service. The two are
 * different nodes because node ids carry the file path — if they collapse into
 * one, a UI call and a database write become indistinguishable.
 */
import { randomUUID } from 'node:crypto';
import { query, queryOne } from '../lib/db';
import type { AuditRecord, ClientDto, ClientRecord, Page } from '../types/client';
import type { ClientListQuery, CreateClientInput, UpdateClientInput } from '../validation/clientSchemas';

/** Maps a database row to the API shape. */
function toDto(record: ClientRecord): ClientDto {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    plan: record.plan,
    status: record.status,
    createdAt: record.created_at,
  };
}

export const clientService = {
  /** One page of clients. */
  async list(input: ClientListQuery): Promise<Page<ClientDto>> {
    const offset = (input.page - 1) * input.pageSize;
    const rows = await query<ClientRecord>(
      'select * from clients where ($1 is null or name ilike $1) order by created_at desc limit $2 offset $3',
      [input.search ?? null, input.pageSize, offset],
    );
    return { items: rows.map(toDto), total: rows.length, page: input.page, pageSize: input.pageSize };
  },

  /** One client, or `null`. */
  async get(clientId: string): Promise<ClientDto | null> {
    const row = await queryOne<ClientRecord>('select * from clients where id = $1', [clientId]);
    return row === null ? null : toDto(row);
  },

  /** Inserts a client. The other half of the flagship flow. */
  async create(input: CreateClientInput): Promise<ClientDto> {
    const id = `cli_${randomUUID()}`;
    const rows = await query<ClientRecord>(
      'insert into clients (id, name, email, plan, status) values ($1, $2, $3, $4, $5) returning *',
      [id, input.name, input.email, input.plan, 'trial'],
    );
    await recordAudit(id, 'client.created');
    return toDto(rows[0]!);
  },

  /** Applies a partial update. */
  async update(clientId: string, input: UpdateClientInput): Promise<ClientDto | null> {
    const rows = await query<ClientRecord>(
      'update clients set name = coalesce($2, name), email = coalesce($3, email) where id = $1 returning *',
      [clientId, input.name ?? null, input.email ?? null],
    );
    if (rows.length === 0) return null;
    await recordAudit(clientId, 'client.updated');
    return toDto(rows[0]!);
  },

  /** Deletes a client and everything hanging off it. */
  async remove(clientId: string): Promise<void> {
    await query('delete from invoices where client_id = $1', [clientId]);
    await query('delete from clients where id = $1', [clientId]);
    await recordAudit(clientId, 'client.deleted');
  },

  /** The audit trail for one client. */
  async auditTrail(clientId: string): Promise<AuditRecord[]> {
    return query<AuditRecord>('select at, actor, action from audit where subject = $1 order by at desc', [clientId]);
  },
};

/** Appends an audit row. Module-private, called by several members above. */
async function recordAudit(subject: string, action: string): Promise<void> {
  await query('insert into audit (subject, action) values ($1, $2)', [subject, action]);
}
