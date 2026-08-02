# StudySheet

A web app where a student uploads one or many PDFs (lecture notes, textbook chapters, scanned
handwriting, slide decks) and gets back a single clean, printable revision PDF written in plain
language, with key definitions and key points visually highlighted — the thing they'd actually
read the night before an exam.

Full spec: [`docs/studysheet-build-prompt.md`](docs/studysheet-build-prompt.md).
Build order and per-milestone gates: [`docs/studysheet-milestones.md`](docs/studysheet-milestones.md).
Standing rules and current status: [`CLAUDE.md`](CLAUDE.md).

## Quickstart

```
make up          # start Mongo, Redis, MinIO (docker compose)
make install     # npm install in backend/ and frontend/
```

Then copy the env examples and fill in as needed:

```
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

```
make dev         # api + worker + frontend dev servers together
make verify      # lint + typecheck + test in both folders
```

## Layout

Two independent Node projects, not a monorepo — see `CLAUDE.md` for why and what that implies.

```
studysheet/
├── frontend/            Next.js 15 (App Router) + React 19 — UI and all PDF/preview rendering
├── backend/              Express API + BullMQ worker
├── docker-compose.yml    Mongo, Redis, MinIO (local stand-in for Cloudflare R2)
└── docs/                 the build-prompt spec + the milestone plan
```
