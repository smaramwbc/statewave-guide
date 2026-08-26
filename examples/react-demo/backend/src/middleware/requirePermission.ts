import type { NextFunction, Request, Response } from 'express';

/**
 * Gates a route behind a permission.
 *
 * The indexer recognises this by name, because `requirePermission` is in the
 * configured permission recogniser list — not because the string argument looks
 * like a permission. An arbitrary function receiving `'clients:create'` produces
 * nothing.
 */
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const granted = (req.header('x-permissions') ?? '').split(',');
    if (!granted.includes(permission)) {
      res.status(403).json({ error: 'permission_denied', permission });
      return;
    }
    next();
  };
}
