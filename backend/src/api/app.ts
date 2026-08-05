import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { requestId } from './middleware/requestId';
import { ensureMongoConnected } from './middleware/ensureMongo';
import { resolveIdentity } from './middleware/identity';
import { csrfProtection } from './middleware/csrf';
import { getAuthHandler, AUTH_BASE_PATH } from '../lib/auth';
import { healthRouter } from './routes/health';
import { identityRouter } from './routes/identity';
import { uploadsRouter } from './routes/uploads';
import { documentsRouter } from './routes/documents';
import { renderRouter } from './routes/render';
import { summariesRouter } from './routes/summaries';
import { jobsRouter } from './routes/jobs';
import { solveRouter } from './routes/solve';
import { libraryRouter } from './routes/library';
import { usageRouter } from './routes/usage';
import { adminRouter } from './routes/admin';

export function createApp(): Express {
  const app = express();

  // Required for req.ip (per-IP rate limiting, api/middleware/rateLimit.ts)
  // and Auth.js (lib/auth.ts's trustHost) to see the real client address
  // through a deploy-time reverse proxy/load balancer, rather than the
  // proxy's own address for every request. Assumes the backend is always
  // deployed behind a proxy that itself sets X-Forwarded-For correctly and
  // strips/overwrites any client-supplied one — true of every realistic
  // deployment target here (Vercel/Render/Fly/nginx), never exposed raw to
  // the internet.
  app.set('trust proxy', true);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).id,
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use('/health', healthRouter);
  app.use('/api', ensureMongoConnected);

  // ExpressAuth is built lazily (lib/auth.ts) — the ESM interop + adapter
  // construction happens once, on first request, not at app construction.
  // Mounted before resolveIdentity/csrfProtection so its own routes
  // (session, signin, callback, csrf, ...) skip both — Auth.js manages its
  // own session lookup and CSRF token internally.
  app.use(AUTH_BASE_PATH, async (req: Request, res: Response, next: NextFunction) => {
    const handler = await getAuthHandler();
    handler(req, res, next);
  });

  app.use('/api', resolveIdentity);
  app.use('/api', csrfProtection);

  app.use('/api/identity', identityRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/render', renderRouter);
  app.use('/api/summaries', summariesRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/solve', solveRouter);
  app.use('/api/library', libraryRouter);
  app.use('/api/usage', usageRouter);
  app.use('/api/admin', adminRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
