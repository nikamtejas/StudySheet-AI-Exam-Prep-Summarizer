import { z } from 'zod';

export const SourceTypeSchema = z.enum(['typed', 'handwritten', 'slides', 'mixed']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const DepthSchema = z.enum(['crash', 'balanced', 'deep']);
export type Depth = z.infer<typeof DepthSchema>;

export const SubjectSchema = z.enum([
  'math',
  'physics',
  'chemistry',
  'cs',
  'economics',
  'biology',
  'other',
]);
export type Subject = z.infer<typeof SubjectSchema>;

export const HighlightKindSchema = z.enum(['definition', 'exam-critical']);
export type HighlightKind = z.infer<typeof HighlightKindSchema>;
