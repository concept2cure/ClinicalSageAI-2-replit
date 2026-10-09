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

import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';

import { makeUploadFileFilter, receiveUpload } from '../middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
import { PRECLINICAL_INGEST_ENABLED } from '../services/preclinical/feature-flags';
import {
  ingestStudy,
  PreclinicalIngestDisabledError,
} from '../services/preclinical/preclinical-ingest-service';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('preclinical-routes');

/**
 * The route reads one PDF. Until 2026-09-25 the filter silently dropped any
 * other declared type (so a refused file surfaced as "no file", 400) and the
 * declared type was never checked against the bytes (security audit
 * 2026-09-24, IAM-14; plan P1-5). A refused type is now 415, the size limit
 * 413, and the bytes must be a PDF and pass the malware scan before ingestStudy
 * sees them.
 */
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: makeUploadFileFilter({
    extensions: [],
    mimeTypes: ['application/pdf'],
    allowMimePrefixes: [],
  }),
});

/** Byte check + scan on the received PDF; a missing file is left to the handler. */
const validateUploadedFile = async (req: Request, res: Response, next: NextFunction) => {
  const file = req.file;
  if (!file) return next();
  try {
    await assertUploadSafe(file.buffer ?? Buffer.alloc(0), file.mimetype, file.originalname);
  } catch (err) {
    if (err instanceof UploadSafetyError) {
      return res.status(err.status).json({ success: false, ...err.body });
    }
    return next(err);
  }
  return next();
};

const router = Router();

router.post(
  '/ingest',
  receiveUpload(upload.single('file'), { maxBytes: UPLOAD_MAX_BYTES }),
  validateUploadedFile,
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

    // Opt-in governed bridge: when the request carries tenant + user context (and
    // either governed=true or a submissionId), thread the digested study into the
    // governed registry with Module 4 provenance. Falls back to legacy digestion.
    const r = req as any;
    const orgId = Number(r.tenantId ?? r.organizationId ?? r.user?.organizationId);
    const userId = Number(r.userId ?? r.user?.id ?? r.user?.userId);
    const submissionId = Number.parseInt(String(req.body?.submissionId ?? ''), 10);
    const iacucProtocolId = Number.parseInt(String(req.body?.iacucProtocolId ?? ''), 10);
    const wantsGoverned = String(req.body?.governed ?? '') === 'true' || Number.isInteger(submissionId);
    const governance = wantsGoverned && Number.isFinite(orgId) && Number.isFinite(userId)
      ? {
          organizationId: orgId,
          userId,
          submissionId: Number.isInteger(submissionId) ? submissionId : null,
          iacucProtocolId: Number.isInteger(iacucProtocolId) ? iacucProtocolId : null,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        }
      : undefined;

    try {
      const result = await ingestStudy({
        programId,
        pdfBuffer: req.file.buffer,
        sourcePdfId,
        governance,
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
          governedStudyId: result.governedStudyId,
          ctdSection: result.ctdSection,
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
