import puppeteer, { type Browser } from 'puppeteer';
import { env } from '../config/env';

// Cold-starting Chromium takes ~8s on this machine — measured directly,
// nowhere near the < 3s render budget (docs/studysheet-milestones.md M6).
// A pool of already-launched browsers is what makes the budget achievable:
// a warm render (navigate + wait + pdf()) measured at 130-450ms end to end.
let pool: Browser[] = [];
let poolReady: Promise<void> | null = null;
let nextIndex = 0;

async function ensurePool(): Promise<void> {
  if (!poolReady) {
    poolReady = (async () => {
      const browsers = await Promise.all(
        Array.from({ length: env.PUPPETEER_POOL_SIZE }, () => puppeteer.launch({ headless: true })),
      );
      pool = browsers;
    })();
  }
  return poolReady;
}

// A Puppeteer Browser can host many concurrent Pages (each isolated) — the
// pool exists to keep N Chromium *processes* warm and spread load/crash
// blast-radius across them, not because a single browser can't serve
// concurrent renders. Round-robin checkout, one fresh Page per render,
// always closed by the caller when done.
export async function getWarmBrowser(): Promise<Browser> {
  await ensurePool();
  const browser = pool[nextIndex % pool.length];
  nextIndex += 1;
  if (!browser) throw new Error('Puppeteer pool is empty');
  return browser;
}

export async function closePuppeteerPool(): Promise<void> {
  await Promise.all(pool.map((browser) => browser.close()));
  pool = [];
  poolReady = null;
  nextIndex = 0;
}
