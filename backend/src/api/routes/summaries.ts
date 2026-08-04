import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { SummaryModel } from '../../models/Summary';
import { renderSummary, type RenderSize } from '../../pipeline/render';
import { asyncHandler } from '../asyncHandler';

export const summariesRouter = Router();

const RenderRequestSchema = z.object({
  variant: z.enum(['full', 'appendix']).default('full'),
  size: z.enum(['a4', 'letter']).default('a4'),
});

async function summaryExists(summaryId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(summaryId)) return false;
  return (await SummaryModel.exists({ _id: summaryId })) !== null;
}

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
    if (!summaryId || !(await summaryExists(summaryId))) {
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
    if (!summaryId || !(await summaryExists(summaryId))) {
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
