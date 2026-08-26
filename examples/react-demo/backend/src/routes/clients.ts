import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { createClient, deleteClient, listClients } from '../controllers/clientController';
import { requirePermission } from '../middleware/requirePermission';

// Annotated explicitly: pnpm's non-flat node_modules means the inferred type
// cannot be named portably, and `declaration` emit would fail on it.
export const clientsRouter: ExpressRouter = Router();

clientsRouter.get('/clients', requirePermission('clients:read'), listClients);
clientsRouter.post('/clients', requirePermission('clients:create'), createClient);
clientsRouter.delete('/clients/:clientId', requirePermission('clients:delete'), deleteClient);
