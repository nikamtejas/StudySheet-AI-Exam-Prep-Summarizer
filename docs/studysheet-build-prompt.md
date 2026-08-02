# Build Prompt — "StudySheet": AI Exam-Prep PDF Summarizer

> Paste this whole document into Claude Code, Cursor, or any agentic coding tool as the project brief. It is written to be executed, not just read.

---

## 1. What you're building

A web app where a student uploads one or many PDFs (lecture notes, textbook chapters, scanned handwriting, slide decks) and gets back a **single clean, printable revision PDF** written in plain language, with key definitions and key points visually highlighted — the thing they'd actually read the night before an exam.

It also solves the problems in those notes — worked step by step, in plain language, with a diagram where a diagram helps and a memory hook attached so the method sticks.

**One-line pitch:** Drop in your messy notes, get back the sheet you'll actually revise from.

**Business model:** subscription, sold to students, billed in page credits. See §12 — read it before building, because it constrains the pipeline (cost per page is the whole business).

**Primary user:** an undergrad, 2 days before an exam, on a laptop, impatient.

**The job the product does:** compress → clarify → mark what matters.

Not a chatbot. Not a note-taking app. A pipeline with a beautiful front door.

### Scope guardrails

- "Humanize" here means **plain-language rewriting**: short sentences, no jargon without a definition, exam-oriented framing. It does **not** mean evading AI-detection tools — do not build or market that, and do not add an "undetectable" claim anywhere in the UI.
- Add a short footer line on generated PDFs: *"AI-generated study aid. Verify against your course material."* Summaries can drop nuance and students are the ones sitting the exam.

---

## 2. User flow

```
Landing → Upload (drag/drop, 1–10 PDFs)
        → Configure  [source type] [subject] [depth] [language] [solve problems ✓]
        → Processing (live per-page progress)
        → Preview (interactive summary, editable highlights, step-by-step solutions)
        → Download PDF  /  One-pager  /  Flashcard deck  /  Save to library
                                              ↓
                                    Review (spaced repetition, self-test)
```

Second entry point, equally important: **"Solve one problem"** — paste, type, or photograph a single question and get the worked explanation without uploading anything. It's the lowest-friction way in, and it's what brings people back mid-semester. See §4.

**Source type selector** — this is the important choice, so make it a real decision, not a hidden setting:

| Option | What it means | Pipeline effect |
|---|---|---|
| **Typed / digital** | Native text-layer PDF | Fast text extraction path |
| **Handwritten / scanned** | Photos of notes, scanned pages, no text layer | Vision path — pages rendered to images, read by the model |
| **Slides / presentation** | Dense visuals, sparse text | Vision + layout-aware prompt, per-slide grouping |
| **Mixed / not sure** | — | Auto-detect per page (default) |

Auto-detect must run regardless and **override a wrong user choice with a visible notice**: "3 pages had no readable text layer — read them as handwriting instead." Never silently produce a blank summary.

**Other controls:**
- Depth: `Crash course` (~1 page/10 source pages) · `Balanced` · `Deep` (keeps derivations, worked examples)
- Output language (default: source language)
- Optional: paste the syllabus or exam topics → weights what gets kept

---

## 3. Output specification

The generated PDF is the product. It must be genuinely good, not a wall of bullets.

**Structure per source document:**
1. **In one minute** — 4–6 sentences, the whole topic in plain words
2. **Key definitions** — term + one-sentence definition, each rendered with a highlight treatment. This is the most-used block; put it early.
3. **Core concepts** — short sections, each with a bolded takeaway line
4. **Formulas / processes** — only when present in source, rendered with KaTeX
5. **Worked problems** — every problem found in the source, solved step by step with a reason on each step and a diagram where one earns its place (§4)
6. **Likely exam questions** — 5–8, derived from emphasis in the source (repetition, headings, "note that", boxed content)
7. **Common confusions** — pairs of things students mix up
8. **Remember this** — the memory hooks and mnemonics collected in one block (§5)
9. **Page map** — "Covered: pp. 4–17 of lecture-3.pdf" so students can go back to the original

Two extra render targets from the same JSON, no extra AI cost: the **one-page cheat sheet** and the **flashcard deck**. Both are covered in §5.

**Multi-file mode:** merge into one document, deduplicate overlapping concepts, and add a *Connections* section showing where the files link (e.g. "Lecture 3's derivation is applied in Tutorial 5, Q2").

**Highlighting rules** — two marker colors, used consistently and sparingly:
- Amber = definitions and named terms
- Teal = exam-critical facts, conditions, exceptions
- Nothing else is highlighted. If more than ~15% of a page is marked, the model over-marked; enforce a cap in post-processing.

**Citations:** every key point carries a source page reference. In the interactive preview, hovering it shows the original page thumbnail.

---

## 4. Problem solving — steps, visuals, and not being wrong

