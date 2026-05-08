/**
 * Module 4 preclinical ingestion route.
 *
 *   POST /api/preclinical/ingest
 *   Multipart body:
 *     - programId  (number, required)  ID of the parent ctd_programs row.
 *     - sourcePdfId (string, optional) Caller-provided handle for provenance.
 *     - file       (PDF, required)     Single nonclinical study report PDF.
 *
 * Returns 503 when PRECLINICAL_INGEST_ENABLED is not set, 400 on a bad
 * request, and 422 when the LLM output fails the Zod schema. On success
 * returns { studyId, extractionConfidence, model }.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';

import { PRECLINICAL_INGEST_ENABLED } from '../services/preclinical/feature-flags';
import {
  ingestStudy,
  PreclinicalIngestDisabledError,
} from '../services/preclinical/preclinical-ingest-service';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('preclinical-routes');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

const router = Router();

router.post(
  '/ingest',
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!PRECLINICAL_INGEST_ENABLED) {
      return res.status(503).json({
        success: false,
        error: 'Preclinical ingest is disabled',
        code: 'PRECLINICAL_INGEST_DISABLED',
      });
    }

    const programIdRaw = req.body?.programId;
    const programId = Number.parseInt(String(programIdRaw ?? ''), 10);
    if (!Number.isInteger(programId) || programId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'programId is required and must be a positive integer',
        code: 'PRECLINICAL_INGEST_BAD_PROGRAM_ID',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'file is required (multipart field "file", application/pdf)',
        code: 'PRECLINICAL_INGEST_NO_FILE',
      });
    }

    const sourcePdfId =
      typeof req.body?.sourcePdfId === 'string' && req.body.sourcePdfId.trim().length > 0
        ? String(req.body.sourcePdfId).slice(0, 64)
        : `pdf-${randomUUID()}`;

    try {
      const result = await ingestStudy({
        programId,
        pdfBuffer: req.file.buffer,
        sourcePdfId,
      });

      log.info('Preclinical study ingested', {
        programId,
        studyId: result.studyId,
        sourcePdfId,
        confidence: result.extractionConfidence,
      });

      return res.status(200).json({
        success: true,
        data: {
          studyId: result.studyId,
          sourcePdfId,
          extractionConfidence: result.extractionConfidence,
          model: result.model,
        },
      });
    } catch (err) {
      if (err instanceof PreclinicalIngestDisabledError) {
        return res.status(503).json({
          success: false,
          error: err.message,
          code: 'PRECLINICAL_INGEST_DISABLED',
        });
      }
      const message = err instanceof Error ? err.message : 'unknown error';
      const isZodLike = /Invalid|expected|failed to parse/i.test(message);
      log.error('Preclinical ingest failed', { sourcePdfId, message });
      return res.status(isZodLike ? 422 : 500).json({
        success: false,
        error: message,
        code: isZodLike ? 'PRECLINICAL_INGEST_VALIDATION' : 'PRECLINICAL_INGEST_ERROR',
      });
    }
  },
);

export default router;
