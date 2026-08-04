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

  constructor(status: number, code: string) {
    super(`API error ${status}: ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    const code = typeof body === 'object' && body && 'error' in body ? String(body.error) : 'unknown_error';
    throw new ApiError(res.status, code);
  }

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
  const source = new EventSource(`${API_URL}/api/jobs/${jobId}/stream`);

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

export function getSummary(summaryId: string): Promise<SummaryDTO> {
  return apiFetch(`/api/summaries/${summaryId}`);
}

export interface SourceDocument {
  url: string;
  filename: string;
  pageCount: number;
}

export function getSummarySource(summaryId: string): Promise<SourceDocument> {
  return apiFetch(`/api/summaries/${summaryId}/source`);
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
