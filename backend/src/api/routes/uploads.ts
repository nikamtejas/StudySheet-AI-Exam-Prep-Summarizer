import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { PresignRequestSchema } from '../../contracts';
import { createPresignedUploadUrl } from '../../lib/storage';
import { asyncHandler } from '../asyncHandler';
import { perUserUploadLimit, perIpUploadLimit } from '../middleware/rateLimit';

export const uploadsRouter = Router();

uploadsRouter.post(
  '/presign',
  perUserUploadLimit,
  perIpUploadLimit,
  asyncHandler(async (req, res) => {
    const parsed = PresignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', details: parsed.error.issues });
      return;
    }

    const { filename, contentType } = parsed.data;
    // Provisional key — we don't know the file's content hash until it's
    // uploaded and probed (pipeline/ingest.ts), so this is keyed by a random id
    // rather than the hash.
    const r2Key = `uploads/${randomUUID()}/${filename}`;
    const uploadUrl = await createPresignedUploadUrl(r2Key, contentType);

    res.json({ uploadUrl, r2Key });
  }),
);