This is the hardest part of the product and the reason someone pays for it. A summary is commodity. A problem explained so clearly that the student can redo it alone is not.

### Detecting problems in the source

During the probe stage, tag content as a problem when it matches: numbered exercises (`Q3.`, `Problem 7`, `Exercise 2.4`), end-of-chapter question blocks, worked examples in the body text, or anything followed by a derivation. Handwritten sources: look for boxed answers and `∴` / `=>` chains.

The student can also type or photograph a single problem directly — treat this as a first-class entry point, not a hidden feature. Most sessions will start here once they trust the app.

### Solution format

Each solved problem returns strict JSON:

```ts
{
  problem: string,
  subject: 'math'|'physics'|'chemistry'|'cs'|'economics'|'biology'|'other',
  given: string[],           // what we know
  goal: string,              // what we're asked, restated plainly
  strategy: string,          // one sentence: why this method, before any algebra
  steps: [{
    n: number,
    action: string,          // plain language: "Divide both sides by 3"
    math: string,            // KaTeX
    why: string,             // REQUIRED. the reason this step is legal or useful
    watchOut?: string        // the mistake people make here
  }],
  answer: { value: string, units?: string },
  check: string,             // sanity check: substitute back, check units/magnitude
  commonMistake: string,
  visual?: VisualSpec,
  memoryHook: string         // the one line to remember the method by
}
```

**The `why` field is non-negotiable.** A step list without reasons is a photocopy of the textbook. The `why` is the product.

**Three-rung ladder per problem type:**
1. **Worked** — fully solved, every step visible
2. **Guided** — same method, new numbers, last two steps blanked with a hint
3. **Practice** — new problem, answer at the back of the PDF

That progression is what converts reading into passing.

### Correctness (read this twice)

Models produce arithmetic and algebra errors that *look* completely confident. Shipping a study aid that teaches a wrong method is worse than shipping nothing.

Required safeguards:

- **Independent second pass.** Re-solve each problem in a separate call with no sight of the first solution, then compare final answers. Match → ship. Mismatch → run a third; majority wins, and if there's still no agreement, render the problem with a visible `Unverified — check with your notes` tag rather than a clean answer.
- **Symbolic/numeric verification where possible.** Pipe algebraic and numeric results through `mathjs` (or a sandboxed Python + SymPy worker) to actually evaluate the final expression and substitute back. Deterministic verification beats a second opinion whenever the problem admits it.
- **Unit checking** on physics/chemistry answers — dimensional mismatch fails the problem automatically.
- Never silently drop a problem that fails verification. Show it, flagged. Students trust visible uncertainty and abandon products that are confidently wrong once.

Track `verificationPassRate` per subject as a product metric. If it drops below ~95% for a subject, disable that subject rather than degrading quietly.

### Visualization

**The model never emits raw SVG.** It emits a typed visual spec; your renderer draws it. This is the only way to get output that's consistent, on-brand, printable, and not broken.

```ts
type VisualSpec =
  | { kind: 'functionPlot', fns: string[], domain: [number,number], marks?: Point[], annotations?: [] }
  | { kind: 'numberLine', range: [number,number], points: [], intervals: [] }
  | { kind: 'geometry', shapes: [], labels: [], angles: [], congruenceMarks: [] }
  | { kind: 'vectorDiagram', vectors: [{ from, to, label }], axes?: boolean }
  | { kind: 'flowchart', nodes: [], edges: [] }          // processes, algorithms, proofs
  | { kind: 'tree', root: Node }                          // recursion, taxonomy, decision
  | { kind: 'grid', rows: [][], highlight: [] }           // matrices, truth tables, DP tables
  | { kind: 'timeline', events: [{ at, label }] }         // history, biology stages, project
  | { kind: 'cycle', stages: [] }                         // Krebs, water cycle, feedback loops
  | { kind: 'compare', left: {}, right: {}, axes: [] }    // the two things students confuse
```

Ten primitives, no more. If a concept doesn't fit one, it gets prose.

Render each spec with a **single React SVG component set living in `frontend/src/components/visuals/`**, one component per `kind`. Both the preview and the PDF use it, because the PDF is produced by rendering a frontend route (see §6) — one implementation, two surfaces, identical output. Components must be server-renderable: no `window`, no client-only hooks, no animation in the print path. Math typesetting via server-side KaTeX. Diagrams inherit the palette from §Design: ink strokes on paper, amber and teal used only to mark the thing being explained.

**Rules of restraint:**
- A visual appears only when it shows something a sentence cannot. No decorative diagrams, no illustrating "Newton's second law" with a picture of an apple.
- One visual per problem, maximum. If the model requests more, keep the one attached to the hardest step.
- Every visual carries a caption that states its point, not its contents. "Slope flattens as x grows" beats "Graph of f(x)".
- Must be legible in greyscale — students print. Encode meaning in line weight and dash pattern as well as color.

