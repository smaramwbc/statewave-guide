/** Body validation as route middleware. */
import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';

/** Raised when a body fails its schema. */
export class ValidationError extends Error {
  constructor(readonly issues: unknown) {
    super('The request body is invalid');
    this.name = 'ValidationError';
  }
}

/**
 * Replaces `req.body` with the parsed value, or forwards a
 * {@link ValidationError}.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return function validateBody(req: Request, _res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.body = result.data;
    next();
  };
}
