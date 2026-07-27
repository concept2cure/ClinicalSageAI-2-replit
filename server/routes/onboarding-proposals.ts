/**
 * AnA agentic onboarding — proposal ingest (P2).
 *
 *   POST /api/onboarding/ingest   (multipart: field `file`)
 *
 * Reads ONE uploaded onboarding document and returns the values AnA could
 * verify from it, for a human to review. This route is deliberately READ-ONLY:
 * it touches no database and writes nothing. Its output is a set of
 * *suggestions*; committing any of them is a separate, governed, human-driven
 * step (see docs/architecture/ANA_ONBOARDING_P2P3_SPEC.md).
 *
 * Honesty posture:
 *  - The document buffer is held in memory for the duration of the request and
 *    is never persisted, so an onboarding upload does not silently become
 *    tenant data.
 *  - Every returned value carries a provenance excerpt that was VERIFIED to
 *    occur in the document (see services/onboarding/proposal-extraction.ts);
 *    unverifiable values are dropped and reported in `warnings`.
 *  - An unreadable or unsupported file yields an honest empty result with a
 *    warning — never a fabricated suggestion.
 *
 * File name note: deliberately NOT `onboarding-ingest.ts` — a basename shared
 * with shared/types/onboarding-ingest.ts trips the repo-health duplicate-
 * basename gate.
 *
 * @module routes/onboarding-proposals
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../auth';
import { createScopedLogger } from '../utils/logger';
import { extractUploadedText } from '../services/projects/extract-text';
import { extractOnboardingProposals } from '../services/onboarding/proposal-extraction';

const router = Router();
const log = createScopedLogger('onboarding-proposals');

/** Formats the upstream text extractor actually understands (PDF / DOCX / text). */
const ACCEPTED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
]);
const MAX_BYTES = 25 * 1024 * 1024; // platform upload limit

const upload = multer({
  storage: multer.memoryStorage(), // never written to disk
  limits: { fileSize: MAX_BYTES, files: 1 },
});

// Rate limit ahead of auth; extraction calls a model, so this is also a cost
// guard. express-rate-limit matches the repo convention and is recognized by
// the CodeQL missing-rate-limiting query.
const ingestRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many onboarding uploads. Please wait a moment.' },
});

router.use(ingestRateLimiter);
router.use(authMiddleware);

function callerOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

router.post('/ingest', upload.single('file'), async (req: Request, res: Response) => {
  // Tenant context is required so an upload is always attributable, even though
  // this route stores nothing.
  if (callerOrgId(req) === null) {
    return res.status(400).json({ success: false, error: 'An organization context is required.' });
  }

  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file || !file.buffer?.length) {
    return res.status(400).json({ success: false, error: 'Attach a document to read.' });
  }
  if (!ACCEPTED.has(file.mimetype) && !/\.(pdf|docx?|txt|md)$/i.test(file.originalname || '')) {
    return res.status(415).json({
      success: false,
      error: 'That file type cannot be read yet. Upload a PDF, Word document, or plain text file.',
    });
  }

  try {
    const text = await extractUploadedText(file.buffer, file.mimetype, file.originalname || 'document');
    const result = await extractOnboardingProposals({ text, fileName: file.originalname || 'document' });
    return res.json({ success: true, data: result });
  } catch (err) {
    log.error('onboarding ingest failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ success: false, error: 'Could not read that document.' });
  }
});

export default router;