### Non-STEM subjects

The same machinery serves law, medicine, history, and economics: `flowchart` for procedures and case tests, `timeline` for chronology and disease progression, `compare` for the doctrine/concept pairs that get mixed up in exams, `tree` for classification. The step format applies to any structured reasoning — an essay argument, a case analysis, a diagnosis — not just algebra. Do not build this as a math-only feature.
## 5. The memory layer

Summarizing is compression. Passing is recall. Everything in this section exists to move material from the page into the student's head, and it's also what justifies a subscription over a one-off purchase — the summary is done in 90 seconds, but revision runs for weeks.

**Memory hooks.** Every definition and every solved method carries one line, ≤12 words, that makes it stick: a concrete analogy, an image, or a mnemonic. Generated once, stored with the definition, printed in the margin of the PDF in the utility face. Instruct the model to prefer a vivid concrete image over a clever acronym, and to skip the hook entirely rather than produce a strained one — a bad mnemonic is worse than none because the student now has two things to remember.

**Mnemonics for sequences.** Only for genuine ordered or grouped lists of 3–8 items. Acronym if the initials cooperate, sentence mnemonic otherwise.

**Flashcards, generated not asked for.** Every summary produces a deck automatically:
- Term → definition cards
- Cloze deletions from key points (`The reaction is {{c1::exothermic}} because...`)
- Method cards from solved problems: problem statement → strategy (not the full solution — the strategy is what needs recall)
- Exam question → answer

Export to **Anki (`.apkg` via `genanki`-equivalent, or TSV)** and Quizlet-compatible CSV. Students already have review habits; meet them there instead of demanding they move.

**In-app review with SM-2 spaced repetition.** Due-card count on the dashboard, four-button grading (again / hard / good / easy), sessions capped at 20 cards so it fits a bus ride. Keep streaks minimal and non-punitive — no loss framing, no guilt notifications. This audience is stressed enough.

**The one-pager.** A separate render target: everything compressed onto a single A4 sheet using the highlight system — definitions, formulas, the three things most likely to be asked. This is the artifact students photograph and send to the group chat, which makes it your best acquisition channel. Make it beautiful and make it free to generate.

**Self-test mode.** Exam questions with answers hidden, reveal on tap, plus a confidence tag (`got it` / `shaky` / `no idea`) that feeds directly into the spaced-repetition queue. Shaky items get promoted into the next one-pager.

**Later, not now:** TTS audio recap of the "In one minute" section for commute revision, and a "explain this differently" button that regenerates one section at a lower reading level.

**Data model additions:**

```ts
Deck  { _id, summaryId, userId, cardCount, source: 'auto'|'manual', createdAt }
Card  { _id, deckId, front, back, kind, pageRef,
        srs: { ease, intervalDays, dueAt, reps, lapses } }
Review{ _id, cardId, userId, grade, reviewedAt, msTaken }
```

---

## 6. Stack and repo layout

### Two folders, not a monorepo

```
studysheet/
├── frontend/            Next.js 15 — UI *and* all rendering
├── backend/             Express API + BullMQ worker (one codebase, two processes)
├── docker-compose.yml   Mongo, Redis, MinIO (local stand-in for R2)
├── docs/                this spec + the milestone plan
└── README.md
```

Two independent Node projects with their own `package.json`, own lockfile, own deploy. No pnpm workspaces, no shared package linking. That means two problems have to be solved deliberately rather than by workspace magic — read both, they shape the architecture.

**Problem 1: shared types.** The Zod schemas are the single source of truth and they live in `backend/src/contracts/`. A script copies that folder into `frontend/src/contracts/` (generated, committed, marked read-only at the top of each file):

```jsonc
// backend/package.json
"scripts": { "sync:contracts": "node scripts/sync-contracts.mjs" }
```

Run it in `postbuild` on the backend and check in CI that the copy is current (`sync` then `git diff --exit-code`). Never hand-edit the frontend copy. Never let the two definitions drift — a mismatched schema between API and UI is the single most common bug in split-repo setups.

**Problem 2: one renderer, two surfaces.** The PDF must look identical to the preview, but the diagram components are React and live in the frontend. Solution: **the frontend renders the PDF too.**

Next.js serves a print route — `/print/[summaryId]` — that server-renders the full document with print CSS, KaTeX, and the SVG visuals. The backend's Puppeteer worker simply navigates to `${FRONTEND_URL}/print/:id?token=...` and calls `page.pdf()`. One implementation of every visual, zero duplication, and restyling the PDF is a frontend change.

The print route is protected by a short-lived HMAC render token issued by the backend, is `noindex`, and never appears in the app's navigation.

### frontend/

