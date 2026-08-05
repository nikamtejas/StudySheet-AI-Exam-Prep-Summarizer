// Node's own connection-refused errors surface as an AggregateError whose top-level
// `.message` is empty (the real reason is nested in `.errors[]`) — e.g. from the
// AWS SDK v3's fetch-based HTTP handler. Health checks need a message a human can
// act on, not "".
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message) return err.message;

    const inner = (err as { errors?: unknown }).errors;
    if (Array.isArray(inner) && inner[0] instanceof Error && inner[0].message) {
      return inner[0].message;
    }

    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;

    return err.name || 'unknown error';
  }
  return String(err);
}

const MONGO_DUPLICATE_KEY_CODE = 11000;

// Shared by anywhere two concurrent requests can race to create the same
// uniquely-indexed document (pipeline/ingest.ts's Document dedup, lib/quota.ts's
// per-period Usage doc) — the unique index is the real source of truth for
// "only one exists"; this just turns the loser's error into "someone else
// already created it, carry on" instead of a 500.
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === MONGO_DUPLICATE_KEY_CODE;
}
