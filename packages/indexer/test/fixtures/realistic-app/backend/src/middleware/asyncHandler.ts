/**
 * Wraps an async handler so a rejected promise reaches `next` instead of
 * hanging the request.
 *
 * Near-universal in real Express code, and a real obstacle for a router
 * extractor: the last argument of a registration that uses it is a *call*, not
 * a handler identifier, so `router-handler-identifier` has to look one level
 * in before it finds a name.
 */
import type { NextFunction, Request, Response } from 'express';

/** An Express handler that may reject. */
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Forwards a rejection to the error middleware. */
export function asyncHandler(handler: AsyncRouteHandler) {
  return function wrappedHandler(req: Request, res: Response, next: NextFunction): void {
    void handler(req, res, next).catch(next);
  };
}
