import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/mongo', () => ({ checkMongo: vi.fn() }));
vi.mock('../src/lib/redis', () => ({ checkRedis: vi.fn() }));
vi.mock('../src/lib/storage', () => ({ checkStorage: vi.fn() }));

import { checkMongo } from '../src/lib/mongo';
import { checkRedis } from '../src/lib/redis';
import { checkStorage } from '../src/lib/storage';
import { getHealthStatus } from '../src/lib/health';

const ok = { ok: true as const, latencyMs: 1 };
const down = { ok: false as const, latencyMs: 1, error: 'connection refused' };

describe('getHealthStatus', () => {
  it('reports ok when every dependency is reachable', async () => {
    vi.mocked(checkMongo).mockResolvedValue(ok);
    vi.mocked(checkRedis).mockResolvedValue(ok);
    vi.mocked(checkStorage).mockResolvedValue(ok);

    const status = await getHealthStatus('api');

    expect(status.ok).toBe(true);
    expect(status.service).toBe('api');
    expect(status.checks.mongo.ok).toBe(true);
  });

  it('reports not-ok and names the failing dependency when one is down', async () => {
    vi.mocked(checkMongo).mockResolvedValue(ok);
    vi.mocked(checkRedis).mockResolvedValue(down);
    vi.mocked(checkStorage).mockResolvedValue(ok);

    const status = await getHealthStatus('worker');

    expect(status.ok).toBe(false);
    expect(status.checks.redis.ok).toBe(false);
    expect(status.checks.redis.error).toBe('connection refused');
  });
});
