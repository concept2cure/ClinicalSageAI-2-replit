/**
 * Shared helpers for the IND lifecycle sub-routers (analysis / documents /
 * filing). All sub-routers are merged under /api/ind-lifecycle by
 * ../ind-lifecycle.routes.ts; auth is applied at that mount point.
 */

import { Request, Response } from 'express';
import { createRateLimiter } from '../../middleware/rateLimiter';
import { createScopedLogger } from '../../utils/logger.js';
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

export function sendPdf(res: Response, filename: string, buf: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.status(200).send(buf);
}

/** Build a readiness report from a `readinessInput` body fragment, or null. */
export function readinessFrom(input: any) {
  if (!input || (input.filingType !== 'initial' && input.filingType !== 'amendment')) return null;
  return evaluateIndReadiness({
    filingType: input.filingType,
    sectionStatus: input.sectionStatus ?? {},
    completedForms: input.completedForms,
    overdueSafetyReports: input.overdueSafetyReports,
  });
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
  for (const f of ['onsetDate', 'reportDate', 'regulatoryReportingDeadline', 'createdAt']) {
    if (typeof out[f] === 'string' && out[f]) out[f] = new Date(out[f]);
  }
  return out;
}
