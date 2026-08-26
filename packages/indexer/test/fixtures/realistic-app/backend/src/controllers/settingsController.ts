/** Settings HTTP handlers. */
import type { NextFunction, Request, Response } from 'express';
import { settingsStore } from '../services/settingsStore';
import { updateSettingsSchema } from '../validation/settingsSchemas';

/** `GET /settings`. */
export async function getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await settingsStore.load());
  } catch (cause) {
    next(cause);
  }
}

/** `GET /settings/schema` — public, so it takes no session. */
export async function getSettingsSchema(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ fields: settingsStore.describe() });
  } catch (cause) {
    next(cause);
  }
}

/** `PUT /settings`. */
export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateSettingsSchema.parse(req.body);
    res.json(await settingsStore.save(input));
  } catch (cause) {
    next(cause);
  }
}