```
frontend/
├── src/app/
│   ├── (marketing)/page.tsx        landing
│   ├── (app)/upload/               upload + config
│   ├── (app)/jobs/[id]/            processing view (SSE)
│   ├── (app)/summaries/[id]/       preview
│   ├── (app)/review/               spaced repetition
│   ├── (app)/library/
│   ├── solve/                      standalone problem solver
│   └── print/[summaryId]/          PDF source of truth — print CSS only
├── src/components/
│   ├── visuals/                    the 10 SVG primitives (§4)
│   ├── document/                   summary sections, highlights, steps
│   └── ui/
├── src/contracts/                  GENERATED — do not edit
├── src/lib/api.ts                  typed fetch client for the backend
└── src/styles/print.css
```

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion (motion only where specified in §9)
- `react-pdf` / `pdf.js` for source page thumbnails — never imported on the landing or print routes
- KaTeX for math (not MathJax — faster, and it server-renders cleanly)
- TanStack Query for server state; SSE for job progress
- `zustand` for upload/config state only

Frontend holds **no business logic and no database access.** It talks to the backend over HTTP and nothing else.

### backend/

```
backend/
├── src/
│   ├── api/            express app: routes, middleware, auth, webhooks
│   ├── worker/         BullMQ processors, one file per pipeline stage
│   ├── pipeline/       probe · prepare · chunk · map · reduce · solve · verify · write
│   ├── ai/             Claude client, model routing, prompts, cost accounting
│   ├── render/         Puppeteer pool → hits the frontend /print route
│   ├── models/         Mongoose schemas
│   ├── contracts/      Zod schemas — SOURCE OF TRUTH
│   ├── billing/        Stripe + Razorpay, webhook handlers
│   └── cli/            probe, summarize, render, eval:solve
├── fixtures/           test PDFs + the 60-problem solve set (§4)
└── scripts/sync-contracts.mjs
```

Two entry points from one codebase: `npm run dev:api` and `npm run dev:worker`. Deploy them as separate services so the worker can scale on queue depth without scaling the API.

- Node.js 20 + Express + TypeScript (Nest is fine if you prefer; keep it boring and typed)
- MongoDB Atlas + Mongoose
- Redis + BullMQ for the processing queue — summarization is long-running, never do it in the request cycle
- S3-compatible object storage (Cloudflare R2) for uploads and generated PDFs, presigned URLs both directions
- `pdf-parse` / `pdftotext -layout` for text-layer detection, `pdftoppm` or `pdf-lib` + `sharp` for page rasterization
- Puppeteer for PDF generation, pointed at the frontend's `/print` route (see above) — keep a warm browser pool, cold-starting Chromium per request blows the latency budget
- `mathjs` for answer verification, plus an optional sandboxed Python + SymPy worker for symbolic checks (§4)
- Anki deck export (`genanki`-equivalent, or TSV) and Quizlet CSV (§5)
- Zod for validation at every boundary
- Auth: Auth.js (email magic link + Google), JWT sessions
- Billing: Stripe, plus Razorpay or Paddle for markets where students don't hold credit cards (§12). Webhooks are the source of truth for entitlement — never grant access from a client-side success redirect.

**AI: Anthropic Claude API** (`https://api.anthropic.com/v1/messages`, SDK: `@anthropic-ai/sdk`)

Model routing — use a tiered approach, don't send everything to the biggest model:

| Task | Model | Why |
|---|---|---|
| Page classification, language detect, dedup checks | `claude-haiku-4-5` | Cheap, fast, high volume |
| Per-chunk extraction and summarization | `claude-sonnet-5` | 1M context, strong, cost-efficient default |
| Final synthesis, exam questions, connections | `claude-opus-5` | Quality matters most here, runs once |

Hard constraints to design around:
- **100 pages max and ~32 MB max per API request** for PDF input. Base64 inflates size ~33%, so a 24 MB file is already at the ceiling.
- Use the **Files API** (upload once, reference by `file_id`) instead of re-sending base64 on every call.
- Dense PDFs burn context faster than page count suggests — roughly 700–1,000 tokens per page as visual input, versus far less as extracted text. **Prefer the text path whenever a good text layer exists.**
- Turn on **prompt caching** for the shared system prompt and any re-referenced document blocks.
- Verify current model IDs and limits at `https://platform.claude.com/docs/en/about-claude/models/overview` and `.../build-with-claude/pdf-support` before shipping — they change.

---

## 7. Processing pipeline

