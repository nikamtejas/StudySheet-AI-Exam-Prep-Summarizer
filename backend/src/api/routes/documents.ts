import { Router } from 'express';
import { CreateDocumentRequestSchema } from '../../contracts';
import { ingestDocument } from '../../pipeline/ingest';
import { DocumentValidationError } from '../../pipeline/errors';
import { asyncHandler } from '../asyncHandler';

export const documentsRouter = Router();

documentsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = CreateDocumentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const { r2Key, filename, sourceType, userId } = parsed.data;

    try {
      const result = await ingestDocument({ userId, filename, r2Key, sourceType });
      res.status(result.dedup ? 200 : 201).json(result);
    } catch (err) {
      if (err instanceof DocumentValidationError) {
        res.status(422).json({ error: err.reason, message: err.message });
        return;
      }
      throw err;
    }
  }),
);
