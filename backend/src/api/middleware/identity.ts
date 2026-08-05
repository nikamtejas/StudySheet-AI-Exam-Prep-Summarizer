import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { getAuthSession } from '../../lib/auth';
import type { PlanTier } from '../../contracts';

export interface Identity {
  type: 'user' | 'anonymous';
  userId: string;
  plan: PlanTier;
  isAdmin: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    identity: Identity;
  }
}

const ANON_COOKIE_NAME = 'ss_anon_id';
// Matches the 24h TTL cleanup on anonymous Document/Job/Summary records
// (models/*.ts's anonymousExpiresAt) — the cookie shouldn't outlive the data
// it points at.
const ANON_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Every /api/* route needs SOME identity to scope data by — a real signed-in
// user, or an anonymous trial bucket (docs/studysheet-milestones.md M8:
// "anonymous 30-page trial with 24h TTL cleanup"). This middleware is what
// makes that uniform: downstream routes read req.identity.userId and never
// see the client-supplied `userId` field M7 used to trust (contracts/document.ts,
// contracts/summary.ts — both dropped that field for exactly this reason).
//
// The anonymous cookie is an unsigned random UUID, not an HMAC-verified token
// like lib/renderToken.ts's — deliberately. It doesn't assert any privilege
// beyond "this is visitor X's bucket," so there's nothing to verify: the
// worst case of a guessed/shared value is another visitor reusing X's 30-page
// allowance, never access to a real account's data. 122 bits of randomness,
// httpOnly, and never surfaced to page JS makes that guess practically
// impossible regardless.
export async function resolveIdentity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await getAuthSession(req);
    const sessionUser = session?.user as { id?: string; plan?: PlanTier; isAdmin?: boolean } | undefined;

    if (sessionUser?.id) {
      req.identity = {
        type: 'user',
        userId: sessionUser.id,
        plan: sessionUser.plan ?? 'free',
        isAdmin: sessionUser.isAdmin ?? false,
      };
      next();
      return;
    }

    const existing = req.cookies?.[ANON_COOKIE_NAME];
    const anonId = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();

    if (anonId !== existing) {
      res.cookie(ANON_COOKIE_NAME, anonId, {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        domain: env.COOKIE_DOMAIN,
        maxAge: ANON_COOKIE_MAX_AGE_MS,
        path: '/',
      });
    }

    req.identity = { type: 'anonymous', userId: `anon:${anonId}`, plan: 'free', isAdmin: false };
    next();
  } catch (err) {
    next(err);
  }
}

// Shared by every route that creates a Document/Job/Summary — an anonymous
// identity's records get a TTL so they self-delete (models/*.ts's
// anonymousExpiresAt index); a real account's records never expire.
export function anonymousExpiryFor(identity: Identity): Date | null {
  return identity.type === 'anonymous' ? new Date(Date.now() + ANON_COOKIE_MAX_AGE_MS) : null;
}
