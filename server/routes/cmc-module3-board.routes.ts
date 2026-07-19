/**
 * CMC Module 3 board — GET /api/cmc/module3-board.
 *
 * Read-only, org-scoped aggregation that feeds the v2 CMC surface
 * (client/src/concept2cure/v2/surfaces/CmcModule.tsx) Overview tab with LIVE
 * data in place of its in-file fixtures (CMC_PORT / CMC_SECTIONS_SEED and the
 * four Overview KPIs).
 *
 * SOURCED FROM REAL TABLES (never fabricated):
 *   • portfolio  ← reg_submissions (sub_id, product_id, region, sub_type)
 *                  + per-submission overdue Information Requests from
 *                    reg_questions (status IN OPEN/DRAFTED/IN_REVIEW, due_date < now)
 *                  + the Regulatory Preparedness Index from the real RPI engine
 *                    (server/src/services/reg/rpi.ts::computeRPI). These are the
 *                    same queries + engine the existing GET overview
 *                    (server/api/cmc/portfolio.ts) already runs.
 *   • sections   ← cmc_module3_sections (section_key, section_path,
 *                  approval_state) for one project — the governed Module 3
 *                  store the operating-system routes read/write. Only populated
 *                  when ?projectId=<uuid> is supplied, because the governed
 *                  section list is inherently per-project (there is no org-wide
 *                  section skeleton to read).
 *   • kpis       ← derived purely from the two real slices above.
 *
 * HONESTY (regulated product): rpi / ir are null when their computation is
 * unavailable for a submission — never a fabricated score or a fake zero.
 * Display fields the surface renders that have NO faithful org-scoped source in
 * this schema (specifications, stability series, batch dispositions, blueprint
 * readiness, per-region global readiness, agency correspondence) are returned
 * as explicit null — never invented. Fails CLOSED to honest empties
 * (provisioned:false) rather than 500 when a backing table is absent, so the
 * surface keeps its fixture fallback.
 *
 * @module server/routes/cmc-module3-board.routes
 */
import { Router, type Request, type Response } from 'express';

import { query as q } from '../db.js';
import { getSecureOrgId } from '../utils/tenantContext.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('cmc-module3-board');

/** One portfolio row — matches CmcPortfolio (rpi/ir nullable when unmeasurable). */
interface PortfolioRow {
  sub: string;
  product: string;
  region: string;
  type: string;
  rpi: number | null;
  ir: number | null;
}

/** One governed Module 3 section — matches CmcSection { key, path, st }. */
interface SectionRow {
  key: string;
  path: string;
  st: 'approved' | 'review' | 'draft';
}

/** Resolve the JWT-derived org id as the integer tenant_id / organization_id, or null. */
function resolveTenantId(req: Request): number | null {
  const orgId = getSecureOrgId(req);
  const tenantId = orgId == null ? NaN : Number(orgId);
  return Number.isFinite(tenantId) ? tenantId : null;
}

/** Map the governed approval_state vocabulary onto the surface's st vocabulary. */
function mapApprovalState(state: unknown): SectionRow['st'] {
  const s = String(state ?? '').toLowerCase();
  if (s === 'approved' || s === 'locked') return 'approved';
  if (s === 'review' || s === 'in_review') return 'review';
  return 'draft';
}

/**
 * Build the org-wide portfolio from reg_submissions, enriched per submission
 * with the overdue-IR count and the real RPI. Fails closed to an empty,
 * unprovisioned list; degrades rpi/ir to null (never a fake number) per row.
 */
