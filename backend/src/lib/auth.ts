import { createTransport } from 'nodemailer';
import type { RequestHandler, Request } from 'express';
import type { ExpressAuthConfig, Session } from '@auth/express';
import { env } from '../config/env';
import { logger } from './logger';
import { getMongoConnection } from './mongo';
import { importEsm } from './esm';

export const AUTH_BASE_PATH = '/api/auth';

type ProviderList = ExpressAuthConfig['providers'];

async function buildProviders(): Promise<ProviderList> {
  const providers: ProviderList = [];

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const Google = (
      await importEsm<{ default: (config: Record<string, unknown>) => ProviderList[number] }>(
        '@auth/express/providers/google',
      )
    ).default;
    providers.push(Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }));
  } else {
    logger.warn('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google sign-in is disabled');
  }

  const Nodemailer = (
    await importEsm<{ default: (config: Record<string, unknown>) => ProviderList[number] }>(
      '@auth/express/providers/nodemailer',
    )
  ).default;

  providers.push(
    Nodemailer({
      // Nodemailer() throws unless `server` is truthy, even though the real
      // send path below never uses it when EMAIL_SERVER is set — and when
      // it's unset, sendVerificationRequest returns before touching
      // `provider.server` at all. This placeholder just satisfies that check.
      server: env.EMAIL_SERVER || 'smtp://unconfigured:0',
      from: env.EMAIL_FROM,
      // Real send when EMAIL_SERVER is configured; otherwise logs the link
      // instead of sending — lets the whole magic-link flow (request →
      // verification token → session) be exercised for real (via curl,
      // reading the link out of the log) without a real mailbox configured.
      // Same "build it for real, degrade cleanly without credentials" pattern
      // as ANTHROPIC_API_KEY in M2.
      async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
        if (!env.EMAIL_SERVER) {
          logger.info({ identifier, url }, 'magic link (EMAIL_SERVER not set — logging instead of sending)');
          return;
        }
        const transport = createTransport(env.EMAIL_SERVER);
        const result = await transport.sendMail({
          to: identifier,
          from: env.EMAIL_FROM,
          subject: 'Sign in to StudySheet',
          text: `Sign in to StudySheet:\n${url}`,
          html: `<p><a href="${url}">Sign in to StudySheet</a></p>`,
        });
        const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
        if (failed.length > 0) {
          throw new Error(`Email (${failed.join(', ')}) could not be sent`);
        }
      },
    }),
  );

  return providers;
}

// Auth.js defaults to `sameSite: 'lax'`, which a cross-origin frontend/backend
// pair (docs/studysheet-build-prompt.md §10: "app." and "api." under the
// same root, or bearer tokens otherwise) can never actually receive on a
// fetch with credentials — the browser withholds a Lax cookie on a
// cross-site subrequest. `none` is required here specifically because the
// two origins are genuinely different hosts even when they share a parent
// domain. `domain: env.COOKIE_DOMAIN` is what makes the cookie visible to
// both — in local dev this is just "localhost" (host-only cookies already
// ignore port, so this also works unmodified across localhost:3000 and
// :4000); in production it should be the shared parent, e.g. ".example.com".
function buildCookieOptions(): ExpressAuthConfig['cookies'] {
  const useSecureCookies = env.NODE_ENV === 'production';
  return {
    sessionToken: {
      name: useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        domain: env.COOKIE_DOMAIN,
      },
    },
  };
}

let configPromise: Promise<ExpressAuthConfig> | null = null;

// Memoized like lib/mongo.ts's getMongoConnection() — built once, on first
// real use, not at module load (avoids forcing the ESM interop dance and a
// Mongo round-trip during process boot for routes that never touch auth).
function getAuthConfig(): Promise<ExpressAuthConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      const { MongoDBAdapter } = await importEsm<{
        MongoDBAdapter: (
          client: () => Promise<unknown>,
          options?: Record<string, unknown>,
        ) => ExpressAuthConfig['adapter'];
      }>('@auth/mongodb-adapter');

      return {
        basePath: AUTH_BASE_PATH,
        trustHost: true,
        secret: env.AUTH_SECRET,
        session: { strategy: 'database' },
        adapter: MongoDBAdapter(
          () => getMongoConnection().then((conn) => conn.connection.getClient()),
          {
            collections: {
              Users: 'users',
              Accounts: 'accounts',
              Sessions: 'sessions',
              VerificationTokens: 'verification_tokens',
            },
          },
        ),
        providers: await buildProviders(),
        cookies: buildCookieOptions(),
        callbacks: {
          // Database-strategy sessions only expose email/name/image by
          // default (@auth/core's own doc comment: "for increased
          // security") — `user` here is the adapter's raw user document, so
          // whatever extra fields Mongoose's User model reads (plan,
          // isAdmin) are already present on it and just need copying across
          // explicitly. See contracts/auth.ts's SessionUser / lib/identity.ts
          // for where these get validated back out on the read side.
          async session({ session, user }) {
            const raw = user as unknown as { plan?: string; isAdmin?: boolean };
            return {
              ...session,
              user: {
                ...session.user,
                id: user.id,
                plan: raw.plan ?? 'free',
                isAdmin: raw.isAdmin ?? false,
              },
            };
          },
        },
      } satisfies ExpressAuthConfig;
    })();
  }
  return configPromise;
}

let authHandlerPromise: Promise<RequestHandler> | null = null;

// Lazy the same way — the middleware mounted in api/app.ts delegates to
// this on first request rather than blocking app construction on the ESM
// import + Mongo connection.
export function getAuthHandler(): Promise<RequestHandler> {
  if (!authHandlerPromise) {
    authHandlerPromise = (async () => {
      const config = await getAuthConfig();
      const { ExpressAuth } = await importEsm<{
        ExpressAuth: (config: ExpressAuthConfig) => RequestHandler;
      }>('@auth/express');
      return ExpressAuth(config);
    })();
  }
  return authHandlerPromise;
}

export async function getAuthSession(req: Request): Promise<Session | null> {
  const config = await getAuthConfig();
  const { getSession } = await importEsm<{
    getSession: (req: Request, config: ExpressAuthConfig) => Promise<Session | null>;
  }>('@auth/express');
  return getSession(req, config);
}
