import { Router } from 'express';
import mongoose from 'mongoose';
import { SummaryModel, type SummaryInstance } from '../../models/Summary';
import { verifyAndConsumeRenderToken } from '../../lib/renderToken';
import { enforceHighlightCap } from '../../pipeline/highlightCap';
import { asyncHandler } from '../asyncHandler';
import type { SummaryDTO } from '../../contracts';

export const renderRouter = Router();

// The highlight cap is a render-time concern only — it never touches the
// persisted Summary, so a future interactive web preview (M7) can still show
// every highlight if it wants to.
function toRenderDTO(doc: SummaryInstance): SummaryDTO {
  return {
    id: doc._id.toString(),
    jobId: doc.jobId,
    userId: doc.userId,
    sections: enforceHighlightCap(doc.sections),
    definitions: doc.definitions,
    examQuestions: doc.examQuestions,
    problems: doc.problems,
    connections: doc.connections,
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
  };
}

// A dedicated, narrow read path for the print flow only — token-gated, not
// session-gated. Separate from the future session-authed GET
// /api/summaries/:id (M8's job): that route will serve the logged-in app,
// this one serves exactly one caller (the frontend's /print route) and
// exactly one credential (a single-use render token), per
// docs/studysheet-build-prompt.md §10: "The frontend's /print route ... it
// authenticates with the backend-issued render token, not a user session."
renderRouter.get(
  '/:summaryId',
  asyncHandler(async (req, res) => {
    const summaryId = req.params.summaryId;
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    if (!summaryId || !token || !(await verifyAndConsumeRenderToken(token, summaryId))) {
      res.status(403).json({ error: 'invalid_or_expired_token' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(summaryId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const summary = await SummaryModel.findById(summaryId);
    if (!summary) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    res.json(toRenderDTO(summary));
  }),
);
