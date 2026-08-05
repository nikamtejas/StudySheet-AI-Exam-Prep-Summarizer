import type { Request, Response, NextFunction } from 'express';

// req.identity.isAdmin is only ever true for a signed-in User document with
// isAdmin: true set directly in the database — there's no self-service way
// to become an admin (no route sets this field), matching the M8 scope: an
// internal operator view, not a customer-facing role.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.identity.type !== 'user' || !req.identity.isAdmin) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  next();
}
