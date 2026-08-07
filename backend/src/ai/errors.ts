import { APIConnectionError, RateLimitError, InternalServerError } from '@anthropic-ai/sdk';

// getAnthropicClient() (client.ts) already sets maxRetries: 3 on the SDK
// itself — these three error classes are exactly the ones the SDK's own
// retry logic targets (network failures, 429s, 5xxs), so seeing one here
// means that budget was already exhausted, not a single blip. Everything
// else (BadRequestError, AuthenticationError, PermissionDeniedError,
// NotFoundError, ConflictError, UnprocessableEntityError) is a problem with
// the request itself or the account, not the service's availability —
// retrying won't help, so those aren't included here.
//
// docs/studysheet-milestones.md M11: "The model API being unreachable
// produces queued jobs and an honest message, not errors" — this is the
// distinction pipeline/orchestrate.ts uses to decide "reschedule and try
// again later" versus "this job is genuinely broken, fail it."
export function isTransientAiError(err: unknown): boolean {
  return err instanceof APIConnectionError || err instanceof RateLimitError || err instanceof InternalServerError;
}
