# StudySheet — Milestone Plan for Claude Code

Companion to `studysheet-build-prompt.md`. That document is the *what*. This one is the *order*, cut into sessions Claude Code can finish, verify, and commit without losing the thread.

## How to run this

1. **Milestone 0 first.** It writes `CLAUDE.md`, which is what keeps every later session on the rails.
2. **One milestone per session.** Paste the milestone block, let it finish, run the gate, commit, then `/clear`. Long sessions are where agents start guessing.
3. **Never skip a gate.** Every milestone ends with commands that must pass. If they don't, fix before moving on — a broken M2 becomes an unfixable M8.
4. **Keep both documents in the repo** (`/docs`) so Claude Code can re-read the spec instead of inventing details.
5. Attach the spec to the session: `claude "read docs/studysheet-build-prompt.md and docs/studysheet-milestones.md, then execute Milestone 3"`.

Milestones 0–6 have no UI at all. That's deliberate. The engine has to be correct and fast before anything is pretty, and a CLI is far cheaper to iterate against than a browser.

---

## Standing rules — put these in CLAUDE.md, they apply to every milestone

**Performance budgets (these are gates, not aspirations)**

| Thing | Budget |
|---|---|
| Any API route that isn't a job submit | p95 < 200ms |
| Job submit → queued, response returned | < 400ms |
| First summary section streamed to client | < 20s for a 30-page typed PDF |
| Full 100-page vision job | < 4 min |
| Single-problem solve (§4 entry point) | < 15s |
| PDF render from stored JSON | < 3s, zero API calls |
| Landing LCP / TTI | < 1.2s / < 2.0s |
| First-load JS on landing | < 120KB gzipped |

**Reliability invariants — violating any of these is a bug even if tests pass**

1. No AI call in a request/response cycle. Ever. Everything model-touching runs in a worker.
2. Every pipeline stage is idempotent and independently resumable. Re-running a completed stage is free and produces identical output.
3. Every model call is wrapped: timeout, 3 retries with jittered backoff, and a typed failure that degrades the output instead of failing the job.
4. Every model response is parsed with Zod. On failure, retry once with the validation error appended; then fall back, never crash.
5. Partial failure degrades visibly — "pages 40–48 couldn't be read" printed in the output — never silently.
6. Intermediate JSON is persisted at every stage. Re-rendering, restyling, and regenerating derived artifacts must never re-run the model.
7. Money and quota move through one code path with reservation-then-commit semantics.
8. Every job records `costCents` and `tokensUsed`. Untracked spend is a production incident waiting to happen.
9. External input is untrusted: file type, size, page count, and text density are validated before a single token is spent.
10. Structured logs with a `jobId` on every line. You will be debugging a stuck job at 2am.

**Engineering rules**

- TypeScript strict everywhere. `any` requires a comment explaining why.
- Zod schemas live in `backend/src/contracts/` and are synced into `frontend/src/contracts/` by script. The frontend copy is generated — never hand-edit it, and never define a type twice.
- Tests are written in the same commit as the code, not "later".
- No new dependency without a one-line justification in the PR description.
- Conventional commits, one commit per logical unit.

---

## M0 — Foundations

**Goal:** two folders that each build and verify independently, before any feature exists.

**Build**
- Two independent Node projects per §6: `frontend/` (Next.js 15) and `backend/` (Express API + BullMQ worker, two npm scripts off one codebase). Separate `package.json`, separate lockfile, separate deploy. No workspaces.
- `backend/src/contracts/` with the first Zod schemas, plus `scripts/sync-contracts.mjs` copying them to `frontend/src/contracts/` with a generated-file header
- Root `Makefile` (or `npm-run-all` at root) exposing `make dev`, `make verify`, `make test` so one command drives both folders
- `docker-compose.yml`: MongoDB, Redis, and a MinIO container standing in for R2 locally
- Env loading with Zod validation at boot — the process refuses to start on a missing var, with a message naming it
- Structured logging (pino) with request-id and job-id correlation
- Vitest, ESLint, Prettier, `tsc --noEmit` in **each** folder, wired to `npm run verify` in both
- GitHub Actions: two jobs, one per folder, running in parallel — plus a contract-drift job that runs `sync:contracts` and fails on `git diff --exit-code`
- **`CLAUDE.md`** containing: the standing rules above, the folder map, the commands, and a "current milestone" line to update as you go
- A `/health` route on api and worker reporting Mongo + Redis + storage reachability

