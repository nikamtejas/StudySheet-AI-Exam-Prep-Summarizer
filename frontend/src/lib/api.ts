import type {
  PresignRequest,
  PresignResponse,
  CreateDocumentRequest,
  CreateDocumentResponse,
  CreateJobRequest,
  JobDTO,
  SummaryDTO,
  SolveRequest,
  StandaloneSolveResponse,
  IdentityResponse,
  LibraryResponse,
  DeckResponse,
  ReviewQueueResponse,
  ReviewGradeResponse,
  Grade,
  ExportFormat,
  BillingPlansResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalResponse,
  StudentVerifyResponse,
  BillingUsageResponse,
  Market,
} from '@/contracts';

// docs/studysheet-build-prompt.md §10/§6: the ONE place frontend/ talks to
// backend/ over HTTP — no scattered fetch calls, no backend imports
// elsewhere in the app. NEXT_PUBLIC_API_URL is read directly from
// process.env here (not the validated env.ts) because this module is
// imported from client components too, and env.ts's throw-on-missing
// behavior is meant for server-side startup validation, not a value that's
// already been inlined into the client bundle at build time by Next.js.
const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  status: number;
  code: string;
  // The full parsed error body — carries the extra fields specific error
  // codes need (e.g. cost_confirmation_required's estimatedCostCents/pages,
  // quota_exceeded's allowance/used/reserved) without a growing list of
  // ApiError constructor parameters most callers don't care about.
  body: Record<string, unknown>;

  constructor(status: number, code: string, body: Record<string, unknown> = {}) {
    super(`API error ${status}: ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Reads the CSRF cookie the backend issues (api/middleware/csrf.ts) — it's
// deliberately readable by page JS (httpOnly: false), since double-submit
// CSRF's entire mechanism is the frontend echoing the cookie's value back in
// a header a cross-site attacker couldn't have read themselves. Only ever
// called client-side (document.cookie doesn't exist during SSR — every
// caller of a mutating apiFetch here is a Client Component).
function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|; )ss_csrf=([^;]+)/);
  return match?.[1];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // Required for the session/anonymous-trial/CSRF cookies (all set by the
    // backend, a different origin) to be sent on every request and stored
    // from every response — docs/studysheet-build-prompt.md §10's whole
    // cross-origin cookie design is inert without this.
    credentials: 'include',
    headers: { ...headers, ...init?.headers },
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const bodyObj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const code = 'error' in bodyObj ? String(bodyObj.error) : 'unknown_error';
    throw new ApiError(res.status, code, bodyObj);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function presignUpload(req: PresignRequest): Promise<PresignResponse> {
  return apiFetch('/api/uploads/presign', { method: 'POST', body: JSON.stringify(req) });
}

export function registerDocument(req: CreateDocumentRequest): Promise<CreateDocumentResponse> {
  return apiFetch('/api/documents', { method: 'POST', body: JSON.stringify(req) });
}

export function createJob(req: CreateJobRequest): Promise<{ jobId: string }> {
  return apiFetch('/api/jobs', { method: 'POST', body: JSON.stringify(req) });
}

export function getJob(jobId: string): Promise<JobDTO> {
  return apiFetch(`/api/jobs/${jobId}`);
}

export interface JobProgressEvent {
  stage: JobDTO['stage'];
  status: JobDTO['status'];
  progress: JobDTO['progress'];
  tokensUsed: JobDTO['tokensUsed'];
  costCents: JobDTO['costCents'];
}

export interface JobDoneEvent {
  status: JobDTO['status'];
  summaryId: string | null;
  error: string | null;
}

export interface JobStreamHandlers {
  onProgress?: (event: JobProgressEvent) => void;
  onDone?: (event: JobDoneEvent) => void;
  // Fires on every connection drop, matching in intent (not literal retry
  // count) docs/studysheet-milestones.md M7: "SSE survives a 30-second
  // network drop ... resumes without duplicate sections" — EventSource's
  // native auto-reconnect handles the retry; each reconnect just re-polls
  // the job's current state server-side (api/routes/jobs.ts), so there's
  // nothing to de-duplicate on this side either.
  onConnectionError?: () => void;
}

// Returns an unsubscribe function — callers must invoke it on unmount to
// close the EventSource (the browser doesn't do this automatically for you
// just because the component holding the reference disappears).
export function streamJob(jobId: string, handlers: JobStreamHandlers): () => void {
  // withCredentials: true — same reason as apiFetch's credentials:
  // 'include'; without it the session/anonymous-trial cookie never reaches
  // this cross-origin request and the stream 404s against the wrong identity.
  const source = new EventSource(`${API_URL}/api/jobs/${jobId}/stream`, { withCredentials: true });

  source.addEventListener('progress', (event) => {
    handlers.onProgress?.(JSON.parse((event as MessageEvent).data) as JobProgressEvent);
  });

  source.addEventListener('done', (event) => {
    handlers.onDone?.(JSON.parse((event as MessageEvent).data) as JobDoneEvent);
    source.close();
  });

  source.onerror = () => {
    handlers.onConnectionError?.();
  };

  return () => source.close();
}

// cookieHeader is only ever passed by the one server-side caller (the
// preview route, an async Server Component) — a server-side fetch has no
// ambient browser cookie jar to send with credentials: 'include' the way a
// Client Component's fetch does, so the visiting browser's session/
// anonymous-trial cookie has to be forwarded explicitly. See
// app/(app)/preview/[summaryId]/page.tsx, which builds this from next/
// headers's cookies().toString().
export function getSummary(summaryId: string, cookieHeader?: string): Promise<SummaryDTO> {
  return apiFetch(`/api/summaries/${summaryId}`, cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined);
}

export interface SourceDocument {
  url: string;
  filename: string;
  pageCount: number;
}

export function getSummarySource(summaryId: string, cookieHeader?: string): Promise<SourceDocument> {
  return apiFetch(
    `/api/summaries/${summaryId}/source`,
    cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined,
  );
}

export interface RenderResult {
  r2Key: string;
  url: string;
  sizeBytes: number;
}

export function renderSummary(
  summaryId: string,
  variant: 'full' | 'appendix',
  size: 'a4' | 'letter',
): Promise<RenderResult> {
  return apiFetch(`/api/summaries/${summaryId}/render`, {
    method: 'POST',
    body: JSON.stringify({ variant, size }),
  });
}

export function renderOnePager(summaryId: string, size: 'a4' | 'letter' = 'a4'): Promise<RenderResult> {
  return apiFetch(`/api/summaries/${summaryId}/onepager`, {
    method: 'POST',
    body: JSON.stringify({ size }),
  });
}

export function solveOneProblem(req: SolveRequest): Promise<StandaloneSolveResponse> {
  return apiFetch('/api/solve', { method: 'POST', body: JSON.stringify(req) });
}

// See getSummary's comment — cookieHeader is only needed by server-side
// callers (e.g. the (app)/layout.tsx nav, an async Server Component).
export function getIdentity(cookieHeader?: string): Promise<IdentityResponse> {
  return apiFetch('/api/identity', cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined);
}

export function getUsage(cookieHeader?: string): Promise<BillingUsageResponse> {
  return apiFetch('/api/usage', cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined);
}

export function getLibrary(page = 0, pageSize = 20, cookieHeader?: string): Promise<LibraryResponse> {
  return apiFetch(
    `/api/library?page=${page}&pageSize=${pageSize}`,
    cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined,
  );
}

export function deleteSummary(summaryId: string): Promise<void> {
  return apiFetch(`/api/summaries/${summaryId}`, { method: 'DELETE' });
}

// Auth.js's own CSRF token (distinct from ss_csrf — api/middleware/csrf.ts
// explicitly exempts /api/auth/* and lets ExpressAuth manage its own).
// Sign-in forms need this fetched fresh immediately before POSTing, per
// Auth.js's own documented flow.
export async function getAuthCsrfToken(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/csrf`, { credentials: 'include' });
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

export async function signInWithEmail(email: string): Promise<void> {
  const csrfToken = await getAuthCsrfToken();
  await fetch(`${API_URL}/api/auth/signin/nodemailer`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, csrfToken }),
  });
}