```
1. Upload        → virus/type check, store to R2, create Job (status: queued)
2. Probe         → per page: text layer present? density? rotation? language?
                   Decides text-path vs vision-path per page, not per file.
3. Prepare       → text path:   extract, clean headers/footers/page numbers
                   vision path: render pages at 150–200 DPI, JPEG q80, batch ≤20 pages
4. Chunk         → semantic chunks (heading-aware), 8–15 pages or ~15k tokens,
                   with 1-page overlap so concepts aren't cut mid-explanation
5. Map           → per chunk, Claude returns strict JSON:
                   { definitions[], keyPoints[], formulas[], problems[], pageRefs[] }
6. Reduce        → merge chunks, dedupe by semantic similarity, rank by
                   exam-relevance (frequency × emphasis × syllabus match)
7. Solve         → fan out one call per detected problem (parallel, Sonnet 5)
                   → steps + why + visual spec + memory hook
8. Verify        → independent re-solve + mathjs/SymPy check; disagreement
                   downgrades the problem to "unverified", never drops it   (§4)
9. Write         → single synthesis call produces the final study document JSON
10. Derive       → flashcard deck + one-pager, generated from that JSON with
                   no further model calls                                    (§5)
11. Render       → Puppeteer → GET {FRONTEND_URL}/print/:id?token=… → page.pdf()
                   → R2 → signed URL      (frontend owns the layout, §6)
12. Notify       → SSE completion + optional email
```

Stages 10–12 are pure functions of stage 9's output. Keep them that way: re-rendering, restyling, and regenerating decks must never cost an API call.

**Reliability requirements:**
- Every stage is idempotent and resumable. A failed chunk retries 3× with backoff, then degrades gracefully (mark that page range as "could not read" in the output rather than failing the whole job).
- Store the intermediate JSON in Mongo — regenerating the PDF with different styling must never require re-running the AI.
- Stream partial results to the preview UI as chunks complete. The student sees section one while section four is still processing.
- Cost guard: estimate tokens before starting, show the page count, and refuse jobs over a configurable ceiling with a clear message.

**Prompting notes:**
- Force JSON with a strict schema in the system prompt + a schema reminder in the final user turn. Parse with Zod; on parse failure, retry once with the validation error appended.
- Instruct the model to quote definitions from the source where the source states them precisely, and to rewrite only when the source is unclear. Fabricated definitions are the main quality risk.
- For handwriting, tell the model explicitly to mark uncertain readings rather than guessing — `{ "text": "...", "confidence": "low" }` renders as a subtle underline in the output.
- Solve calls get one problem each, not a batch. Batching problems degrades step quality noticeably and makes the verification pass harder to reason about.
- The verification call must not see the first solution. Same problem, empty context, compare answers only.
- Give the visual-spec schema to the model as a discriminated union with a worked example per `kind`, and tell it that omitting `visual` is the correct choice most of the time.

---

## 8. Data models (Mongoose)

```ts
User      { _id, email, name, plan, isStudentVerified, createdAt }

Subscription { _id, userId, provider: 'stripe'|'razorpay', providerCustomerId,
               providerSubId, tier: 'free'|'student'|'pro'|'semester',
               status: 'active'|'past_due'|'paused'|'canceled',
               pageAllowance, periodStart, periodEnd, pausedUntil }

Usage     { _id, userId, period: '2026-08', pagesUsed, pagesVision, pagesText,
            jobCount, costCents }        // one doc per user per period

Document  { _id, userId, filename, r2Key, sizeBytes, pageCount, fileHash,
            sourceType: 'typed'|'handwritten'|'slides'|'mixed',
            detectedPerPage: [{ page, hasTextLayer, dpi, lang }],
            uploadedAt }

Job       { _id, userId, documentIds[], status, stage, progress: { done, total },
            config: { depth, language, syllabus, sourceType },
            tokensUsed, costCents, error, startedAt, finishedAt }

Summary   { _id, jobId, userId,
            sections: [{ type, title, body, highlights: [{ text, kind, pageRef }] }],
            definitions: [{ term, definition, pageRef, confidence }],
            examQuestions: [{ q, hint, pageRef }],
            problems: [{ ...SolvedProblem, verified: boolean,
                         visual?: VisualSpec, memoryHook }],   // §4
            memoryHooks: [{ termId, hook, kind: 'analogy'|'mnemonic' }],
            connections: [{ from, to, note }],
            outputPdfKey, onePagerKey, deckId, version, createdAt }

// plus Deck / Card / Review from §5
```

Indexes: `Job.userId + createdAt`, `Document.userId`, `Document.fileHash` (dedup — the same file twice must never bill twice), `Usage.userId + period` (unique), `Card.userId + srs.dueAt` (the review queue query), TTL index on anonymous/guest uploads (24h).

---

## 9. Design direction

The brief says futuristic. Interpret that as **precise and instrumented**, not neon-cyberpunk. The reference point is a well-lit desk at 1am, not a spaceship bridge. Avoid the current AI-design defaults: no near-black-plus-acid-green, no cream-and-terracotta, no glassmorphism blur stacks.

**Named direction: "Marker."** The interface is a dark, quiet instrument panel; the *document* is bright paper; the highlighter is the one place color is allowed to shout.

