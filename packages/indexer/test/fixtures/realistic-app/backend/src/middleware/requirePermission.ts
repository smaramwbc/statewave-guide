/**
 * The permission guard.
 *
 * Every route that needs a permission names it as a literal argument to this
 * factory, which is what a permission recogniser keys on. The middleware it
 * returns is named so that stack traces are readable.
 */
import type { NextFunction, Request, Response } from 'express';

/** A request that has been through authentication. */
export interface AuthenticatedRequest extends Request {
  session?: {
    userId: string;
    permissions: string[];
  };
}

/** Raised when the session is missing a permission. */
export class ForbiddenError extends Error {
  constructor(readonly permission: string) {
    super(`Missing permission ${permission}`);
    this.name = 'ForbiddenError';
  }
}

/** Builds a middleware that rejects requests without `permission`. */
export function requirePermission(permission: string) {
  return function permissionGuard(req: Request, _res: Response, next: NextFunction): void {
    const granted = (req as AuthenticatedRequest).session?.permissions ?? [];
    if (!granted.includes(permission)) {
      next(new ForbiddenError(permission));
      return;
    }
    next();
  };
}

/** Builds a middleware that requires every one of `permissions`. */
export function requireEveryPermission(permissions: string[]) {
  return function everyPermissionGuard(req: Request, res: Response, next: NextFunction): void {
    const missing = permissions.find((permission) => {
      const granted = (req as AuthenticatedRequest).session?.permissions ?? [];
      return !granted.includes(permission);
    });
    if (missing !== undefined) {
      next(new ForbiddenError(missing));
      return;
    }
    void res;
    next();
  };
}
