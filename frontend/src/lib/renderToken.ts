// Mirrors backend/src/lib/renderToken.ts's verifyRenderTokenSignature exactly,
// but using Web Crypto instead of node:crypto — this runs inside Next.js
// Middleware's Edge runtime, which has no `node:crypto` and no `Buffer`.
// Confirmed Node's createHmac and Web Crypto's HMAC-SHA256 produce identical
// signatures for the same secret+payload before relying on this.
//
// Stateless only: signature + expiry + summaryId match. Cannot enforce
// single-use here (the frontend has no database) — that's the backend's
// GET /api/render/:summaryId's job, which the page component calls after
// middleware lets the request through.

// Explicit ArrayBuffer construction (not the Uint8Array(length) shorthand) —
// newer TS lib.dom types generic Uint8Array over ArrayBufferLike, which
// SharedArrayBuffer also satisfies, so the shorthand form isn't structurally
// assignable to Web Crypto's BufferSource params without this.
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(Math.floor(hex.length / 2));
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verifySignature(secret: string, payload: string, signatureHex: string): Promise<boolean> {
  if (!/^[0-9a-f]+$/i.test(signatureHex) || signatureHex.length % 2 !== 0) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, hexToBytes(signatureHex), enc.encode(payload));
}

export async function verifyRenderTokenSignature(
  token: string,
  summaryId: string,
  secret: string,
): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [jti, tokenSummaryId, expStr, signature] = parts;
  if (!jti || !signature || tokenSummaryId !== summaryId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const payload = `${jti}.${tokenSummaryId}.${expStr}`;
  return verifySignature(secret, payload, signature);
}
