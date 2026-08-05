import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// docs/studysheet-build-prompt.md §10: "Rate limit per user and per IP."
// Numbers aren't spec-mandated — a documented judgment call, not a
// requirement: per-user is generous enough that a free/student's own page
// allowance is the binding constraint in normal use, not this; per-IP is set
// higher than per-user specifically to tolerate shared networks (a campus
// NAT, a library) where many distinct real users share one address, while
// still bounding a single IP scripting through many anonymous-cookie resets.
//
// In-memory store only — single-instance, not correct across a horizontally
// scaled deployment. Documented gap, same spirit as M6's CI-coverage gap:
// the correct fix (a shared Redis store, ioredis is already a dependency) is
// straightforward but deliberately deferred rather than adding an
// unverified-in-this-environment piece to an already-large milestone.
const PER_USER_JOBS_PER_DAY = 20;
const PER_IP_JOBS_PER_DAY = 100;
const PER_USER_UPLOADS_PER_DAY = 60;
const PER_IP_UPLOADS_PER_DAY = 200;

function byUserId(req: Request): string {
  return req.identity.userId;
}

export const perUserJobLimit = rateLimit({
  windowMs: ONE_DAY_MS,
  limit: PER_USER_JOBS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUserId,
  message: { error: 'rate_limited', scope: 'user' },
});

export const perIpJobLimit = rateLimit({
  windowMs: ONE_DAY_MS,
  limit: PER_IP_JOBS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  // No custom keyGenerator — the library's default already keys on req.ip
  // with correct IPv6 subnet normalization.
  message: { error: 'rate_limited', scope: 'ip' },
});

export const perUserUploadLimit = rateLimit({
  windowMs: ONE_DAY_MS,
  limit: PER_USER_UPLOADS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: byUserId,
  message: { error: 'rate_limited', scope: 'user' },
});

export const perIpUploadLimit = rateLimit({
  windowMs: ONE_DAY_MS,
  limit: PER_IP_UPLOADS_PER_DAY,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', scope: 'ip' },
});