**Palette**
```
--ink        #0A0E1C   app background, deep navy-black
--surface    #141A2E   cards, panels
--edge       #253052   1px borders, dividers
--paper      #FBFAF6   document preview surface only
--amber      #FFC53D   highlighter: definitions
--teal       #3FE0CE   highlighter: exam-critical
--muted      #8791AE   secondary text
```
Amber and teal appear **only** as highlights and their matching legend chips. Every other accent need — links, focus rings, buttons — is solved with weight, spacing, and `--edge`, not another color.

**Type**
- Display: `Clash Display` (Fontshare) — headings, the hero, section numbers
- Body: `Satoshi` — all prose, both UI and generated document
- Utility: `JetBrains Mono` — page refs, progress counters, confidence tags, file sizes

Set a real scale (e.g. 12 / 14 / 16 / 20 / 28 / 44 / 72) and use the mono face wherever the interface is reporting a measurement. That contrast between warm prose and cold data is the personality.

**Signature element — the marker stroke.** When a summary section loads, its highlighted phrases get swept by an actual highlighter stroke: an SVG mask animating left-to-right, 320ms, slightly irregular edge so it reads as a felt-tip pass rather than a CSS background. This is the one animated moment in the app. It fires on section reveal, once, and respects `prefers-reduced-motion` (highlights simply appear).

**Layout**
- Landing: the hero *is* the product — a live before/after, a scrappy scanned page on the left transforming into the marked-up summary on the right. No stat cards, no gradient orbs.
- Upload: full-bleed dropzone, file chips that show page count as soon as the PDF is parsed client-side.
- Processing: a horizontal filmstrip of source page thumbnails that light up as each page is read, with a mono counter (`47 / 112 pages`). This is honest progress, not a fake bar.
- Preview: two-pane — summary left, source page right; clicking a page reference scrolls the source pane.

**Copy rules**
- Sentence case, active voice, no exclamation marks.
- Buttons name the outcome: "Summarize 4 files", "Download study sheet".
- Empty state: "Drop your notes here. PDFs, up to 10 at a time."
- Errors say what happened and what to do: "Page 12 wouldn't read — the scan is too low-resolution. Re-upload that page at 300 DPI or continue without it."

**Quality floor (not negotiable):** responsive to 375px, visible keyboard focus, real `<label>`s, contrast ≥ 4.5:1, reduced-motion respected, no layout shift on load.

---

## 10. API surface

```
POST   /api/uploads/presign        → { uploadUrl, r2Key }
POST   /api/documents              → register uploaded file, returns probe result
POST   /api/jobs                   → { documentIds, config } → { jobId }
GET    /api/jobs/:id               → status snapshot
GET    /api/jobs/:id/stream        → SSE: stage, progress, partial sections
GET    /api/summaries/:id          → full summary JSON
PATCH  /api/summaries/:id          → user edits (toggle a highlight, delete a point)
POST   /api/summaries/:id/render   → regenerate PDF from current JSON
GET    /api/library                → paginated past summaries

POST   /api/solve                  → { problem, subject?, image? } → solved steps
                                     (standalone entry point, no upload)
POST   /api/summaries/:id/onepager → render the single-sheet version

GET    /api/decks/:summaryId       → generated flashcard deck
GET    /api/decks/:id/export       → ?format=anki|csv
GET    /api/review/queue           → cards due now
POST   /api/review/:cardId         → { grade } → next due date

GET    /api/billing/plans          → tiers, localized price + page allowance
POST   /api/billing/checkout       → provider session
POST   /api/billing/portal         → manage / pause / cancel
POST   /api/webhooks/stripe        → entitlement source of truth
POST   /api/webhooks/razorpay      → same
GET    /api/usage                  → pages used / remaining this period
```

Rate limit per user and per IP. Anonymous users get one free 20-page job, stored 24h.

**Quota enforcement lives in one place:** a middleware that reserves pages before a job is queued and releases the reservation if the job fails. Checking the balance in the route handler and decrementing after completion will drift, and students will find the gap.

**Because frontend and backend are separate origins:**
- Frontend calls the backend at `NEXT_PUBLIC_API_URL` through one typed client (`frontend/src/lib/api.ts`). No `fetch` scattered through components.
- CORS allowlists exactly the frontend origin, `credentials: true`. No wildcards, ever.
- Sessions use httpOnly, `SameSite=None; Secure` cookies on a shared parent domain (`app.` and `api.` under the same root). If you can't share a parent domain, use bearer tokens with refresh instead — but shared-domain cookies are simpler and safer.
- CSRF protection on all cookie-authenticated mutations (double-submit token).
- Webhook routes are exempt from CORS and CSRF and verify provider signatures on the **raw** body — mount them before the JSON body parser or signature checks will fail.
- The frontend's `/print` route is the one place it reads a summary directly; it authenticates with the backend-issued render token, not a user session.

---

## 11. Performance targets

