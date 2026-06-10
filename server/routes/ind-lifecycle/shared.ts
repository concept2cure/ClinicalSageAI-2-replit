/**
 * Shared helpers for the IND lifecycle sub-routers (analysis / documents /
 * filing). All sub-routers are merged under /api/ind-lifecycle by
 * ../ind-lifecycle.routes.ts; auth is applied at that mount point.
 */

import { Request, Response } from 'express';
import { createRateLimiter } from '../../middleware/rateLimiter';
import { createScopedLogger } from '../../utils/logger.js';

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
