/**
 * The v0 API, kept alive for one customer.
 *
 * Reachable only through a mount point read from the environment, so nothing in
 * this file has a knowable path.
 */
import type { Request, Response } from 'express';
import { clientService } from '../services/clientService';

/** The v0 shape of the client list. */
export async function listLegacyClients(_req: Request, res: Response): Promise<void> {
  const page = await clientService.list({ page: 1, pageSize: 100 });
  res.json(page.items.map((client) => ({ id: client.id, title: client.name })));
}
