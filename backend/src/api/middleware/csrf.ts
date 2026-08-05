import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import { AUTH_BASE_PATH } from '../../lib/auth';

const CSRF_COOKIE_NAME = 'ss_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Double-submit CSRF (docs/studysheet-build-prompt.md §10) for our own
// cookie-authenticated mutations. Auth.js manages its own CSRF token for its
// own sign-in/callback actions (confirmed live: GET /api/auth/csrf, checked
// against the csrfToken form field) — explicitly skipped here by path rather
// than relying on Express middleware ordering/fallthrough, since whether
// ExpressAuth calls next() for a request under its own basePath isn't
// documented and isn't worth depending on.
//
// The cookie is deliberately readable by page JS (httpOnly: false) — the
// frontend echoes its value back in the X-CSRF-Token header, which is the
// entire point of double-submit: a cross-site attacker can trigger a cookie
// to be sent, but can't read its value to put in a header, since browsers
// don't let one origin read another's cookies or response bodies.
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith(AUTH_BASE_PATH)) {
    next();
    return;
  }

  const existing = req.cookies?.[CSRF_COOKIE_NAME];
  const token = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();

  if (token !== existing) {
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: 'none',
      secure: true,
      domain: env.COOKIE_DOMAIN,
      path: '/',
    });
  }

  if (MUTATING_METHODS.has(req.method)) {
    const header = req.headers[CSRF_HEADER_NAME];
    if (header !== token) {
      res.status(403).json({ error: 'csrf_token_mismatch' });
      return;
    }
  }

  next();
}
