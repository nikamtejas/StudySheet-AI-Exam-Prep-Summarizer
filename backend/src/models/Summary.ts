import { Schema, model, type HydratedDocument } from 'mongoose';
import type { Section, Definition, ExamQuestion, Connection, VerifiedProblem } from '../contracts';

export interface SummaryAttrs {
  jobId: string;
  userId: string;
  sections: Section[];
  definitions: Definition[];
  examQuestions: ExamQuestion[];
  problems: VerifiedProblem[];
  connections: Connection[];
  version: number;
  createdAt: Date;
  // See models/Job.ts's anonymousExpiresAt — same TTL-cleanup mechanism.
  anonymousExpiresAt: Date | null;
  // Set once pipeline/decks.ts generates a deck for this summary — M9's
  // "every summary produces a deck automatically" (§5), hooked into
  // pipeline/orchestrate.ts right after this document is created. Null for
  // summaries that predate M9 or whose auto-generation failed; GET
  // /api/decks/:summaryId generates lazily on first request in that case.
  deckId: string | null;
}

export type SummaryInstance = HydratedDocument<SummaryAttrs>;

const HighlightMongooseSchema = new Schema(
  {
    text: { type: String, required: true },
    kind: { type: String, enum: ['definition', 'exam-critical'], required: true },
    pageRef: { type: Number, required: true },
  },
  { _id: false },
);

const SectionMongooseSchema = new Schema<Section>(
  {
    type: {
      type: String,
      enum: [
        'in-one-minute',
        'core-concepts',
        'formulas',
        'exam-questions',
        'common-confusions',
        'connections',
        'page-map',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    highlights: { type: [HighlightMongooseSchema], default: [] },
  },
  { _id: false },
);

const DefinitionMongooseSchema = new Schema<Definition>(
  {
    term: { type: String, required: true },
    definition: { type: String, required: true },
    pageRef: { type: Number, required: true },
    confidence: { type: String, enum: ['high', 'low'], default: 'high' },
  },
  { _id: false },
);

const ExamQuestionMongooseSchema = new Schema<ExamQuestion>(
  {
    q: { type: String, required: true },
    hint: { type: String },
    pageRef: { type: Number, required: true },
  },
  { _id: false },
);

const ConnectionMongooseSchema = new Schema<Connection>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    note: { type: String, required: true },
  },
  { _id: false },
);

const SummaryMongooseSchema = new Schema<SummaryAttrs>(
  {
    jobId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    sections: { type: [SectionMongooseSchema], default: [] },
    definitions: { type: [DefinitionMongooseSchema], default: [] },
    examQuestions: { type: [ExamQuestionMongooseSchema], default: [] },
    // Already Zod-validated (VerifiedProblemSchema) before it reaches here —
    // stored as one Mixed blob rather than re-encoding the discriminated
    // VisualSpec union in Mongoose schema syntax, same pattern as
    // Job.reduced. A bare (non-array) `Schema.Types.Mixed` is the form
    // Mongoose's TS types accept for an array-shaped field like this one.
    problems: { type: Schema.Types.Mixed, default: [] },
    connections: { type: [ConnectionMongooseSchema], default: [] },
    version: { type: Number, default: 1 },
    anonymousExpiresAt: { type: Date, default: null },
    deckId: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The library's paginated "past summaries for this user" query (api/routes/library.ts).
SummaryMongooseSchema.index({ userId: 1, createdAt: -1 });
SummaryMongooseSchema.index({ anonymousExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const SummaryModel = model<SummaryAttrs>('Summary', SummaryMongooseSchema);
