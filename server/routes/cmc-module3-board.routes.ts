/**
 * CMC Module 3 board — GET /api/cmc/module3-board.
 *
 * Read-only, org-scoped aggregation that feeds the v2 CMC surface
 * (client/src/concept2cure/v2/surfaces/CmcModule.tsx) Overview tab with LIVE
 * data in place of its in-file fixtures (CMC_PORT / CMC_SECTIONS_SEED and the
 * four Overview KPIs).
 *
 * SOURCED FROM REAL TABLES (never fabricated):
 *   • portfolio  ← canonical submissions anchored by program_id, with actual
 *                  tenant-scoped eCTD sequence and Module 3 leaf counts.
 *                  No parallel legacy registry or invented preparedness score.
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
 * readiness, per-region global readiness) are returned as explicit null —
 * never invented. Failed/unprovisioned reads publish unavailable metadata and
 * no established counts.
 *
 * NO AGENCY CORRESPONDENCE (2026-10-19, rows D2 and D5; decisions P-38 and
 * P-39 item 1). The board read the earlier CMC question file (reg_questions)
 * and served it as `correspondence`, with an `irOverdue` KPI counted by that
 * file's own rule. Agency questions have one home, the letter: CMC reads a
 * program's questions from GET /api/concept2cure/projects/:projectId/
 * agency-questions, with the letter's own overdue verdict, and the earlier file
 * is read-only history behind GET /api/cmc/agency-questions.
 *
 * @module server/routes/cmc-module3-board.routes
 */
import { Router, type Request, type Response } from 'express';

import { query as q } from '../db.js';
import { getSecureOrgId } from '../utils/tenantContext.js';
import { createScopedLogger } from '../utils/logger.js';
import { readCompiledRecord } from '../services/cmc/compiled-record.js';

const logger = createScopedLogger('cmc-module3-board');

/** One portfolio row — matches CmcPortfolio (rpi/ir nullable when unmeasurable). */
interface PortfolioRow {
  submissionId: number;
  programId: string | null;
  sub: string;
  product: string;
  region: string;
  type: string;
  rpi: number | null;
  ir: number | null;
  /** The same canonical filing core that project intake and placement write. */
  source: 'spine';
  /** Spine rows: placed Module 3 leaves (lower(section_code) like 'm3%'). */
  m3Leaves: number | null;
  /** Spine rows: eCTD sequences on the submission. */
  sequences: number | null;
}

/**
 * Is this error "no backend here", or a read that failed?
 *
 * Every block below answered both with `provisioned: false`, so a transient
 * database error rendered as "the store is not provisioned". 42P01
 * (undefined_table) is genuinely unprovisioned; anything else is a read that
 * did not complete, and the surface must be told which it got.
 */
function isUnprovisioned(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01';
}