**Done when**
- `docker compose up`, then `npm run verify` passes in **both** folders from a clean clone
- Editing a backend schema and forgetting to sync fails CI
- The frontend builds with the backend switched off (it must never import backend code)
- `/health` returns all-green, and returns red with a useful message when Redis is stopped
- Deleting a required env var produces a clear startup error, not a runtime crash

**Do not** build any product feature, any UI beyond a blank page, or any AI call.

---

## M1 — Ingest and probe

**Goal:** a PDF goes in, and you know exactly what kind of pages it contains — before spending money on it.

**Build**
- Presigned upload → object storage; `Document` record with `fileHash` (SHA-256)
- Hash dedup: same file, same user → return the existing document, do no work
- Validation: MIME sniffing (not extension), size cap, page count cap, encrypted-PDF rejection with a clear error
- **Probe**, per page not per file: text layer present? character density? rotation? detected language? → `detectedPerPage[]`
- Path decision per page: `text` vs `vision`, plus a document-level summary the UI can show ("9 of 14 pages are handwritten")
- Page rasterization for the vision path: 150–200 DPI, JPEG q80, cached in storage so it's never redone
- CLI: `npm run probe -- ./fixtures/scan.pdf` (in `backend/`) prints the per-page table

**Reliability focus:** probing a 200-page file must not load it entirely into memory. Stream it.

**Done when**
- Fixtures covering typed, scanned-handwritten, slides, mixed, encrypted, corrupt, and zero-text-layer all probe correctly
- Probe of a 100-page PDF completes in < 8s and stays under 512MB RSS
- Re-uploading the same file creates no new document and no new work

**Do not** call any model yet.

---

## M2 — The pipeline skeleton and the text path

**Goal:** a real summary comes out of the CLI, and the job survives being killed.

**Build**
- BullMQ queue with one job per document set, stages as separate steps with persisted state after each
- Anthropic client wrapper: model routing (Haiku for probes, Sonnet 5 for extraction, Opus 5 for synthesis), timeouts, retries, token and cost accounting per call, prompt caching on the shared system prompt
- Text extraction and cleaning: strip repeated headers/footers/page numbers detected across pages
- Heading-aware chunker, 8–15 pages or ~15k tokens, one page of overlap
- Map stage → strict JSON per chunk, Zod-validated, with a repair retry
- Reduce stage → dedupe, rank by exam relevance
- Synthesis stage → final study-document JSON, persisted to `Summary`
- CLI: `npm run summarize -- ./fixtures/lecture.pdf --depth balanced` writes JSON and prints cost

**Reliability focus:** this is the milestone that proves invariants 1–8. Kill the worker mid-run and restart it — the job resumes from the last completed stage and does not re-bill completed chunks. Write a test that actually does this.

**Done when**
- A 30-page typed PDF produces a valid summary in < 20s to first section, < 60s total
- `SIGKILL` the worker at each stage boundary; every restart resumes correctly
- Malformed model JSON is recovered by the repair retry, proven with a mocked bad response
- Cost is recorded and within ~20% of the spec's estimate

**Do not** build the vision path, solving, or any renderer.

---

## M3 — Vision path

**Goal:** handwritten notes work as well as typed ones.

**Build**
- Batched image blocks (≤20 pages per request, respecting the 32MB request ceiling — remember base64 inflates ~33%)
- Files API upload with `file_id` reuse instead of re-sending base64 across calls
- Documents over 100 pages split automatically at semantic boundaries
- Low-confidence transcription: the model marks uncertain readings, which persist as `confidence: 'low'` on the item
- Auto-detect override with a user-visible notice when the selected source type was wrong

**Done when**
- The handwritten fixture produces a correct summary with uncertain readings flagged, not guessed
- A 120-page document splits, processes, and merges without duplicated concepts
- A 100-page vision job finishes in < 4 min and its cost lands within 20% of the estimate
- A page that genuinely can't be read appears in the output as a gap, and the job still succeeds

---

## M4 — Solve and verify

**Goal:** step-by-step solutions you can actually trust. This is the milestone most likely to be quietly broken, so it gets its own gate.

**Build**
- Problem detection during reduce (numbered exercises, worked examples, boxed answers, derivation chains)
- One solve call per problem, run in parallel with a concurrency cap — never batch problems into one call
- Solution schema from §4 with the **required `why` on every step**
- Verification: independent re-solve with no sight of the first answer, plus `mathjs` evaluation and unit checking where the problem admits it; disagreement after a third attempt renders as `Unverified`, never as a clean answer
- Standalone `solveOne()` used later by the paste/photo entry point
- **Fixture set: 60 problems with known answers** across your target subjects, in `fixtures/problems/`
- `npm run eval:solve` prints per-subject pass rate, mean latency, and cost per problem

