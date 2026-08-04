import { Router } from 'express';
import { SolveRequestSchema } from '../../contracts';
import { solveOne } from '../../pipeline/verify';
import { asyncHandler } from '../asyncHandler';

export const solveRouter = Router();

// docs/studysheet-build-prompt.md §10: "POST /api/solve → { problem,
// subject?, image? } → solved steps (standalone entry point, no upload)" —
// the paste/photo single-problem flow, first-class per §4, not a hidden
// feature. Reuses solveOne() unchanged (M4) — same independent-verification
// guarantee as problems solved during a real document job.
solveRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = SolveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    // pageRef doesn't apply to a standalone solve (no source document) —
    // solveOne() requires one only because it's shared with the per-document
    // "solving" pipeline stage; omitted from the response below.
    const { data } = await solveOne({ statement: parsed.data.problem, pageRef: 1 });

    res.json({
      problem: data.problem,
      subject: data.subject,
      given: data.given,
      goal: data.goal,
      strategy: data.strategy,
      steps: data.steps,
      answer: data.answer,
      check: data.check,
      commonMistake: data.commonMistake,
      visual: data.visual,
      memoryHook: data.memoryHook,
      verified: data.verified,
      verificationNote: data.verificationNote,
    });
  }),
);