/** One governed Module 3 section — matches CmcSection { key, path, st }. */
interface SectionRow {
  key: string;
  path: string;
  st: 'approved' | 'review' | 'draft';
  /** The compiler's own score for the section; null when it never scored it. */
  completeness: number | null;
  /** The required inputs the compiler found missing — what an approval would sign over. */
  missingInputs: string[];
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
 * The canonical half of the portfolio: real `submissions` rows (org-scoped,
 * soft-delete aware) with the two facts a CMC lead reads first — how many
 * eCTD sequences exist and how many Module 3 leaves are PLACED. These are the
 * rows the C2C project intake creates and the Module 3 placement seam writes
 * into; without them the board's front page was blind to the product's own
 * submission spine. Fails closed to an empty, unprovisioned list.
 */
async function buildSpinePortfolio(
  tenantId: number,
  programId?: string,
): Promise<{ rows: PortfolioRow[]; provisioned: boolean; unreadable: boolean }> {
  try {
    const rows = (
      await q(
        `select s.id, s.program_id, s.title,
                coalesce(s.product_name, '')     as product,
                coalesce(s.primary_region, '')   as region,
                coalesce(s.application_type, '') as type,
                (select count(*)::int from ectd_sequences e
                  where e.submission_id = s.id and e.organization_id = s.organization_id and e.deleted_at is null) as sequences,
                (select count(*)::int from submission_leaves l
                   join ectd_sequences e2 on e2.id = l.sequence_id
                  where e2.submission_id = s.id
                    and e2.organization_id = s.organization_id and l.organization_id = s.organization_id
                    and l.deleted_at is null and e2.deleted_at is null
                    and (lower(l.section_code) like 'm3%' or l.section_code = '3' or l.section_code like '3.%')) as m3_leaves
           from submissions s
          where s.organization_id = $1 and s.deleted_at is null
            and ($2::text is null or s.program_id::text = $2)
          order by s.updated_at desc nulls last, s.id desc`,
        [tenantId,programId ?? null],
      )
    ).rows as Array<{
      id: number;
      program_id: string | null;
      title: string;
      product: string;
      region: string;
      type: string;
      sequences: number;
      m3_leaves: number;
    }>;
    return {
      rows: rows.map((r) => ({
        submissionId: r.id,
        programId: r.program_id,
        sub: r.title,
        product: r.product,
        region: r.region.toUpperCase(),
        type: r.type.toUpperCase(),
        // No preparedness assessment or per-filing question relationship is
        // supplied by these persisted fields. Keep those unknown.
        rpi: null,
        ir: null,
        source: 'spine' as const,
        m3Leaves: r.m3_leaves,
        sequences: r.sequences,
      })),
      provisioned: true,
      unreadable: false,
    };
  } catch (err) {
    logger.warn('submissions spine read failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], provisioned: false, unreadable: !isUnprovisioned(err) };
  }
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
): Promise<{ rows: SectionRow[]; provisioned: boolean; unreadable: boolean } | null> {
  if (!projectId) return null;
  try {
    const rows = (
      await q(
        `select section_key, section_path, approval_state, deterministic_json
           from cmc_module3_sections
          where organization_id = $1 and project_id = $2
          order by section_key`,
        [tenantId, projectId],
      )
    ).rows as Array<{
      section_key: string;
      section_path: string | null;
      approval_state: string | null;
      deterministic_json: unknown;
    }>;
    return {
      /* completeness / missingInputs are read by the same rule the approve
         route and the export gate apply, so the Overview shows the signer
         exactly what those two will refuse. Found live: 21/21 approved, three
         at 0%, and no completeness anywhere on the table. */
      rows: rows.map((r) => {
        const record = readCompiledRecord(r);
        return {
          key: r.section_key,
          path: r.section_path ?? '',
          st: mapApprovalState(r.approval_state),
          completeness: record.completeness,
          missingInputs: record.missingInputs,
        };
      }),
      provisioned: true,
      unreadable: false,
    };
  } catch (err) {
    logger.warn('cmc_module3_sections read failed', {
      projectId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], provisioned: false, unreadable: !isUnprovisioned(err) };
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
        buildSpinePortfolio(tenantId,projectId),
        buildSections(tenantId, projectId),
      ]);

      const rpiValues = portfolio.rows
        .map((r) => r.rpi)
        .filter((v): v is number => typeof v === 'number');
      const rpiAverage = rpiValues.length
        ? Math.round(rpiValues.reduce((a, b) => a + b, 0) / rpiValues.length)
        : null;

      /* A failed section read publishes NO counts: 0 sections / 0 approved /
         0% ready beside sectionsUnreadable:true was a believable figure over
         a register nothing had read. */
      const sectionsReadable = Boolean(sections?.provisioned && !sections.unreadable);
      const sectionsTotal = sections && sectionsReadable ? sections.rows.length : null;
      const sectionsApproved = sections && sectionsReadable
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
            submissions: portfolio.provisioned && !portfolio.unreadable ? portfolio.rows.length : null,
            rpiAverage,
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
          meta: {
            projectId: projectId ?? null,
            portfolioProvisioned: portfolio.provisioned,
            spinePortfolioProvisioned: portfolio.provisioned,
            sectionsProvisioned: sections ? sections.provisioned : null,
            /* provisioned:false answers two different questions; these say which
               one you got, so a failed read is never rendered as "none". */
            portfolioUnreadable: portfolio.unreadable,
            sectionsUnreadable: sections ? sections.unreadable : null,
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