**Done when**
- Fixture pass rate ≥ 95% overall and ≥ 90% in every subject you intend to launch with
- Every failure is flagged in the output, zero silently-wrong answers in the fixture run
- A single problem solves in < 15s p95
- Verification roughly doubles solve cost and no more — if it's worse, the second call is seeing too much context

**Do not** launch a subject whose fixture pass rate is below the bar. Ship fewer subjects that work.

---

## M5 — Visual primitives

**Goal:** deterministic, on-brand, printable diagrams.

This is the first milestone that touches `frontend/`. Everything before it lived in `backend/`.

**Build**
- `frontend/src/components/visuals/`: React SVG components for the ten primitives in §4, one per `kind`, no exceptions
- Their Zod specs go in `backend/src/contracts/` (source of truth) and arrive in the frontend via `sync:contracts`
- **Server-renderable only** — no `window`, no client hooks, no animation. These components have to render inside a Puppeteer page load with zero hydration.
- KaTeX server-side rendering helper for inline and display math
- A `/dev/gallery` route rendering all primitives with sample data, plus greyscale and print previews
- Snapshot tests on rendered SVG output

**Done when**
- All ten primitives render from spec with no runtime errors on malformed input (invalid spec → the visual is dropped, the surrounding content still renders)
- Every primitive is legible printed in greyscale — meaning encoded in weight and dash, not only color
- Identical SVG output from the web and PDF paths, proven by snapshot
- Visuals add < 40KB gzipped to the client bundle, code-split per route
- Rendering the gallery route with JS disabled produces identical output — proves the print path will work

---

## M6 — PDF renderer

**Goal:** the artifact. Make it beautiful here, before any app UI exists.

This milestone spans both folders and is where the split architecture proves itself: **the frontend owns the layout, the backend just drives a browser at it** (§6).

**Build — `frontend/`**
- `/print/[summaryId]` route, server-rendered, **zero client JS**, driven purely by `Summary` JSON fetched from the backend with a render token
- Three variants via query param: full study sheet, one-pager, answer appendix
- Print CSS: A4 and Letter, correct margins, no orphaned headings, page numbers, the highlight system, footer disclaimer
- `noindex`, excluded from the sitemap, unreachable from app navigation

**Build — `backend/`**
- Short-lived HMAC render tokens (`RENDER_TOKEN_SECRET`), single-use, scoped to one summary id
- Puppeteer service with a warm browser pool (`PUPPETEER_POOL_SIZE`) — cold-starting Chromium per request will blow the 3s budget
- Wait on a `data-render-ready` attribute the print page sets after KaTeX and fonts settle, never a fixed `setTimeout`
- Highlight cap enforcement before render — if more than ~15% of a page is marked, drop the weakest marks
- Upload to R2, store the key, return a signed URL
- CLI: `npm run render -- <summaryId> --format a4|letter|onepager`

**Done when**
- Render completes in < 3s with **zero AI calls** (assert this in the test)
- Same JSON in → byte-comparable PDF out, across runs
- A4 and Letter both print correctly, verified against actual page-boxed output
- Long tables, wide formulas, and diagrams never overflow the page
- The one-pager fits on exactly one sheet, always, by dropping lowest-ranked content rather than shrinking type below a floor
- An expired or forged render token returns 403 and produces no PDF
- Restyling is a pure frontend change: edit the print CSS, re-render, zero backend deploys

---

## M7 — Web app

**Goal:** the front door, fast.

**Build**
- Landing with the before/after hero from §9 — no PDF library loaded on this route
- Upload with client-side page counting, config panel, cost/page preview before submit
- Processing view: the page filmstrip and mono counter, fed by SSE with automatic reconnect
- Preview: two-pane summary/source, page-ref jumping, highlight toggling, solution steps, rendered visuals
- Route-level code splitting; `pdf.js` and the visual components only on the routes that need them
- One typed API client (`src/lib/api.ts`) over `NEXT_PUBLIC_API_URL` — no scattered `fetch` calls, no backend imports
- Empty, loading, and error states written per the copy rules in §9
- The standalone "Solve one problem" entry point wired to `solveOne()`

**Done when**
- Lighthouse ≥ 95 on all four axes for landing and upload
- First-load JS on landing < 120KB gzipped, enforced by a bundle-size check in CI
- SSE survives a 30-second network drop and resumes without duplicate sections
- Full flow works at 375px width, keyboard-only, and with `prefers-reduced-motion`
- Refreshing mid-job reconnects to the running job rather than restarting it

