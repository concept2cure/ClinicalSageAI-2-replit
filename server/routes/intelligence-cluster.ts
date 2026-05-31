/**
 * Intelligence cluster (Phase 11) — read-only surface data.
 *
 * Backs the home-rail Intelligence tier: Protocol · CMC · Biostat · Reports
 * (client/src/concept2cure/intelligence/). Mounted at /api/intelligence.
 * Distinct from server/routes/intelligence.ts (the RIM "Intelligence + RIM"
 * router, which only owns /projects/:projectId/* paths) — the flat paths
 * here do not collide.
 *
 *   GET /api/intelligence/protocol     active protocols + endpoint library + amendments
 *   GET /api/intelligence/cmc          CMC packages + stability programs
 *   GET /api/intelligence/biostat      SAPs + TLF queue + interim analyses + sample size
 *   GET /api/intelligence/reports      readiness + precedent models + timeline forecast
 *
 * Each endpoint returns the canonical `{ data }` envelope. A field is only
 * included when it has rows; the surface hooks fall back to the ported kit
 * fixture for any omitted field, so the cluster renders fully today and
 * lights up per-section as backend data lands.
 *
 * Phase 11 introduces two tables (c2c_tlf_builds, c2c_forecast_snapshots —
 * see migrations/20260529_phase11_intelligence.sql). The protocol / cmc
 * datasets are designed to aggregate over c2c_endpoint_library,
 * c2c_manufacturing_sites, and c2c_stability_studies, which do not exist in
 * this schema yet; until they are designed those sections stay on fixtures.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, serverError } from '../lib/api-response';
import { pool } from '../db';
import { formatDueIn, formatDelta, isoDate } from './intelligence-cluster.format';

const router = Router();
const log = createScopedLogger('intelligence-cluster');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/** Run a query; swallow missing-table / missing-column errors so the
 *  surface degrades to fixtures rather than 500 when a table isn't
 *  provisioned yet. Mirrors mdx-analytics.safeRows. */
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

/* ─── Protocol ─────────────────────────────────────────────────── */
// TODO(phase11): aggregate active protocols from c2c_documents
// (doc_type='protocol') joined to regulatory_programs, and the endpoint
// library from c2c_endpoint_library, once those exist. Fixtures meanwhile.
router.get('/protocol', async (_req: Request, res: Response) => {
  try {
    return ok(res, {});
  } catch (err) {
    return serverError(res, log, 'protocol', err);
  }
});

/* ─── CMC ──────────────────────────────────────────────────────── */
// TODO(phase11): aggregate CMC packages from c2c_documents (doc_type='mod3')
// joined to c2c_manufacturing_sites, and stability from c2c_stability_studies,
// once those exist. Fixtures meanwhile.
router.get('/cmc', async (_req: Request, res: Response) => {
  try {
    return ok(res, {});
  } catch (err) {
    return serverError(res, log, 'cmc', err);
  }
});

/* ─── Biostat ──────────────────────────────────────────────────── */
type TlfRow = {
  id: string;
  what: string;
  due_at: Date;
  pct_complete: number;
  status: string;
  program: string | null;
};
router.get('/biostat', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  try {
    const out: Record<string, unknown> = {};
    if (orgId !== null) {
      const tlf = await safeRows<TlfRow>(
        `SELECT t.id, t.what, t.due_at, t.pct_complete, t.status, p.code AS program
           FROM c2c_tlf_builds t
           JOIN regulatory_programs p ON p.id = t.project_id
          WHERE p.organization_id = $1 AND p.deleted_at IS NULL
          ORDER BY t.due_at ASC`,
        [orgId],
      );
      if (tlf.length > 0) {
        out.tlfQueue = tlf.map((r) => {
          return {
            id: r.id,
            program: r.program ?? '—',
            what: r.what,
            dueIn: formatDueIn(new Date(r.due_at)),
            pct: r.pct_complete,
            status: r.status,
          };
        });
      }
    }
    // saps / sampleSize / interims aggregate over c2c_documents (doc_type
    // IN ('protocol','sap')) — deferred; omitted → surface uses fixtures.
    return ok(res, out);
  } catch (err) {
    return serverError(res, log, 'biostat', err);
  }
});

/* ─── Reports ──────────────────────────────────────────────────── */
type ForecastDbRow = {
  milestone: string;
  target_date: Date;
  forecast_date: Date;
  confidence: string;
  program: string | null;
};
router.get('/reports', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  try {
    const out: Record<string, unknown> = {};
    if (orgId !== null) {
      // Latest snapshot per (project, milestone).
      const fc = await safeRows<ForecastDbRow>(
        `SELECT DISTINCT ON (f.project_id, f.milestone)
                f.milestone, f.target_date, f.forecast_date, f.confidence, p.code AS program
           FROM c2c_forecast_snapshots f
           JOIN regulatory_programs p ON p.id = f.project_id
          WHERE p.organization_id = $1 AND p.deleted_at IS NULL
          ORDER BY f.project_id, f.milestone, f.snapshot_at DESC`,
        [orgId],
      );
      if (fc.length > 0) {
        out.forecast = fc.map((r) => {
          const target = new Date(r.target_date);
          const forecast = new Date(r.forecast_date);
          return {
            program: r.program ?? '—',
            milestone: r.milestone,
            target: isoDate(target),
            forecast: isoDate(forecast),
            delta: formatDelta(target, forecast),
            conf: Number(r.confidence),
          };
        });
      }
    }
    // kpis / bars / models aggregate over the analytics readiness rollup +
    // precedent-model serving layer — deferred; omitted → surface fixtures.
    return ok(res, out);
  } catch (err) {
    return serverError(res, log, 'reports', err);
  }
});

export default router;
