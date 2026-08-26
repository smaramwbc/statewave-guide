/**
 * The v0 API.
 *
 * Registers `/clients` — the same string as the real client list. It must not
 * merge into `api:GET:/clients`, because the mount point this router hangs off
 * is not knowable at analysis time.
 */
import { Router } from 'express';
import { listLegacyClients } from '../controllers/legacyController';
import { requirePermission } from '../middleware/requirePermission';

/** The v0 permission scope, chosen per deployment. Not a source fact. */
const scope = process.env.LEGACY_SCOPE ?? 'clients';

export const legacyRouter = Router();

legacyRouter.get('/clients', requirePermission('clients:read'), listLegacyClients);
legacyRouter.get('/clients/:clientId', requirePermission(`${scope}:read`), listLegacyClients);
