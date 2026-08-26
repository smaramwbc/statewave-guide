/**
 * Client routes.
 *
 * Mounted at `API_PREFIX` (`/api`) in `server.ts`, so the paths written here
 * are the same strings the frontend services write. `POST /clients` is the
 * flagship: one literal path, one permission literal, one handler identifier.
 */
import { Router } from 'express';
import {
  auditClient,
  createClient,
  deleteClient,
  getClient,
  listClients,
  updateClient,
} from '../controllers/clientController';
import { requirePermission } from '../middleware/requirePermission';

/** The item path, written once and reused by three registrations. */
const CLIENT_BY_ID = '/clients/:clientId';

const router = Router();

router.get('/clients', requirePermission('clients:read'), listClients);
router.post('/clients', requirePermission('clients:create'), createClient);
router.get(CLIENT_BY_ID, requirePermission('clients:read'), getClient);
router.put(CLIENT_BY_ID, requirePermission('clients:update'), updateClient);
router.delete(CLIENT_BY_ID, requirePermission('clients:delete'), deleteClient);
router.get('/clients/:clientId/audit', requirePermission('clients:read'), auditClient);

export { router as clientsRouter };
