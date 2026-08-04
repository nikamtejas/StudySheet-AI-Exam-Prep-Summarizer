import { z } from "zod";

// NEXT_PUBLIC_* values differ per environment (dev/staging/prod) so, like the
// backend's FRONTEND_URL/CORS_ORIGIN, they're required with no default rather
// than silently falling back to localhost. RENDER_TOKEN_SECRET is server-side
// only; M6 wires it up (the /print route's middleware verifies render tokens
// with it) so it's required now — see docs/studysheet-build-prompt.md §14.
// Must match backend/.env's RENDER_TOKEN_SECRET exactly — both sides sign/
// verify the same HMAC.
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  RENDER_TOKEN_SECRET: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    RENDER_TOKEN_SECRET: process.env.RENDER_TOKEN_SECRET,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration.\n${details}`);
  }

  return parsed.data;
}

export const env = loadEnv();
