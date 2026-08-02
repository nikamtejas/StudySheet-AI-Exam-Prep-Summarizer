import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Prevent a developer's local .env from leaking into these tests — env.ts
// must behave the same in CI (no .env file) as it does locally.
vi.mock('dotenv/config', () => ({}));

const REQUIRED_ENV: Record<string, string> = {
  FRONTEND_URL: 'http://localhost:3000',
  CORS_ORIGIN: 'http://localhost:3000',
  MONGODB_URI: 'mongodb://localhost:27017/studysheet-test',
  REDIS_URL: 'redis://localhost:6379',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET: 'test-bucket',
  AUTH_SECRET: 'test-auth-secret',
  RENDER_TOKEN_SECRET: 'test-render-secret',
  COOKIE_DOMAIN: 'localhost',
};

const originalEnv = { ...process.env };

describe('env', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    for (const key of Object.keys(REQUIRED_ENV)) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads successfully and applies defaults when every required var is present', async () => {
    Object.assign(process.env, REQUIRED_ENV);

    const { env } = await import('../src/config/env');

    expect(env.MONGODB_URI).toBe(REQUIRED_ENV.MONGODB_URI);
    expect(env.PORT).toBe(4000);
    expect(env.SOLVE_VERIFICATION).toBe('on');
  });

  it('refuses to start and names the missing variable, instead of crashing at runtime', async () => {
    Object.assign(process.env, REQUIRED_ENV);
    delete process.env.MONGODB_URI;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(import('../src/config/env')).rejects.toThrow('process.exit(1)');

    const message = errorSpy.mock.calls[0]?.[0] as string;
    expect(message).toContain('MONGODB_URI');

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
