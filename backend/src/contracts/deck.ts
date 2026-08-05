import { z } from 'zod';

// docs/studysheet-build-prompt.md §5: four kinds of auto-generated cards.
// 'exam' only exists for an ExamQuestion that actually has a `hint` — there's
// no stored canonical answer to an exam question anywhere in Summary, and
// reliability invariant 5's spirit (degrade visibly, never fabricate) rules
// out inventing one, so questions without a hint simply don't get a card.
export const CardKindSchema = z.enum(['basic', 'cloze', 'method', 'exam']);
export type CardKind = z.infer<typeof CardKindSchema>;

// SM-2 (modified, Anki-style four-button grading — pipeline/sm2.ts).
export const SrsStateSchema = z.object({
  ease: z.number(),
  intervalDays: z.number().nonnegative(),
  dueAt: z.string(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
});
export type SrsState = z.infer<typeof SrsStateSchema>;

export const CardSchema = z.object({
  id: z.string(),
  deckId: z.string(),
  userId: z.string(),
  // For 'cloze' cards, `front` keeps the raw {{c1::term}} markup (so Anki
  // TSV export, pipeline/export/ankiTsv.ts, can use it verbatim with Anki's
  // real Cloze note type) — the in-app review UI parses this itself to show
  // a blanked sentence rather than storing a separately-rendered copy.
  front: z.string(),
  back: z.string(),
  kind: CardKindSchema,
  pageRef: z.number().int().positive(),
  srs: SrsStateSchema,
});
export type CardDTO = z.infer<typeof CardSchema>;

export const DeckSchema = z.object({
  id: z.string(),
  summaryId: z.string(),
  userId: z.string(),
  cardCount: z.number().int().nonnegative(),
  source: z.enum(['auto', 'manual']),
  createdAt: z.string(),
});
export type DeckDTO = z.infer<typeof DeckSchema>;

// docs/studysheet-build-prompt.md §5: "four-button grading (again / hard /
// good / easy)".
export const GradeSchema = z.enum(['again', 'hard', 'good', 'easy']);
export type Grade = z.infer<typeof GradeSchema>;

export const ReviewGradeRequestSchema = z.object({
  grade: GradeSchema,
  // Client-measured time from showing the card's front to submitting a
  // grade — the server has no way to know this itself (msTaken measures the
  // student's thinking time, not request processing time). Defaults to 0
  // for callers that don't track it (e.g. self-test mode's confidence tags,
  // which reuse this same endpoint — see api/routes/review.ts).
  msTaken: z.number().int().nonnegative().default(0),
});
export type ReviewGradeRequest = z.infer<typeof ReviewGradeRequestSchema>;

export const ReviewGradeResponseSchema = z.object({
  card: CardSchema,
});
export type ReviewGradeResponse = z.infer<typeof ReviewGradeResponseSchema>;

// docs/studysheet-build-prompt.md §5: "sessions capped at 20 cards so it
// fits a bus ride" — `cards` is already capped server-side; `dueCount` is
// the *total* due (uncapped), so the UI can show "20 of 47 due" honestly
// rather than implying 20 is all there is.
export const ReviewQueueResponseSchema = z.object({
  cards: z.array(CardSchema),
  dueCount: z.number().int().nonnegative(),
});
export type ReviewQueueResponse = z.infer<typeof ReviewQueueResponseSchema>;

export const DeckResponseSchema = z.object({
  deck: DeckSchema,
  cards: z.array(CardSchema),
});
export type DeckResponse = z.infer<typeof DeckResponseSchema>;

// Three concrete downloadable files rather than one ambiguous "anki" format
// — a deck's cloze cards need Anki's Cloze note type (a single Text field),
// which can't share a file with Basic cards' Front/Back columns
// (pipeline/export/ankiTsv.ts).
export const ExportFormatSchema = z.enum(['anki-basic', 'anki-cloze', 'quizlet']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
