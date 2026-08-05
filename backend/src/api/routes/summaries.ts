import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { SummaryModel, type SummaryInstance } from '../../models/Summary';
import { JobModel } from '../../models/Job';
import { DocumentModel } from '../../models/Document';
import { renderSummary, type RenderSize } from '../../pipeline/render';
import { createPresignedDownloadUrl } from '../../lib/storage';
import { asyncHandler } from '../asyncHandler';
import type { SummaryDTO } from '../../contracts';

export const summariesRouter = Router();

const RenderRequestSchema = z.object({
  variant: z.enum(['full', 'appendix']).default('full'),
  size: z.enum(['a4', 'letter']).default('a4'),
});

// Ownership, not just existence — a summaryId belonging to another identity
// comes back identical to an unknown id (404), never a distinguishing 403
// (docs/studysheet-milestones.md M8: "a user cannot read another user's ...
// summary, or PDF").
async function summaryOwnedBy(summaryId: string, userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(summaryId)) return false;
  return (await SummaryModel.exists({ _id: summaryId, userId })) !== null;
}

function toSummaryDTO(doc: SummaryInstance): SummaryDTO {
  return {
    id: doc._id.toString(),
    jobId: doc.jobId,
    userId: doc.userId,
    sections: doc.sections,
    definitions: doc.definitions,
    examQuestions: doc.examQuestions,
    problems: doc.problems,
    connections: doc.connections,
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
  };
}

// docs/studysheet-build-prompt.md §10: "GET /api/summaries/:id → full
// summary JSON". Scoped to the requesting identity (api/middleware/identity.ts)
// since M8. Unlike GET /api/render/:summaryId (M6, a differently-secured
// service-to-service route gated by a signed render token, not a session —
// left untouched here), this one never applies the render-time highlight
// cap — that's specific to the print path, the web preview shows every
// highlight.
summariesRouter.get(
  '/:summaryId',
  asyncHandler(async (req, res) => {
    const summaryId = req.params.summaryId;
    if (!summaryId || !mongoose.Types.ObjectId.isValid(summaryId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const summary = await SummaryModel.findById(summaryId);
    if (!summary || summary.userId !== req.identity.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json(toSummaryDTO(summary));
  }),
);

// Not in the original API surface list (§10) — added for M7's preview view,
// which needs the source PDF to render alongside the summary for page-ref
// jumping. Joins Summary -> Job -> Document server-side (three round trips
// the frontend would otherwise have to make itself with no single ID
// linking them directly) and returns a presigned download URL, matching how
// M6's render pipeline already fetches source PDFs. Single-document jobs
// only, same limitation pipeline/orchestrate.ts's "queued" stage already
// has (cross-document "connections" is explicitly a later, unbuilt feature).
summariesRouter.get(
  '/:summaryId/source',
  asyncHandler(async (req, res) => {
    const summaryId = req.params.summaryId;
    if (!summaryId || !mongoose.Types.ObjectId.isValid(summaryId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const summary = await SummaryModel.findById(summaryId);
    if (!summary || summary.userId !== req.identity.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const job = await JobModel.findById(summary.jobId);
    const documentId = job?.documentIds[0];
    if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
      res.status(404).json({ error: 'source_not_found' });
      return;
    }

    const document = await DocumentModel.findById(documentId);
    if (!document) {
      res.status(404).json({ error: 'source_not_found' });
      return;
    }

    const url = await createPresignedDownloadUrl(document.r2Key);
    res.json({ url, filename: document.filename, pageCount: document.pageCount });
  }),
);

// docs/studysheet-build-prompt.md §10: "POST /api/summaries/:id/render →
// regenerate PDF from current JSON". Synchronous, not queued through BullMQ
// — rendering has zero AI calls and completes in well under a second on a
// warm pool (measured directly), so reliability invariant 1 ("no AI call in
// a request/response cycle") doesn't apply here the way it does to
// summarization.
summariesRouter.post(
  '/:summaryId/render',
  asyncHandler(async (req, res) => {
    const summaryId = req.params.summaryId;
    if (!summaryId || !(await summaryOwnedBy(summaryId, req.identity.userId))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const parsed = RenderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const { variant, size } = parsed.data;
    const result = await renderSummary(summaryId, variant, size as RenderSize);
    res.json(result);
  }),
);

const OnePagerRequestSchema = z.object({
  size: z.enum(['a4', 'letter']).default('a4'),
});

// docs/studysheet-build-prompt.md §10: "POST /api/summaries/:id/onepager →
// render the single-sheet version" — a dedicated endpoint since it's a
// distinct, frequently-requested artifact (§5: "the one-pager ... this is
// the artifact students photograph and send to the group chat"), not just
// another /render variant value.
summariesRouter.post(
  '/:summaryId/onepager',
  asyncHandler(async (req, res) => {
    const summaryId = req.params.summaryId;
    if (!summaryId || !(await summaryOwnedBy(summaryId, req.identity.userId))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const parsed = OnePagerRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const result = await renderSummary(summaryId, 'onepager', parsed.data.size as RenderSize);
    res.json(result);
  }),
);

// docs/studysheet-milestones.md M8: library "re-download, delete". Only the
// Summary itself is removed — the source Document and Job stay (they're
// small metadata, and deleting them would break re-render from the same
// upload); nothing else in the API surface exposes a deleted summary's id
// again once this returns.
summariesRouter.delete(
  '/:summaryId',
  asyncHandler(async (req, res) => {
    const summaryId = req.params.summaryId;
    if (!summaryId || !(await summaryOwnedBy(summaryId, req.identity.userId))) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    await SummaryModel.deleteOne({ _id: summaryId });
    res.status(204).end();
  }),
);
