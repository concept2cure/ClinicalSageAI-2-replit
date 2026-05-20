/**
 * Analytics — read-only aggregations across the kit's domains. Backs the
 * `analytics` rail item (currently stubbed). No new tables; pure
 * derivations from existing rows.
 *
 *   GET /api/mdx/analytics/portfolio                program / pathway counts
 *   GET /api/mdx/analytics/submissions              transmittal cycle times + success
 *   GET /api/mdx/analytics/cycle-times              avg days per kit milestone
 *   GET /api/mdx/analytics/blockers                 blocker root-cause aggregation
 *   GET /api/mdx/analytics/clinical                 study + safety + endpoint roll-up
 *   GET /api/mdx/analytics/ana-usage                AnA tool invocation counts
 *
 * Each endpoint returns the canonical { data, meta? } envelope. Optional
 * tables degrade to empty aggregates via safeAggregate() rather than 500.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import {
  ok, orgRequired, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-analytics');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Run an aggregate; swallow missing-table / missing-column errors so
 *  surface degrades gracefully when an upstream table isn't provisioned. */
async function safeAgg<T>(sql: string, args: unknown[], fallback: T): Promise<T> {
  try {
    const { rows } = await pool.query(sql, args);
    return (rows[0] as unknown as T) ?? fallback;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01' || code === '42703') return fallback;
    throw err;
  }
}
async function safeRows<T extends Record<string, unknown>>(sql: string, args: unknown[]): Promise<T[]> {
  try {
    const { rows } = await pool.query<T>(sql, args);
    return rows;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '42P01' || code === '42703') return [];
    throw err;
  }
}

/* ─── Portfolio ─────────────────────────────────────────────── */

