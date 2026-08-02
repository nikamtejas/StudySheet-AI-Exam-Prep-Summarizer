import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Express 4 doesn't forward a rejected promise from an async handler to the
// error middleware on its own — an uncaught throw in one would just hang the
// request. Every async route handler goes through this.
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
