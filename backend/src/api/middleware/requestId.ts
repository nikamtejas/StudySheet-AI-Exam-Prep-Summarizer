import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}
