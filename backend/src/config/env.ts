import 'dotenv/config';
import { z } from 'zod';

// Vars with no sensible default must be set explicitly (docs/studysheet-build-prompt.md §14).
// ANTHROPIC_API_KEY and the billing keys are exceptions: nothing in M0 calls them, so they're
// optional until the milestone that wires them up (M2 for Anthropic, M10 for billing) makes
// them load-bearing. Everything else the api/worker touch at boot (Mongo, Redis, storage,
// auth/render secrets) is required now.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4100),

  FRONTEND_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),

  MONGODB_URI: z.string().min(1, 'required — see docker-compose.yml for the local Mongo URI'),
  REDIS_URL: z.string().min(1, 'required — see docker-compose.yml for the local Redis URL'),

  // S3-compatible storage. In local dev this points at the MinIO container instead of
  // real Cloudflare R2 — set S3_ENDPOINT to override the derived R2 endpoint.
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  AUTH_SECRET: z.string().min(1),
  RENDER_TOKEN_SECRET: z.string().min(1),
  COOKIE_DOMAIN: z.string().min(1),

  // Not required until M2 wires up real Claude calls.
  ANTHROPIC_API_KEY: z.string().optional(),

  // Not required until M10 wires up billing.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  MAX_PAGES_PER_JOB: z.coerce.number().int().positive().default(200),
  MAX_FILE_MB: z.coerce.number().int().positive().default(32),
  FREE_TIER_PAGES: z.coerce.number().int().positive().default(30),
  COST_GUARD_CENTS: z.coerce.number().int().positive().default(250),
  SOLVE_VERIFICATION: z.enum(['on', 'off']).default('on'),
  SOLVE_MAX_PER_JOB: z.coerce.number().int().positive().default(40),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  PUPPETEER_POOL_SIZE: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Refusing to start: invalid environment configuration.\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
