/**
 * Shared helpers for the IND lifecycle sub-routers (analysis / documents /
 * filing). All sub-routers are merged under /api/ind-lifecycle by
 * ../ind-lifecycle.routes.ts; auth is applied at that mount point.
 */

import { Request, Response } from 'express';
import { createRateLimiter } from '../../middleware/rateLimiter';
import { createScopedLogger } from '../../utils/logger.js';
import {
  isUnauditedExportRefusal,
  sendAuditedDownload,
  type ExportSourceType,
} from '../../services/export/governedExportConsequence';
import { evaluateIndReadiness } from '../../services/ind-lifecycle/ind-readiness-service';
import {
  validateSequenceLeaves,
  isSequenceFilingType,
  SEQUENCE_FILING_TYPES,
  type SequenceFilingType,
} from '../../services/ind-lifecycle/ind-sequence-validation';

const logger = createScopedLogger('ind-lifecycle-routes');

/** Per-router rate limiter (same config as the rest of the platform). */
export const limiter = createRateLimiter();

/** RBAC role required for every IND lifecycle route. */
export const AUTHOR = 'regulatory-author';

export interface Ctx {
  userId: number;
  organizationId: number;
}

/** Resolve { userId, organizationId } from the authenticated session only. */
export function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId };
}

/** Safely coerce a request body to an object. */
export function body(req: Request): any {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// submission-service error codes → HTTP status (for the /file persistence routes).
const SUBMISSION_CODE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  FORBIDDEN: 403,
  VALIDATION: 400,
};

/** Map a service error to a stable HTTP response. */
export function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && SUBMISSION_CODE_STATUS[code]) {
    return void res.status(SUBMISSION_CODE_STATUS[code]).json({
      error: { code, message: err instanceof Error ? err.message : 'Request failed.' },
    });
  }
  /* A rendered document is delivered only once its EXPORT_GENERATED row
     persists (sendRecordedFile). Asked before the `CODE:` rule below, which
     would otherwise answer this server-side refusal 400, as if the caller had
     sent something wrong. */
  if (isUnauditedExportRefusal(err)) {
    return void res.status(503).json({
      error: {
        code: 'UNAUDITED_EXPORT_REFUSED',
        message: 'The document was not delivered because its record could not be written. Nothing was sent. Try again.',
      },
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  // The lifecycle services throw `CODE: message` strings for caller errors
  // (e.g. IND_AMENDMENT_NO_DOCUMENTS); treat those as 400, everything else 500.
  if (/^[A-Z_]+:/.test(msg)) {
    const [c] = msg.split(':', 1);
    return void res.status(400).json({ error: { code: c, message: msg } });
  }
  logger.error('ind-lifecycle route error', { err: msg });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Request failed.' } });
}

export function noAuth(res: Response) {
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
}

/**
 * Deliver a rendered IND document, recorded (D5).
 *
 * These routes render the cover letter, the 312.33 annual report and its SAE
 * line listing, the letter of authorization, the right-of-reference
 * statement, the briefing book and the sequence PDFs, and handed the file back
 * with nothing recorded: no audit row, no hash, no answer to "who took which
 * document, and when" (2026-10-15 launch-boundary re-proof). The one
 * implementation every generated download uses (sendAuditedDownload) writes
 * EXPORT_GENERATED with the SHA-256 of these exact bytes, and delivers nothing
 * when that row does not persist; `fail` answers that refusal 503.
 */
export async function sendRecordedFile(
  req: Request,
  res: Response,
  file: { filename: string; buffer: Buffer; mimeType?: string; sourceType?: ExportSourceType },
): Promise<void> {
  const ctx = ctxOf(req);
  if (!ctx) {
    noAuth(res);
    return;
  }
  const backendRoute = `${req.baseUrl}${req.route?.path ?? req.path}`;
  await sendAuditedDownload(res, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    sourceType: file.sourceType ?? 'export_pdf',
    backendRoute,
    resourceType: 'ind_lifecycle_document',
    resourceId: backendRoute,
    programUuid: null,
    filename: file.filename,
    mimeType: file.mimeType ?? 'application/pdf',
    buffer: file.buffer,
  });
}

/** A rendered IND PDF, recorded: `sendRecordedFile`. */
export function sendPdf(req: Request, res: Response, filename: string, buf: Buffer): Promise<void> {
  return sendRecordedFile(req, res, { filename, buffer: buf });
}

/** Build a readiness report from a `readinessInput` body fragment, or null. */
export function readinessFrom(input: any, overdueSafetyReports?: number) {
  if (!input || (input.filingType !== 'initial' && input.filingType !== 'amendment')) return null;
  return evaluateIndReadiness({
    filingType: input.filingType,
    sectionStatus: input.sectionStatus ?? {},
    completedForms: input.completedForms,
    // The submission-scoped routes pass the register's count; a caller-supplied
    // number is only used where no submission is in scope.
    overdueSafetyReports: overdueSafetyReports ?? input.overdueSafetyReports,
  });
}

/**
 * Parse an optional overdue-safety-report count from a body value: undefined
 * when absent (the engines then say it was not assessed — never zero), the
 * count when a non-negative integer, null when present but not one (the caller
 * answers 400 rather than reading "2" or -1 as something else).
 */
export function overdueCountParam(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : null;
}

/** The accepted sequence-validation filingType values, for 400 messages. */
export const FILING_TYPE_VALUES = SEQUENCE_FILING_TYPES.map((t) => `'${t}'`).join('|');

/**
 * Parse an optional sequence-validation `filingType` from a body / query value:
 * undefined when absent (the caller derives it from the stored sequence via
 * filingTypeForSequence), the type when valid, null when present but not a
 * known type (the caller answers 400 rather than silently coercing).
 */
export function filingTypeParam(raw: unknown): SequenceFilingType | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return isSequenceFilingType(raw) ? raw : null;
}

/** Validate a `sequenceValidationInput` body fragment, or null. */
export function validationFrom(input: any) {
  if (!input || !isSequenceFilingType(input.filingType) || !Array.isArray(input.leaves)) {
    return null;
  }
  return validateSequenceLeaves({ filingType: input.filingType, leaves: input.leaves });
}

/**
 * Coerce an AdverseEvent's date fields from JSON strings to Date objects. Over
 * HTTP, dates arrive as ISO strings (JSON has no Date type); the safety-report
 * services operate on Date, so coerce at the route boundary.
 */
export function coerceEventDates(event: any): any {
  if (!event || typeof event !== 'object') return event;
  const out = { ...event };
  // P-20 (2026-10-08): an onset date is a date or explicitly "unknown". The
  // literal is carried as `onsetDateUnknown` (IndSafetyEvent), never coerced
  // to an Invalid Date that would read as a blank.
  if (typeof out.onsetDate === 'string' && out.onsetDate.trim().toLowerCase() === 'unknown') {
    delete out.onsetDate;
    out.onsetDateUnknown = true;
  }
  for (const f of ['onsetDate', 'reportDate', 'regulatoryReportingDeadline', 'createdAt']) {
    if (typeof out[f] === 'string' && out[f]) out[f] = new Date(out[f]);
  }
  return out;
}
