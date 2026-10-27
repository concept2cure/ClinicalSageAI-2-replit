/**
 * Module 4 preclinical ingestion route.
 *
 *   POST /api/preclinical/ingest
 *   Multipart body:
 *     - programId  (number, required)  ID of the parent ctd_programs row.
 *     - sourcePdfId (string, optional) Caller-provided handle for provenance.
 *     - file       (PDF, required)     Single nonclinical study report PDF.
 *
 * Returns 503 when disabled, 400 on malformed input, 403 for requested
 * registration without valid tenant/user context, and 422 for unreadable,
 * incomplete, oversized or schema-invalid extraction. A requested registration
 * failure returns 500 with the retained extraction ID and its explicit outcome.
 * A successful registration still requires scientific review.
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
  type IngestGovernance,
  type IngestStudyResult,
} from '../services/preclinical/preclinical-ingest-service';
import {
  PreclinicalExtractionInputError,
  type PreclinicalExtractionInputCode,
} from '../services/preclinical/preclinical-extractor';
import { createScopedLogger } from '../utils/logger';
import { serverError } from '../lib/api-response';

const log = createScopedLogger('preclinical-routes');

const EXTRACTION_REFUSAL_MESSAGES: Record<PreclinicalExtractionInputCode, string> = {
  PRECLINICAL_NO_TEXT: 'The PDF did not contain readable report text.',
  PRECLINICAL_INCOMPLETE_TEXT: 'The complete report could not be read. Provide a PDF with readable text on every page.',
  PRECLINICAL_REPORT_TOO_LARGE: 'The report exceeds the supported extraction text limit.',
};

/** Accept complete positive decimal IDs, never a numeric prefix or coercion. */
function parsePositiveId(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type GovernanceRequest =
  | { ok: true; governance: IngestGovernance | undefined }
  | { ok: false; status: 400 | 403; code: string; error: string };

function readGovernanceContext(req: Request) {
  const r = req as any;
  return {
    organizationId: parsePositiveId(r.tenantId ?? r.organizationId ?? r.user?.organizationId),
    userId: parsePositiveId(r.userId ?? r.user?.id ?? r.user?.userId),
  };
}

/** Refuse requested registration before extraction if its context is invalid. */
function readGovernanceRequest(req: Request): GovernanceRequest {
  const body = req.body ?? {};
  const governed = body.governed;
  if (governed !== undefined && ![true, false, 'true', 'false'].includes(governed)) {
    return {
      ok: false, status: 400, code: 'PRECLINICAL_INGEST_BAD_GOVERNED',
      error: 'governed must be true or false when supplied',
    };
  }
  const hasSubmissionId = body.submissionId != null;
  const hasIacucProtocolId = body.iacucProtocolId != null;
  const submissionId = parsePositiveId(body.submissionId);
  const iacucProtocolId = parsePositiveId(body.iacucProtocolId);
  if (hasSubmissionId && submissionId === null) {
    return {
      ok: false, status: 400, code: 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID',
      error: 'submissionId must be a positive integer when supplied',
    };
  }
  if (hasIacucProtocolId && iacucProtocolId === null) {
    return {
      ok: false, status: 400, code: 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID',
      error: 'iacucProtocolId must be a positive integer when supplied',
    };
  }

  const wantsGoverned = governed === 'true' || governed === true || hasSubmissionId || hasIacucProtocolId;
  if (!wantsGoverned) return { ok: true, governance: undefined };
  // Tenant/user context is supplied by middleware, never taken from the body.
  const { organizationId, userId } = readGovernanceContext(req);
  if (organizationId === null || userId === null) {
    return {
      ok: false, status: 403, code: 'PRECLINICAL_INGEST_GOVERNANCE_CONTEXT_REQUIRED',
      error: 'Valid organization and user context is required for governed registration',
    };
  }
  return {
    ok: true,
    governance: {
      organizationId, userId, submissionId, iacucProtocolId,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    },
  };
}

function respondToIngestResult(res: Response, result: IngestStudyResult, sourcePdfId: string): Response {
  const data = {
    studyId: result.studyId,
    sourcePdfId,
    extractionConfidence: result.extractionConfidence,
    model: result.model,
    governedStudyId: result.governedStudyId,
    ctdSection: result.ctdSection,
    registration: result.registration,
  };
  if (result.registration.status === 'failed') {
    return res.status(500).json({
      success: false,
      error: 'The study extraction was saved, but governed registration was not confirmed.',
      code: 'PRECLINICAL_GOVERNED_REGISTRATION_FAILED',
      data,
    });
  }
  return res.status(200).json({ success: true, data });
}

function respondToIngestError(res: Response, err: unknown, sourcePdfId: string): Response {
  if (err instanceof PreclinicalIngestDisabledError) {
    // Deployment details stay in the log; the response has a static sentence.
    log.warn('Preclinical ingest refused: disabled', { sourcePdfId, err: err.message });
    return res.status(503).json({
      success: false,
      error: 'Preclinical ingest is disabled',
      code: 'PRECLINICAL_INGEST_DISABLED',
    });
  }
  if (err instanceof PreclinicalExtractionInputError) {
    log.warn('Preclinical extraction input refused', { sourcePdfId, code: err.code, coverage: err.coverage });
    return res.status(422).json({
      success: false,
      error: EXTRACTION_REFUSAL_MESSAGES[err.code],
      code: err.code,
      ...(err.coverage ? { coverage: {
        pageCount: err.coverage.pageCount,
        pagesRead: err.coverage.pagesRead,
        limitedBy: err.coverage.limitedBy,
      } } : {}),
    });
  }
  const message = err instanceof Error ? err.message : 'unknown error';
  const isZodLike = /Invalid|expected|failed to parse/i.test(message);
  if (!isZodLike) {
    // Driver/provider details go to the log against the request id (P1-17).
    return serverError(res, log, 'ingesting the preclinical study', err, { sourcePdfId });
  }
  log.error('Preclinical ingest failed', { sourcePdfId, message });
  return res.status(422).json({
    success: false,
    error: 'The extracted study did not pass validation.',
    code: 'PRECLINICAL_INGEST_VALIDATION',
  });
}

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

    const programId = parsePositiveId(req.body?.programId);
    if (programId === null) {
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

    const governanceRequest = readGovernanceRequest(req);
    if (!governanceRequest.ok) {
      return res.status(governanceRequest.status).json({
        success: false, error: governanceRequest.error, code: governanceRequest.code,
      });
    }

    try {
      const result = await ingestStudy({
        programId,
        pdfBuffer: req.file.buffer,
        sourcePdfId,
        governance: governanceRequest.governance,
      });

      log.info('Preclinical study extraction retained', {
        programId,
        studyId: result.studyId,
        sourcePdfId,
        confidence: result.extractionConfidence,
        registrationStatus: result.registration.status,
      });

      return respondToIngestResult(res, result, sourcePdfId);
    } catch (err) {
      return respondToIngestError(res, err, sourcePdfId);
    }
  },
);

export default router;
