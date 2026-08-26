/**
 * Settings routes. Mounted at `API_PREFIX`.
 *
 * Three registration shapes the client router does not have, and each one
 * breaks a different assumption:
 *
 *   - a route registered *before* the router-level guard, so it is public;
 *   - a router-level `use` that guards every registration after it, so
 *     `GET /settings` carries a permission its own line never names;
 *   - a handler wrapped in `asyncHandler(...)`, so the last argument of the
 *     registration is a call rather than an identifier.
 */
import { Router } from 'express';
import { getSettings, getSettingsSchema, updateSettings } from '../controllers/settingsController';
import { asyncHandler } from '../middleware/asyncHandler';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { updateSettingsSchema } from '../validation/settingsSchemas';

export const settingsRouter = Router();

// Registered before the guard below, so it is deliberately public: the settings
// form needs the field vocabulary before anyone has signed in. Not every
// endpoint in a real application has a permission.
settingsRouter.get('/settings/schema', getSettingsSchema);

// Applies to every registration *after* it. Order is the whole fact here.
settingsRouter.use(requirePermission('settings:read'));

settingsRouter.get('/settings', getSettings);
settingsRouter.put('/settings', requirePermission('settings:update'), validate(updateSettingsSchema), asyncHandler(updateSettings));
