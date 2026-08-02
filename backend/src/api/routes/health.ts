import { Router } from 'express';
import { getHealthStatus } from '../../lib/health';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const status = await getHealthStatus('api');
  res.status(status.ok ? 200 : 503).json(status);
});