export async function signInWithGoogle(): Promise<void> {
  const csrfToken = await getAuthCsrfToken();
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${API_URL}/api/auth/signin/google`;
  form.style.display = 'none';
  const input = document.createElement('input');
  input.name = 'csrfToken';
  input.value = csrfToken;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

export async function signOut(): Promise<void> {
  const csrfToken = await getAuthCsrfToken();
  await fetch(`${API_URL}/api/auth/signout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken }),
  });
}

// docs/studysheet-build-prompt.md §5/§10 — the memory layer (M9). Generates
// the deck lazily server-side if the automatic post-summary hook hasn't run
// yet (see backend's pipeline/orchestrate.ts).
export function getDeck(summaryId: string, cookieHeader?: string): Promise<DeckResponse> {
  return apiFetch(`/api/decks/${summaryId}`, cookieHeader ? { headers: { Cookie: cookieHeader } } : undefined);
}

// Returns a plain URL rather than fetching — export is a file download
// (Content-Disposition: attachment), not JSON, so callers just point an
// <a href> or window.location at this.
export function getDeckExportUrl(deckId: string, format: ExportFormat): string {
  return `${API_URL}/api/decks/${deckId}/export?format=${format}`;
}

export function getReviewQueue(): Promise<ReviewQueueResponse> {
  return apiFetch('/api/review/queue');
}

export function submitReviewGrade(cardId: string, grade: Grade, msTaken: number): Promise<ReviewGradeResponse> {
  return apiFetch(`/api/review/${cardId}`, { method: 'POST', body: JSON.stringify({ grade, msTaken }) });
}

export function getBillingPlans(market: Market = 'global'): Promise<BillingPlansResponse> {
  return apiFetch(`/api/billing/plans?market=${market}`);
}

export function createCheckout(req: CheckoutRequest & { market?: Market }): Promise<CheckoutResponse> {
  return apiFetch('/api/billing/checkout', { method: 'POST', body: JSON.stringify(req) });
}

export function createBillingPortalSession(): Promise<PortalResponse> {
  return apiFetch('/api/billing/portal', { method: 'POST', body: JSON.stringify({}) });
}

export function pauseBillingSubscription(): Promise<{ status: string }> {
  return apiFetch('/api/billing/pause', { method: 'POST', body: JSON.stringify({}) });
}

export function verifyStudentStatus(email: string): Promise<StudentVerifyResponse> {
  return apiFetch('/api/billing/student-verify', { method: 'POST', body: JSON.stringify({ email }) });
}
