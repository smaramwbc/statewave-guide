import type { Request, Response } from 'express';
import { clientService } from '../services/clientService';
import { createClientSchema } from '../validation/clientSchemas';

/** `GET /api/clients` */
export function listClients(_req: Request, res: Response): void {
  res.json(clientService.list());
}

/** `POST /api/clients` — the far end of the demo's flagship path. */
export function createClient(req: Request, res: Response): void {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_input', issues: parsed.error.issues });
    return;
  }
  res.status(201).json(clientService.create(parsed.data));
}

/** `DELETE /api/clients/:clientId` */
export function deleteClient(req: Request, res: Response): void {
  // Express 5 types a route param as `string | string[]`; a single-segment
  // pattern only ever yields the former, but the type has to be narrowed.
  const clientId = req.params.clientId;
  const removed = clientService.remove(typeof clientId === 'string' ? clientId : '');
  res.status(removed ? 204 : 404).end();
}
