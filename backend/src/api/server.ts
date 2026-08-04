import { createApp } from './app';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { closePuppeteerPool } from '../lib/puppeteerPool';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API listening');
});

// Puppeteer's warm pool (M6) is the one thing here that leaks real OS
// processes if not closed explicitly — Chromium doesn't reliably die with
// its parent on every platform/signal. Mongo/Redis connections don't need
// this: the OS reclaims those sockets on process exit with nothing left
// running.
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await closePuppeteerPool();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
