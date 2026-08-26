/** The last middleware in the stack. */
import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from './requirePermission';
import { ValidationError } from './validate';

/** Turns a thrown error into a response. */
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ForbiddenError) {
    res.status(403).json({ message: error.message, permission: error.permission });
    return;
  }
  if (error instanceof ValidationError) {
    res.status(422).json({ message: error.message, issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unexpected failure';
  res.status(500).json({ message });
}

/** Logs one line per request. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    // eslint-disable-next-line no-console
    console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
}