async function buildPortfolio(
  tenantId: number,
): Promise<{ rows: PortfolioRow[]; provisioned: boolean }> {
  let subs: Array<{ sub_id: string; product_id: string; region: string; sub_type: string }>;
  try {
    subs = (
      await q(
        `select sub_id, product_id, region, sub_type
           from reg_submissions
          where tenant_id = $1
          order by created_at desc`,
        [tenantId],
      )
    ).rows;
  } catch (err) {
    logger.warn('reg_submissions read failed — portfolio unprovisioned', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], provisioned: false };
  }

  const rows: PortfolioRow[] = [];
  for (const s of subs) {
    // Overdue Information Requests (real; null only if the query itself fails).
    let ir: number | null = null;
    try {
      const r = (
        await q(
          `select sum(case when due_date < now() then 1 else 0 end)::int as overdue
             from reg_questions
            where sub_id = $1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
          [s.sub_id],
        )
      ).rows[0];
      ir = r?.overdue ?? 0;
    } catch (err) {
      logger.warn('reg_questions read failed for submission', {
        subId: s.sub_id,
        err: err instanceof Error ? err.message : String(err),
      });
      ir = null;
    }

    // Regulatory Preparedness Index from the real engine; null on failure
    // (honest degradation — never the legacy fabricated fallback score).
    let rpi: number | null = null;
    try {
      const rpiMod = await import('../src/services/reg/rpi.js');
      const result = await rpiMod.computeRPI(s.sub_id);
      rpi = typeof result?.rpi === 'number' ? result.rpi : null;
    } catch (err) {
      logger.warn('RPI computation failed for submission', {
        subId: s.sub_id,
        err: err instanceof Error ? err.message : String(err),
      });
      rpi = null;
    }

    rows.push({
      sub: s.sub_id,
      product: s.product_id,
      region: s.region,
      type: s.sub_type,
      rpi,
      ir,
    });
  }

  return { rows, provisioned: true };
}

/**
 * Build the governed Module 3 section list for one project from
 * cmc_module3_sections. Returns null when no projectId is supplied (the
 * governed list is inherently per-project). Fails closed to an empty,
 * unprovisioned list on read error.
 */
async function buildSections(
  tenantId: number,
  projectId: string | undefined,
): Promise<{ rows: SectionRow[]; provisioned: boolean } | null> {
  if (!projectId) return null;
  try {
    const rows = (
      await q(
        `select section_key, section_path, approval_state
           from cmc_module3_sections
          where organization_id = $1 and project_id = $2
          order by section_key`,
        [tenantId, projectId],
      )
    ).rows as Array<{
      section_key: string;
      section_path: string | null;
      approval_state: string | null;
    }>;
    return {
      rows: rows.map((r) => ({
        key: r.section_key,
        path: r.section_path ?? '',
        st: mapApprovalState(r.approval_state),
      })),
      provisioned: true,
    };
  } catch (err) {
    logger.warn('cmc_module3_sections read failed — sections unprovisioned', {
      projectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], provisioned: false };
  }
}

export default function createCmcModule3BoardRoutes(): Router {
  const router = Router();

  /**
   * GET /api/cmc/module3-board?projectId=<uuid>
   * Org-scoped CMC Module 3 board. Envelope: { success: true, data: <displayShape> }.
   * projectId is optional; it is required only to populate the governed
   * section-approval list (sections stays null without it).
   */
  router.get('/', async (req: Request, res: Response) => {
    const tenantId = resolveTenantId(req);
    if (tenantId == null) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const projectIdRaw = req.query.projectId;
    const projectId =
      typeof projectIdRaw === 'string' && projectIdRaw.trim() ? projectIdRaw.trim() : undefined;

    try {
      const [portfolio, sections] = await Promise.all([
        buildPortfolio(tenantId),
        buildSections(tenantId, projectId),
      ]);

      const rpiValues = portfolio.rows
        .map((r) => r.rpi)
        .filter((v): v is number => typeof v === 'number');
      const rpiAverage = rpiValues.length
        ? Math.round(rpiValues.reduce((a, b) => a + b, 0) / rpiValues.length)
        : null;

      const irValues = portfolio.rows
        .map((r) => r.ir)
        .filter((v): v is number => typeof v === 'number');
      const irOverdue = irValues.reduce((a, b) => a + b, 0);

      const sectionsTotal = sections ? sections.rows.length : null;
      const sectionsApproved = sections
        ? sections.rows.filter((s) => s.st === 'approved').length
        : null;
      const readyPercent =
        sectionsTotal && sectionsTotal > 0
          ? Math.round((100 * (sectionsApproved ?? 0)) / sectionsTotal)
          : sectionsTotal === 0
            ? 0
            : null;

      return res.json({
        success: true,
        data: {
          portfolio: portfolio.rows,
          sections: sections ? sections.rows : null,
          kpis: {
            submissions: portfolio.rows.length,
            rpiAverage,
            irOverdue,
            sectionsApproved,
            sectionsTotal,
            readyPercent,
          },
          // Rendered by other CMC sub-tabs but NOT faithfully org-sourceable in
          // this schema — explicit nulls, never fabricated (see caveats).
          specifications: null,
          stability: null,
          batches: null,
          blueprint: null,
          global: null,
          correspondence: null,
          meta: {
            projectId: projectId ?? null,
            portfolioProvisioned: portfolio.provisioned,
            sectionsProvisioned: sections ? sections.provisioned : null,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      logger.error('module3-board aggregation failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ success: false, error: 'Failed to build CMC Module 3 board' });
    }
  });

  return router;
}
