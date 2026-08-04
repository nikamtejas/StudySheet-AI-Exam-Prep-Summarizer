import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { RenderTokenModel } from '../models/RenderToken';

const TOKEN_TTL_SECONDS = 120;

function sign(payload: string): string {
  return createHmac('sha256', env.RENDER_TOKEN_SECRET).update(payload).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export interface RenderToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

// Short-lived, single-use, scoped to one summary id — the print route's only
// authentication (docs/studysheet-build-prompt.md §6/§10, it "authenticates
// with the backend-issued render token, not a user session"). Persists a
// RenderToken doc so verifyAndConsumeRenderToken() can enforce single-use
// atomically later; the token string itself carries only what's needed to
// verify the HMAC signature without a DB round trip.
export async function createRenderToken(summaryId: string): Promise<RenderToken> {
  const jti = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${jti}.${summaryId}.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  const expiresAt = new Date(exp * 1000);

  await RenderTokenModel.create({ jti, summaryId, expiresAt, usedAt: null });

  return { token, jti, expiresAt };
}

// Signature + expiry + summaryId-match only, no DB read — the fast, stateless
// check the frontend's Edge middleware performs (via its own Web Crypto
// implementation of the same HMAC-SHA256 scheme) to reject an obviously
// forged or expired token before ever reaching the backend. Does not enforce
// single-use; see verifyAndConsumeRenderToken for the authoritative check.
export function verifyRenderTokenSignature(token: string, summaryId: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [jti, tokenSummaryId, expStr, signature] = parts;
  if (!jti || tokenSummaryId !== summaryId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const payload = `${jti}.${tokenSummaryId}.${expStr}`;
  return timingSafeEqualHex(signature ?? '', sign(payload));
}

// The authoritative check: everything verifyRenderTokenSignature checks,
// plus single-use — enforced atomically via findOneAndUpdate so two
// concurrent requests carrying the same token can't both succeed.
export async function verifyAndConsumeRenderToken(token: string, summaryId: string): Promise<boolean> {
  if (!verifyRenderTokenSignature(token, summaryId)) return false;
  const [jti] = token.split('.');
  const result = await RenderTokenModel.findOneAndUpdate(
    { jti, summaryId, usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
  );
  return result !== null;
}
