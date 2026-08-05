import { Router } from 'express';
import { z } from 'zod';
import { SummaryModel } from '../../models/Summary';
import { JobModel } from '../../models/Job';
import { DocumentModel } from '../../models/Document';
import { asyncHandler } from '../asyncHandler';
import type { LibraryResponse } from '../../contracts';

export const libraryRouter = Router();

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const LibraryQuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().default(0),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// docs/studysheet-build-prompt.md §10: "GET /api/library → paginated past
// summaries". Summary itself doesn't store filename/pageCount (that's the
// Document's), so this joins Summary -> Job -> Document in two extra batched
// queries (never per-row) rather than denormalizing those fields onto every
// Summary at creation time. SummaryMongooseSchema's userId+createdAt index
// (models/Summary.ts) is what keeps the sort+paginate query itself cheap.
libraryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = LibraryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }
    const { page, pageSize } = parsed.data;
    const { userId } = req.identity;

    const [summaries, total] = await Promise.all([
      SummaryModel.find({ userId })
        .sort({ createdAt: -1 })
        .skip(page * pageSize)
        .limit(pageSize),
      SummaryModel.countDocuments({ userId }),
    ]);

    const jobs = await JobModel.find({ _id: { $in: summaries.map((s) => s.jobId) } });
    const jobById = new Map(jobs.map((j) => [j.id, j]));

    const firstDocumentIds = jobs.map((j) => j.documentIds[0]).filter((id): id is string => Boolean(id));
    const documents = await DocumentModel.find({ _id: { $in: firstDocumentIds } });
    const documentById = new Map(documents.map((d) => [d.id, d]));

    const items = summaries.map((summary) => {
      const job = jobById.get(summary.jobId);
      const document = job?.documentIds[0] ? documentById.get(job.documentIds[0]) : undefined;
      return {
        summaryId: summary.id,
        jobId: summary.jobId,
        filename: document?.filename ?? 'unknown',
        pageCount: document?.pageCount ?? 0,
        createdAt: summary.createdAt.toISOString(),
      };
    });

    const body: LibraryResponse = { items, page, pageSize, total };
    res.json(body);
  }),
);
