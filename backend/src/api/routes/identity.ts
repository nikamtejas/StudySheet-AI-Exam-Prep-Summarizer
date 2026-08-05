import { Router } from 'express';
import { asyncHandler } from '../asyncHandler';
import { UserModel } from '../../models/User';
import type { IdentityResponse } from '../../contracts';

export const identityRouter = Router();

// The frontend calls this once on load: it primes the anonymous-trial and
// CSRF cookies (both set as a side effect of the identity/csrf middleware
// running on this request, per api/app.ts's ordering) before the first
// mutating request ever needs them, and tells the UI whether to show a
// signed-in or anonymous-trial experience. Deliberately not under
// /api/auth/* — that whole namespace belongs to ExpressAuth's own actions
// (session, signin, callback, csrf, ...), and this isn't one of them.
identityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.identity.type === 'anonymous') {
      const body: IdentityResponse = { user: null, isAnonymous: true };
      res.json(body);
      return;
    }

    const user = await UserModel.findById(req.identity.userId);
    if (!user) {
      // Session cookie outlived the user document (e.g. manually deleted) —
      // treat as anonymous rather than 500ing.
      const body: IdentityResponse = { user: null, isAnonymous: true };
      res.json(body);
      return;
    }

    const body: IdentityResponse = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        plan: user.plan ?? 'free',
        isAdmin: user.isAdmin ?? false,
      },
      isAnonymous: false,
    };
    res.json(body);
  }),
);