- Landing LCP < 1.2s, TTI < 2s, Lighthouse ≥ 95 on all four axes
- First summary section visible within 20s for a 30-page typed PDF
- Full 100-page vision job under 4 minutes
- Bundle: no PDF rendering library on the landing page — code-split `pdf.js` into the upload/preview routes only
- Cache generated PDFs in R2 permanently; never regenerate on download
- The `/print` route must ship **zero client JS** — it's server-rendered HTML, KaTeX CSS, and inline SVG. Any hydration there slows every PDF in the system.
- Deploy frontend and backend in the same region. A chatty cross-region hop between them shows up in every p95 you measure.

---

## 12. Subscription model

### Bill in pages, not documents

Your cost scales with pages processed and with whether those pages need vision. Nothing else. So the unit the customer buys must be pages too — "10 summaries a month" is a plan that loses money the day someone uploads a 400-page textbook.

Show a page balance in the header. Show the page cost *before* the job runs. Never surprise a student with a wall.

### Unit economics — recompute these before you launch

Rough per-page cost at current API pricing (Sonnet 5 for extraction, Opus 5 for the single synthesis call, Haiku 4.5 for probes):

| Path | Input tokens/page | Est. cost/page |
|---|---|---|
| Typed / text layer | ~350 | **~$0.004** |
| Handwritten / scanned (vision) | ~900–1,000 | **~$0.014** |
| + problem solving & verification pass | — | +~$0.002/page |

A 100-page scanned lecture set therefore costs roughly **$1.20–$1.60** to process; the same content as clean typed PDFs costs about **$0.40**. Re-rendering the PDF, flashcard review, and everything in the memory layer cost you effectively nothing — that's your margin engine, and it's why retention features are worth building before growth features.

Instrument `costCents` on every Job from day one. Model estimates drift; measured cost doesn't.

### Tiers

| | Free | Student | Pro | Semester pass |
|---|---|---|---|---|
| Price | $0 | ~$7.99/mo | ~$16.99/mo | ~$29 / 4 months |
| Pages/month | 30 (one-time) | 500 | 1,500 | 2,000 total |
| Files per job | 2 | 10 | 25 | 10 |
| Handwriting | ✓ | ✓ | ✓ | ✓ |
| Step-by-step solving | 5 problems | ✓ | ✓ | ✓ |
| Flashcards + spaced repetition | — | ✓ | ✓ | ✓ |
| Anki / Quizlet export | — | ✓ | ✓ | ✓ |
| One-pager cheat sheet | ✓ | ✓ | ✓ | ✓ |
| Priority queue | — | — | ✓ | — |
| Library retention | 24h | Forever | Forever | Forever |

Assume heavy users hit roughly 40% of their allowance; that keeps Student at ~75–85% gross margin while surviving the worst case where someone burns all 500 pages on scans.

**Never offer unlimited.** One user with a scanned 900-page textbook erases a month of margin from twenty others.

### What students actually do (design around this)

- **Demand spikes and then vanishes.** Usage triples in exam weeks and dies over break. Monthly billing on that curve means brutal churn every semester. The **semester pass is the answer** — 4 months, paid once, priced below 4× monthly. Annual plans are a hard sell to someone who isn't sure they'll be enrolled.
- **Offer pause, not cancel.** A one-tap "pause until September" recovers a large share of would-be cancellations.
- **Many have no credit card.** Support UPI, wallets, and local rails — Razorpay or Paddle alongside Stripe. Payment friction kills more student conversions than price does.
- **Regional pricing: adjust the page allowance, not just the price.** Dropping the Student tier to ₹199 with the same 500 pages is a loss-making plan. Drop the price and set the cap at ~150 pages, and it holds margin at a price that market will actually pay.
- **Verify student status** (SheerID or `.edu`/`.ac.*` email) for the discounted tiers, or the discount becomes your only tier.

### Free tier design

Generous enough to complete one real assignment — 30 pages, all features that produce the *output*. **No watermark on the free PDF.** A watermarked sheet doesn't get shared, and sharing is your entire acquisition channel. Put a small tasteful "Made with [product]" line in the footer instead, linked.

What the free tier withholds is the *ongoing* value: no saved library past 24 hours, no flashcards, no spaced repetition. They get the artifact; they subscribe for the semester.

### Growth loop

Shared one-pagers → footer link → new signup → their own upload. Support it deliberately: shareable read-only summary URLs, an "invite your class" flow, and group plans (5 seats at a discount) since students revise in groups and buy in groups. Campus ambassadors work in this category; ads mostly don't.

### Abuse and margin protection

- Per-job page ceiling, per-day page ceiling, per-IP limits on the free tier
- Cost guard: a job whose estimate exceeds a configurable threshold requires explicit confirmation
- Deduplicate by file hash — the same PDF processed twice returns the cached summary and costs the user nothing
- Reject files under a text-density threshold with a helpful error rather than burning tokens on blank scans