---

## M8 — Accounts, library, quotas

**Goal:** multi-user, with spend that can't run away.

**Build**
- Auth.js (magic link + Google) with the **backend as the auth server**, httpOnly `SameSite=None; Secure` cookies on a shared parent domain; per-user data scoping enforced at the query layer
- CORS allowlisting exactly the frontend origin with `credentials: true`, plus CSRF double-submit tokens on cookie-authenticated mutations
- Library: paginated past summaries, re-download, delete
- `Usage` per user per period; quota middleware with **reserve-before-queue, release-on-failure, commit-on-success**
- Cost guard: jobs above `COST_GUARD_CENTS` require explicit confirmation with the estimate shown
- Rate limits per user, per IP, per day; anonymous 30-page trial with 24h TTL cleanup
- Admin view: jobs, cost per job, failure rate, cost per active user

**Done when**
- Concurrent job submissions can't exceed the quota (test with parallel requests — this is where the race lives)
- A failed job returns its reserved pages, verified by test
- A user cannot read another user's document, summary, or PDF, verified by test
- Auth works across the two origins in a real browser, including after a hard refresh and in Safari (its third-party cookie rules are the strictest — test there before you ship)
- Anonymous data actually disappears after 24h

---

## M9 — Memory layer

**Goal:** the reason they come back next week.

**Build**
- Deck and card generation from stored `Summary` JSON — **no model calls**
- Cloze generation from definitions, method cards from solved problems
- Anki (.apkg or TSV) and Quizlet CSV export
- SM-2 scheduler as a pure, unit-tested function
- Review UI: due count, four-button grading, 20-card sessions, offline-tolerant queueing
- Self-test mode with confidence tagging feeding the queue

**Done when**
- Deck generation is instant and free (assert zero API calls)
- Exports import cleanly into real Anki and real Quizlet — test by hand, once, properly
- SM-2 has full unit coverage including lapse and ease-floor behavior
- The review queue query is index-backed and stays under 50ms at 10k cards

---

## M10 — Billing

**Goal:** money in, correctly, from students who may not own a credit card.

**Build**
- Plans, checkout, and customer portal for Stripe; the same for Razorpay or Paddle in your second market
- **Webhooks are the only source of entitlement** — signature-verified on the raw body (mount before the JSON parser), idempotent by event id, replay-safe, exempt from CORS and CSRF
- Tier → page allowance mapping in config, localized per market (adjust the allowance, not just the price)
- Pause instead of cancel; semester pass as a fixed-term entitlement
- Student verification for discounted tiers
- Usage dashboard: pages used, pages left, renewal date

**Done when**
- Upgrade, downgrade, pause, cancel, and payment failure all land correctly with the browser closed
- Replaying a webhook twice changes nothing
- A user whose payment fails degrades to free at period end, keeping their library
- Measured gross margin on the Student tier holds above 70% at 90th-percentile beta usage

---

## M11 — Hardening and launch

**Goal:** it stays fast and reliable with real students on it during exam week.

**Build**
- Load test: 50 concurrent jobs; measure queue depth, p95 latencies, memory, and cost. Fix what breaks.
- Worker autoscaling on queue depth; a separate priority queue for paid tiers
- Dead-letter queue with a replay tool, and alerting on DLQ depth, error rate, p95 latency, and daily spend
- Sentry plus dashboards for the budgets in the standing rules
- Backups and a tested restore; graceful degradation when the model API is down (queue and inform, don't fail)
- Legal: DMCA process and agent, privacy policy, terms, the study-aid disclaimer everywhere it belongs

**Done when**
- 50 concurrent jobs complete with every performance budget still met
- The model API being unreachable produces queued jobs and an honest message, not errors
- A restore from backup succeeds in a drill
- Every budget in the standing rules has a dashboard and an alert

---

## Sequencing notes

- **Ship M0–M9 as a free beta to one campus before M10.** You need real usage data to set page allowances, and M4's pass rate to know solving is worth charging for.
- M5 and M6 can run in parallel with M3 if you have a second session going — they share no code with the vision path.
- Because the folders are independent, frontend milestones (M5, M7, part of M6) and backend milestones can genuinely run in two Claude Code sessions at once, provided the contracts are synced first. Sync before you split, and never let both sessions edit `contracts/`.
- If a milestone runs long, cut scope inside it rather than deferring its gate. The gates are the reason this order works.
