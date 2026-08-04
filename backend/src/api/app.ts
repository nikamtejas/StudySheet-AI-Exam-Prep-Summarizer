import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { requestId } from './middleware/requestId';
import { healthRouter } from './routes/health';
import { uploadsRouter } from './routes/uploads';
import { documentsRouter } from './routes/documents';
import { renderRouter } from './routes/render';
import { summariesRouter } from './routes/summaries';

export function createApp(): Express {
  const app = express();

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

  app.use('/health', healthRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/render', renderRouter);
  app.use('/api/summaries', summariesRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