### Legal and academic-integrity posture

Two risks worth handling before they find you:

1. **Copyright.** Students will upload copyrighted textbooks. Keep uploads private to the uploading account, never build a public shared library of uploaded source material, publish a DMCA process and a designated agent, and terminate repeat infringers. Personal study use is the framing; a searchable repository of textbook summaries is a different, much riskier product.
2. **Academic integrity.** Position this as revision and comprehension, and be honest in the marketing. Keep the "AI-generated study aid — verify against your course material" footer. Don't add a feature that completes graded take-home work; universities ban tools that do, and a campus ban ends the growth loop.

### Metrics that matter

Activation = downloaded their first study sheet. Retention = returned and processed a second document within 30 days. Then gross margin per tier, cost per job by path, verification pass rate, and semester-cohort renewal. Watch cost-per-active-user weekly — in this product, a quality regression and a margin collapse look identical in the numbers until you separate them.

---

## 13. Build order

1. Both folders scaffolded, `backend/src/contracts` + the sync script, env config, Docker compose (Mongo + Redis + MinIO)
2. Upload → R2 → probe pipeline, with a CLI script to test locally before any UI
3. Queue + text-path summarization end to end, output raw JSON to console
4. Vision path + auto-detect
5. **Solve + verify loop**, still CLI-only. Build a fixture set of 60 problems with known answers across your target subjects and measure the pass rate before writing any UI for it. This is the feature most likely to be quietly broken.
6. `frontend/src/components/visuals` — all ten primitives plus a gallery route
7. The `/print` route + backend Puppeteer worker — get the PDF beautiful before the app UI
8. Rest of the Next.js app: landing, upload, processing, preview
9. Auth, library, rate limits, cost guards
10. Flashcard generation + Anki/CSV export, then in-app SM-2 review
11. Billing: plans, checkout, webhooks, quota middleware, usage dashboard
12. Polish pass: motion, empty states, errors, mobile

Ship 1–9 as a free beta to one campus before adding billing. You need real usage data to set the page allowances, and the fixture pass rate to know solving is trustworthy enough to charge for.

Write tests for the chunker, the JSON parser/repair, the dedup logic, the highlight cap, the SRS scheduler, and the quota reservation/release path. Those are where the bugs will be.

## 14. Environment

Two files. Nothing secret ever goes in the frontend's — `NEXT_PUBLIC_*` is shipped to the browser in plain text.

**`backend/.env`**
```
NODE_ENV= PORT=4000
FRONTEND_URL=http://localhost:3000     # Puppeteer targets this for /print
CORS_ORIGIN=http://localhost:3000

ANTHROPIC_API_KEY=
MONGODB_URI=
REDIS_URL=
R2_ACCOUNT_ID= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET=

AUTH_SECRET=
RENDER_TOKEN_SECRET=                   # HMAC for /print access
COOKIE_DOMAIN=.studysheet.app

STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET=
RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET=

MAX_PAGES_PER_JOB=200
MAX_FILE_MB=32
FREE_TIER_PAGES=30
COST_GUARD_CENTS=250                   # job estimate above this needs confirmation
SOLVE_VERIFICATION=on                  # never ship with this off
SOLVE_MAX_PER_JOB=40
WORKER_CONCURRENCY=4
PUPPETEER_POOL_SIZE=2
```

**`frontend/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
RENDER_TOKEN_SECRET=                   # server-side only, verifies /print tokens
```

Validate both with Zod at boot and refuse to start on a missing value, naming it in the error.

## 15. Done means

- [ ] A 40-page scanned handwritten PDF produces a correct, readable, highlighted study sheet
- [ ] Four related lecture PDFs merge into one deduplicated document with a working Connections section
- [ ] Every key point links to a real source page
- [ ] Killing the worker mid-job and restarting resumes without re-billing completed chunks
- [ ] The generated PDF prints correctly on A4 and US Letter, highlights included
- [ ] The whole flow works on a phone
- [ ] The 60-problem fixture set passes verification at ≥95%, and every failure is visibly flagged rather than silently wrong
- [ ] A photographed single problem returns correct steps in under 15 seconds
- [ ] Every diagram is legible printed in greyscale
- [ ] Flashcards export into Anki and review correctly
- [ ] Restyling and re-downloading a summary makes zero API calls
- [ ] Uploading the same file twice bills once
- [ ] A subscription upgrade, pause, and cancel each land correctly via webhook with the client offline
- [ ] Measured gross margin on the Student tier holds above 70% at the 90th-percentile usage in your beta data
- [ ] `frontend` and `backend` each build, test, and deploy independently from a clean clone
- [ ] Contract drift is impossible: CI fails if the synced schemas differ from the backend source
- [ ] The PDF and the on-screen preview are visually identical, because both come from the same components