router.get('/analytics/portfolio', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const programs = await safeAgg<{ total: number; active: number; blocked: number; complete: number }>(
      `SELECT
          COUNT(*)::int                                                        AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int                       AS active,
          COUNT(*) FILTER (WHERE status = 'blocked')::int                      AS blocked,
          COUNT(*) FILTER (WHERE status = 'complete')::int                     AS complete
         FROM regulatory_programs WHERE organization_id = $1 AND deleted_at IS NULL`,
      [orgId], { total: 0, active: 0, blocked: 0, complete: 0 },
    );

    const byPathway = await safeRows<{ regulatory_path: string; n: number }>(
      `SELECT regulatory_path, COUNT(*)::int AS n
         FROM regulatory_programs
        WHERE organization_id = $1 AND deleted_at IS NULL AND regulatory_path IS NOT NULL
        GROUP BY regulatory_path`,
      [orgId],
    );

    const submissions = await safeAgg<{ total: number; received: number; in_review: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('received','ack1_received','ack2_received','ack3_received'))::int AS received,
              COUNT(*) FILTER (WHERE status = 'review_started')::int AS in_review
         FROM submission_transmittals WHERE organization_id = $1`,
      [orgId], { total: 0, received: 0, in_review: 0 },
    );

    return ok(res, { programs, byPathway, submissions });
  } catch (err) { return serverError(res, log, 'portfolio', err); }
});

/* ─── Submissions cycle times ───────────────────────────────── */

router.get('/analytics/submissions', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const byRegion = await safeRows<{ region: string; total: number; rejected: number; received: number; avg_to_ack_seconds: number | null }>(
      `SELECT region,
              COUNT(*)::int                                            AS total,
              COUNT(*) FILTER (WHERE status = 'rejected')::int         AS rejected,
              COUNT(*) FILTER (WHERE ack_received_at IS NOT NULL)::int AS received,
              EXTRACT(EPOCH FROM AVG(ack_received_at - submitted_at))  AS avg_to_ack_seconds
         FROM submission_transmittals
        WHERE organization_id = $1
        GROUP BY region`,
      [orgId],
    );
    const byErrorClass = await safeRows<{ error_class: string; n: number }>(
      `SELECT error_class, COUNT(*)::int AS n
         FROM submission_transmittals
        WHERE organization_id = $1 AND error_class IS NOT NULL
        GROUP BY error_class
        ORDER BY n DESC`,
      [orgId],
    );
    return ok(res, {
      byRegion: byRegion.map((r) => ({
        region:        r.region,
        total:         r.total,
        rejected:      r.rejected,
        received:      r.received,
        avgToAckHours: r.avg_to_ack_seconds === null ? null : Math.round(r.avg_to_ack_seconds / 3600 * 10) / 10,
      })),
      byErrorClass,
    });
  } catch (err) { return serverError(res, log, 'submissions', err); }
});

/* ─── Cycle times by kit milestone (sections) ───────────────── */

router.get('/analytics/cycle-times', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    /* Mean days from draft_source='ana' creation to accept (per category). */
    const sections = await safeRows<{ category: string; avg_days: number | null; n: number }>(
      `SELECT category,
              EXTRACT(EPOCH FROM AVG(accepted_at - drafted_at)) / 86400 AS avg_days,
              COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)::int      AS n
         FROM cerv2_510k_sections
        WHERE organization_id = $1
          AND draft_source = 'ana' AND drafted_at IS NOT NULL
        GROUP BY category`,
      [orgId],
    );
    return ok(res, {
      anaDraftToAccept: sections.map((r) => ({
        category: r.category, avgDays: r.avg_days === null ? null : Math.round(Number(r.avg_days) * 10) / 10,
        accepted: r.n,
      })),
    });
  } catch (err) { return serverError(res, log, 'cycle-times', err); }
});

/* ─── Blocker root causes ───────────────────────────────────── */

router.get('/analytics/blockers', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const byCategory = await safeRows<{ category: string; open: number; closed: number }>(
      `SELECT category,
              COUNT(*) FILTER (WHERE status = 'open')::int  AS open,
              COUNT(*) FILTER (WHERE status != 'open')::int AS closed
         FROM c2c_blockers WHERE org_id = $1
        GROUP BY category ORDER BY open DESC`,
      [orgId],
    );
    const validationFindings = await safeRows<{ validator: string; severity: string; n: number; resolved: number }>(
      `SELECT validator, severity,
              COUNT(*)::int                              AS n,
              COUNT(*) FILTER (WHERE resolved = true)::int AS resolved
         FROM submission_validation_findings
        WHERE organization_id = $1
        GROUP BY validator, severity
        ORDER BY n DESC`,
      [orgId],
    );
    const riskRollup = await safeAgg<{ total: number; high_residual: number; accepted: number }>(
      `SELECT COUNT(*)::int                                  AS total,
              COUNT(*) FILTER (WHERE residual_risk >= 15)::int AS high_residual,
              COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted
         FROM risk_items WHERE organization_id = $1 AND deleted_at IS NULL`,
      [orgId], { total: 0, high_residual: 0, accepted: 0 },
    );
    return ok(res, { byCategory, validationFindings, risk: riskRollup });
  } catch (err) { return serverError(res, log, 'blockers', err); }
});

/* ─── Clinical roll-up ──────────────────────────────────────── */

router.get('/analytics/clinical', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const studies = await safeAgg<{ total: number; enrolling: number; completed: number; planned_total: number; enrolled_total: number }>(
      `SELECT COUNT(*)::int                                              AS total,
              COUNT(*) FILTER (WHERE status = 'enrolling')::int           AS enrolling,
              COUNT(*) FILTER (WHERE status = 'completed')::int           AS completed,
              COALESCE(SUM(sample_size_planned), 0)::int                  AS planned_total,
              COALESCE(SUM(sample_size_enrolled), 0)::int                 AS enrolled_total
         FROM clinical_studies WHERE organization_id = $1 AND deleted_at IS NULL`,
      [orgId], { total: 0, enrolling: 0, completed: 0, planned_total: 0, enrolled_total: 0 },
    );
    const safety = await safeAgg<{ total: number; serious: number; uade: number }>(
      `SELECT COUNT(*)::int                                       AS total,
              COUNT(*) FILTER (WHERE serious = true)::int          AS serious,
              COUNT(*) FILTER (WHERE unanticipated = true)::int    AS uade
         FROM clinical_study_aes WHERE organization_id = $1`,
      [orgId], { total: 0, serious: 0, uade: 0 },
    );
    const endpoints = await safeAgg<{ total: number; met: number; primary_met: number }>(
      `SELECT COUNT(*)::int                                       AS total,
              COUNT(*) FILTER (WHERE met = true)::int              AS met,
              COUNT(*) FILTER (WHERE endpoint_kind = 'primary' AND met = true)::int AS primary_met
         FROM clinical_study_endpoints WHERE organization_id = $1`,
      [orgId], { total: 0, met: 0, primary_met: 0 },
    );
    return ok(res, { studies, safety, endpoints });
  } catch (err) { return serverError(res, log, 'clinical', err); }
});

/* ─── AnA usage ─────────────────────────────────────────────── */

router.get('/analytics/ana-usage', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    /* AnA tool invocations are recorded via the global audit middleware
       as table_name='tool_run' or similar; we read whatever audit-logs
       has, swallowing schema errors. */
    const draftedSections = await safeAgg<{ pending: number; accepted: number }>(
      `SELECT COUNT(*) FILTER (WHERE draft_source = 'ana' AND accepted_at IS NULL)::int AS pending,
              COUNT(*) FILTER (WHERE draft_source = 'ana' AND accepted_at IS NOT NULL)::int AS accepted
         FROM cerv2_510k_sections WHERE organization_id = $1`,
      [orgId], { pending: 0, accepted: 0 },
    );
    const threads = await safeAgg<{ total: number; pinned: number }>(
      `SELECT COUNT(*)::int                                    AS total,
              COUNT(*) FILTER (WHERE (metadata->>'pinned')::boolean = true)::int AS pinned
         FROM chat_threads WHERE organization_id = $1`,
      [orgId], { total: 0, pinned: 0 },
    );
    const memoryAtoms = await safeAgg<{ total: number; verified: number; critical: number }>(
      `SELECT COUNT(*)::int                                     AS total,
              COUNT(*) FILTER (WHERE is_verified_by_user = true)::int AS verified,
              COUNT(*) FILTER (WHERE importance_level = 'critical')::int AS critical
         FROM client_memory_entries WHERE organization_id = $1`,
      [orgId], { total: 0, verified: 0, critical: 0 },
    );
    return ok(res, { draftedSections, threads, memoryAtoms });
  } catch (err) { return serverError(res, log, 'ana-usage', err); }
});

export default router;
