/**
 * Client HTTP handlers.
 *
 * Each one validates, delegates to the service and shapes the response. The
 * controller is where `validates_with` lives for the client endpoints; the
 * invoice endpoints validate in route middleware instead, so both placements
 * are represented.
 */
import type { NextFunction, Request, Response } from 'express';
import { clientService } from '../services/clientService';
import {
  clientIdParamSchema,
  clientListQuerySchema,
  createClientSchema,
  updateClientSchema,
} from '../validation/clientSchemas';

/** `GET /clients`. */
export async function listClients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = clientListQuerySchema.parse(req.query);
    const page = await clientService.list(query);
    res.json(page);
  } catch (cause) {
    next(cause);
  }
}

/** `POST /clients` — the backend end of the flagship flow. */
export async function createClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createClientSchema.parse(req.body);
    const created = await clientService.create(input);
    res.status(201).json(created);
  } catch (cause) {
    next(cause);
  }
}

/** `GET /clients/:clientId`. */
export async function getClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId } = clientIdParamSchema.parse(req.params);
    const client = await clientService.get(clientId);
    if (client === null) {
      res.status(404).json({ message: 'No such client' });
      return;
    }
    res.json(client);
  } catch (cause) {
    next(cause);
  }
}

/** `PUT /clients/:clientId`. */
export async function updateClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId } = clientIdParamSchema.parse(req.params);
    const input = updateClientSchema.parse(req.body);
    const updated = await clientService.update(clientId, input);
    if (updated === null) {
      res.status(404).json({ message: 'No such client' });
      return;
    }
    res.json(updated);
  } catch (cause) {
    next(cause);
  }
}

/** `DELETE /clients/:clientId`. */
export async function deleteClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId } = clientIdParamSchema.parse(req.params);
    await clientService.remove(clientId);
    res.status(204).end();
  } catch (cause) {
    next(cause);
  }
}

/** `GET /clients/:clientId/audit`. */
export async function auditClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { clientId } = clientIdParamSchema.parse(req.params);
    res.json(await clientService.auditTrail(clientId));
  } catch (cause) {
    next(cause);
  }
}
