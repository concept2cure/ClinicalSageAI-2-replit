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
  /**
   * Where this row lives: 'spine' = the canonical submission core
   * (submissions/ectd_sequences/submission_leaves — what the C2C intake
   * creates and Module 3 placement writes into); 'rpi' = the legacy
   * reg_submissions store the preparedness engine reads. The board used to
   * read ONLY the legacy store, which does not even exist on a freshly
   * provisioned database — so a program with a fully placed Module 3 opened
   * onto "0 submissions".
   */
  source: 'spine' | 'rpi';
  /** Spine rows: placed Module 3 leaves (lower(section_code) like 'm3%'). */
  m3Leaves: number | null;
  /** Spine rows: eCTD sequences on the submission. */
  sequences: number | null;
}

/** One open agency question touching Module 3 — straight from reg_questions. */
interface CorrespondenceRow {
  id: number | string;
  question: string;
  sectionRef: string | null;
  priority: string | null;
  severity: string | null;
  status: string;
  region: string | null;
  dueDate: string | null;
  overdue: boolean;
  assignedTo: string | null;
  /** The authoring document holding the drafted response, when one is linked. */
  responseDocId: string | null;
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
 * The canonical half of the portfolio: real `submissions` rows (org-scoped,
 * soft-delete aware) with the two facts a CMC lead reads first — how many
 * eCTD sequences exist and how many Module 3 leaves are PLACED. These are the
 * rows the C2C project intake creates and the Module 3 placement seam writes
 * into; without them the board's front page was blind to the product's own
 * submission spine. Fails closed to an empty, unprovisioned list.
 */
async function buildSpinePortfolio(
  tenantId: number,
): Promise<{ rows: PortfolioRow[]; provisioned: boolean }> {
  try {
    const rows = (
      await q(
        `select s.title,
                coalesce(s.product_name, '')     as product,
                coalesce(s.primary_region, '')   as region,
                coalesce(s.application_type, '') as type,
                (select count(*)::int from ectd_sequences e
                  where e.submission_id = s.id and e.deleted_at is null) as sequences,
                (select count(*)::int from submission_leaves l
                   join ectd_sequences e2 on e2.id = l.sequence_id
                  where e2.submission_id = s.id
                    and l.deleted_at is null and e2.deleted_at is null
                    and lower(l.section_code) like 'm3%') as m3_leaves
           from submissions s
          where s.organization_id = $1 and s.deleted_at is null
          order by s.updated_at desc nulls last, s.id desc`,
        [tenantId],
      )
    ).rows as Array<{
      title: string;
      product: string;
      region: string;
      type: string;
      sequences: number;
      m3_leaves: number;
    }>;
    return {
      rows: rows.map((r) => ({
        sub: r.title,
        product: r.product,
        region: r.region.toUpperCase(),
        type: r.type.toUpperCase(),
        // The preparedness engine is keyed to the legacy store; no score is
        // computable for a spine row — null, never a fake number.
        rpi: null,
        ir: null,
        source: 'spine' as const,
        m3Leaves: r.m3_leaves,
        sequences: r.sequences,
      })),
      provisioned: true,
    };
  } catch (err) {
    logger.warn('submissions spine read failed — spine portfolio unprovisioned', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], provisioned: false };
  }
}

/**
 * Open agency questions touching Module 3 — reg_questions is org-scoped and
 * carries the question text, CTD section reference, priority/severity, status
 * and due date. The board previously returned correspondence:null and the
 * Program-records tab rendered a permanent empty state while these rows fed
 * only an Overview KPI. Filtered to Module 3 references PLUS unsectioned
 * rows — the Log-question dialog makes the section optional, and a question
 * this file confirmed must never vanish from the only UI over the store
 * (non-M3 sections stay excluded: they belong to another module's file).
 * Ordered so the nearest deadline is first. Fails closed to unprovisioned.
 */
async function buildCorrespondence(
  tenantId: number,
): Promise<{ rows: CorrespondenceRow[]; provisioned: boolean }> {
  try {
    const rows = (
      await q(
        `select id, question_text, section_reference, priority, severity, status,
                region, due_date, assigned_to, response_doc_id,
                (due_date is not null and due_date < current_date
                 and status in ('OPEN','DRAFTED','IN_REVIEW')) as overdue
           from reg_questions
          where organization_id = $1
            and status in ('OPEN','DRAFTED','IN_REVIEW')
            and (section_reference ilike '3.%' or section_reference ilike 'm3%'
                 or section_reference is null)
          order by (due_date is null), due_date asc, id desc
          limit 50`,
        [tenantId],
      )
    ).rows as Array<{
      id: number | string;
      question_text: string;
      section_reference: string | null;
      priority: string | null;
      severity: string | null;
      status: string;
      region: string | null;
      due_date: string | Date | null;
      assigned_to: string | null;
      response_doc_id: string | null;
      overdue: boolean;
    }>;
    return {
      rows: rows.map((r) => ({
        id: r.id,
        question: r.question_text,
        sectionRef: r.section_reference,
        priority: r.priority,
        severity: r.severity,
        status: r.status,
        region: r.region,
        dueDate: r.due_date ? new Date(r.due_date).toISOString() : null,
        overdue: Boolean(r.overdue),
        assignedTo: r.assigned_to,
        responseDocId: r.response_doc_id ?? null,
      })),
      provisioned: true,
    };
  } catch (err) {
    logger.warn('reg_questions read failed — correspondence unprovisioned', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { rows: [], provisioned: false };
  }
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
      source: 'rpi',
      m3Leaves: null,
      sequences: null,
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
      const [spine, legacy, sections, correspondence] = await Promise.all([
        buildSpinePortfolio(tenantId),
        buildPortfolio(tenantId),
        buildSections(tenantId, projectId),
        buildCorrespondence(tenantId),
      ]);
      // Canonical spine rows first (they are the product's own submissions),
      // then the legacy preparedness rows, deduplicated on identity so a
      // submission mirrored in both stores is not counted twice.
      const spineKeys = new Set(
        spine.rows.map((r) => `${r.sub}`.trim().toLowerCase()),
      );
      const portfolio = {
        rows: [
          ...spine.rows,
          ...legacy.rows.filter((r) => !spineKeys.has(`${r.sub}`.trim().toLowerCase())),
        ],
        provisioned: spine.provisioned || legacy.provisioned,
      };

      const rpiValues = portfolio.rows
        .map((r) => r.rpi)
        .filter((v): v is number => typeof v === 'number');
      const rpiAverage = rpiValues.length
        ? Math.round(rpiValues.reduce((a, b) => a + b, 0) / rpiValues.length)
        : null;

      /* One source for 'overdue IRs': the same org-wide reg_questions read
         the correspondence card renders — the KPI and the tab can no longer
         disagree. The legacy per-submission sum remains only the fallback for
         environments where that read is unprovisioned. */
      const irOverdue = correspondence.provisioned
        ? correspondence.rows.filter((r) => r.overdue).length
        : portfolio.rows
            .map((r) => r.ir)
            .filter((v): v is number => typeof v === 'number')
            .reduce((a, b) => a + b, 0);

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
          // Open Module 3 agency questions (reg_questions, org-scoped) — null
          // ONLY when the store is unprovisioned, so the surface can tell
          // "no backend here" from "no open questions".
          correspondence: correspondence.provisioned ? correspondence.rows : null,
          meta: {
            projectId: projectId ?? null,
            portfolioProvisioned: portfolio.provisioned,
            spinePortfolioProvisioned: spine.provisioned,
            sectionsProvisioned: sections ? sections.provisioned : null,
            correspondenceProvisioned: correspondence.provisioned,
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
