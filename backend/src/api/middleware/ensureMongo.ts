import type { Request, Response, NextFunction } from 'express';
import { getMongoConnection } from '../../lib/mongo';

// Mongoose models buffer commands against whatever connection
// mongoose.connect() eventually produces — but nothing calls that until
// something does. CLI entry points and tests always await
// getMongoConnection() explicitly before touching a model; the live API
// process never did, so it only worked by accident, whenever some earlier
// request happened to hit GET /health first and warmed the shared
// connection as a side effect. The first real request to land on a cold
// server that wasn't /health would sit in Mongoose's command buffer for its
// full 10s timeout and then 500. Awaiting the (cached, near-instant once
// connected) connection promise here guarantees every /api/* route has it
// before running, without changing /health's own already-correct behavior
// of tolerating Mongo being down (that route is mounted before this
// middleware and calls getMongoConnection() itself via checkMongo()).
export async function ensureMongoConnected(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await getMongoConnection();
    next();
  } catch (err) {
    req.log?.error({ err }, 'mongo unavailable');
    res.status(503).json({ error: 'database_unavailable' });
  }
}
