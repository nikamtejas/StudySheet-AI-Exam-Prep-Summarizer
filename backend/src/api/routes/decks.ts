import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { SummaryModel } from '../../models/Summary';
import { DeckModel } from '../../models/Deck';
import { CardModel } from '../../models/Card';
import { getOrGenerateDeck, toCardDTO } from '../../pipeline/decks';
import { exportAnkiTsv } from '../../pipeline/export/ankiTsv';
import { exportQuizletCsv } from '../../pipeline/export/quizletCsv';
import { ExportFormatSchema } from '../../contracts';
import { asyncHandler } from '../asyncHandler';
import type { DeckResponse, ExportFormat } from '../../contracts';

export const decksRouter = Router();

// docs/studysheet-build-prompt.md §10: "GET /api/decks/:summaryId →
// generated flashcard deck". Generates lazily on first request if the
// automatic hook (pipeline/orchestrate.ts, right after Summary creation)
// hasn't already run — e.g. a summary from before M9 shipped.
decksRouter.get(
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

    const deck = await getOrGenerateDeck(summaryId);
    if (!deck) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const cards = await CardModel.find({ deckId: deck.id });
    const body: DeckResponse = { deck, cards: cards.map(toCardDTO) };
    res.json(body);
  }),
);

const ExportQuerySchema = z.object({ format: ExportFormatSchema });

const CONTENT_TYPES: Record<ExportFormat, string> = {
  'anki-basic': 'text/tab-separated-values',
  'anki-cloze': 'text/tab-separated-values',
  quizlet: 'text/csv',
};

const FILENAMES: Record<ExportFormat, string> = {
  'anki-basic': 'anki-basic.tsv',
  'anki-cloze': 'anki-cloze.tsv',
  quizlet: 'quizlet.csv',
};

// docs/studysheet-build-prompt.md §10: "GET /api/decks/:id/export →
// ?format=anki|csv" — three concrete formats here (see contracts/deck.ts's
// ExportFormatSchema comment for why cloze can't share a file with basic).
decksRouter.get(
  '/:deckId/export',
  asyncHandler(async (req, res) => {
    const deckId = req.params.deckId;
    if (!deckId || !mongoose.Types.ObjectId.isValid(deckId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const parsed = ExportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const deck = await DeckModel.findById(deckId);
    if (!deck || deck.userId !== req.identity.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const cards = await CardModel.find({ deckId: deck.id });
    const cardDTOs = cards.map(toCardDTO);
    const { format } = parsed.data;

    const body =
      format === 'quizlet' ? exportQuizletCsv(cardDTOs) : exportAnkiTsv(cardDTOs)[format === 'anki-basic' ? 'basic' : 'cloze'];

    res.setHeader('Content-Type', CONTENT_TYPES[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${FILENAMES[format]}"`);
    res.send(body);
  }),
);
