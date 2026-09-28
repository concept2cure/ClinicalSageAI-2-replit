/**
 * Enterprise onboarding requests — the platform owner's read of the sales intake.
 * Mounted under /api/admin/master, inside the Master Administration guard.
 *
 *   GET /enterprise-requests   ?status=pending (default) | all
 *
 * WHY THIS EXISTS (2026-09-24, launch rows D2 / D10). Onboarding's "Request
 * Enterprise onboarding" POSTs to /api/auth/license-request, which writes a
 * `license_requests` row (migrations/20260924_license_requests.sql). Until that
 * migration the row was never stored in production at all. After it, the row
 * was stored and read by nothing: no screen listed it and no one was notified,
 * so a prospect could ask and nobody would learn of it unless someone queried
 * the database. This is the read. It lists; it does not decide, reply or
 * change status — no workflow for that exists yet, and building one is a
 * product decision, not a cleanup.
 *
 * SCOPE. /api/admin/master is in SYSTEM_SCOPE_PREFIXES, so every query here runs
 * under the system scope (app_super_admin) — the only scope that table's
 * `license_requests_platform_access` policy admits. A tenant session, including
 * the pre-auth scope that wrote the row, reads nothing. No bypass is added here.
 *
 * AUTHORITY. The whole router inherits authMiddleware + requirePlatformAdmin
 * from the mount in ./master-admin; this file does no authorization of its own.
 *
 * FAIL CLOSED. A failed read answers through the canonical serverError — never
 * an empty list, which would read as "no requests" when the truth is "could not
 * look".
 *
 * @module server/routes/admin/master-enterprise-requests
 */
import { Router, Request, Response } from 'express';
import { query } from '../../db';
import { serverError } from '../../lib/api-response';
import { createScopedLogger } from '../../utils/logger';

const router = Router();
const log = createScopedLogger('master-enterprise-requests');

/** Hard ceiling on one read; the response says when it was reached. */
export const MAX_ROWS = 200;

export type RequestStatusFilter = 'pending' | 'all';

/** `?status=` → a filter, or null when the value is not one we accept. */
export function parseStatusFilter(raw: unknown): RequestStatusFilter | null {
  if (raw === undefined || raw === '') return 'pending';
  return raw === 'pending' || raw === 'all' ? raw : null;
}

export interface EnterpriseRequestRow {
  id: number;
  createdAt: string | null;
  name: string;
  email: string;
  organization: string;
  message: string;
  status: string;
  reviewedAt: string | null;
}

router.get('/enterprise-requests', async (req: Request, res: Response) => {
  const status = parseStatusFilter(req.query.status);
  if (!status) {
    return res.status(400).json({
      error: 'INVALID_STATUS',
      message: 'status must be "pending" or "all".',
    });
  }
  try {
    const { rows } = await query(
      `SELECT id, created_at, name, email, organization, COALESCE(message, '') AS message,
              COALESCE(status, 'pending') AS status, reviewed_at
         FROM license_requests
        WHERE ($1::text = 'all' OR COALESCE(status, 'pending') = 'pending')
        ORDER BY created_at DESC NULLS LAST, id DESC
        LIMIT $2`,
      [status, MAX_ROWS + 1],
    );
    const truncated = rows.length > MAX_ROWS;
    const requests: EnterpriseRequestRow[] = rows.slice(0, MAX_ROWS).map((r: any) => ({
      id: Number(r.id),
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      name: r.name,
      email: r.email,
      organization: r.organization,
      message: r.message,
      status: r.status,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    }));
    return res.json({ status, requests, count: requests.length, truncated, limit: MAX_ROWS });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause ?? err;
    return serverError(res, log, 'reading enterprise onboarding requests', cause);
  }
});

export default router;
