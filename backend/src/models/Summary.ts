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
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const SummaryModel = model<SummaryAttrs>('Summary', SummaryMongooseSchema);
