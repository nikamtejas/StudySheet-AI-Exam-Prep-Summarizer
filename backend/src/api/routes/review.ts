import { Router } from 'express';
import mongoose from 'mongoose';
import { CardModel } from '../../models/Card';
import { ReviewModel } from '../../models/Review';
import { applyGrade } from '../../pipeline/sm2';
import { toCardDTO } from '../../pipeline/decks';
import { ReviewGradeRequestSchema } from '../../contracts';
import { asyncHandler } from '../asyncHandler';
import type { ReviewQueueResponse, ReviewGradeResponse } from '../../contracts';

export const reviewRouter = Router();

// docs/studysheet-build-prompt.md §5: "sessions capped at 20 cards so it
// fits a bus ride."
const SESSION_SIZE = 20;

// docs/studysheet-build-prompt.md §10: "GET /api/review/queue → cards due
// now". The Card.userId + srs.dueAt compound index (models/Card.ts) is what
// keeps this under the M9 gate's 50ms-at-10k-cards budget — confirmed
// directly, test/review-queue-perf.test.ts.
reviewRouter.get(
  '/queue',
  asyncHandler(async (req, res) => {
    const { userId } = req.identity;
    const now = new Date();
    const dueFilter = { userId, 'srs.dueAt': { $lte: now } };

    const [cards, dueCount] = await Promise.all([
      CardModel.find(dueFilter).sort({ 'srs.dueAt': 1 }).limit(SESSION_SIZE),
      CardModel.countDocuments(dueFilter),
    ]);

    const body: ReviewQueueResponse = { cards: cards.map(toCardDTO), dueCount };
    res.json(body);
  }),
);

// docs/studysheet-build-prompt.md §10: "POST /api/review/:cardId → { grade }
// → next due date".
reviewRouter.post(
  '/:cardId',
  asyncHandler(async (req, res) => {
    const cardId = req.params.cardId;
    if (!cardId || !mongoose.Types.ObjectId.isValid(cardId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const parsed = ReviewGradeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const card = await CardModel.findById(cardId);
    if (!card || card.userId !== req.identity.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const now = new Date();
    const next = applyGrade(card.srs, parsed.data.grade, now);
    card.srs = next;
    await card.save();

    await ReviewModel.create({
      cardId: card.id,
      userId: req.identity.userId,
      grade: parsed.data.grade,
      reviewedAt: now,
      msTaken: parsed.data.msTaken,
    });

    const body: ReviewGradeResponse = { card: toCardDTO(card) };
    res.json(body);
  }),
);
