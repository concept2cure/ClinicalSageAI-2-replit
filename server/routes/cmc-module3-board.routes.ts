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
 * readiness, per-region global readiness, agency correspondence) are returned
 * as explicit null — never invented. Failed/unprovisioned reads publish
 * unavailable metadata and no established counts.
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
 * database error rendered as "the correspondence store is not provisioned" —
 * and the overdue-IR KPI silently swapped to a different metric under the same
 * label. 42P01 (undefined_table) is genuinely unprovisioned; anything else is a
 * read that did not complete, and the surface must be told which it got.
 */
function isUnprovisioned(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '42P01';
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
): Promise<{
  rows: CorrespondenceRow[];
  provisioned: boolean;
  /** True when the read FAILED (as opposed to the store being absent). */
  unreadable: boolean;
  /** Open questions matching the filter, BEFORE the page limit. */
  totalOpen: number;
  /** Overdue among ALL of them — not among the page. */
  overdueTotal: number;
  /** True when the page shows fewer than the store holds. */
  truncated: boolean;
}> {
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
    /* The counts come from the STORE, not from the page above. `irOverdue` —
       rendered as "You have N information requests overdue" — was the overdue
       count of this LIMIT 50 page, so an org with more than fifty open Module 3
       questions was told it had fewer overdue than it did. A page is for
       reading; a count is for acting on. */
    const totals = (
      await q(
        `select count(*)::int as total,
                count(*) filter (
                  where due_date is not null and due_date < current_date
                )::int as overdue
           from reg_questions
          where organization_id = $1
            and status in ('OPEN','DRAFTED','IN_REVIEW')
            and (section_reference ilike '3.%' or section_reference ilike 'm3%'
                 or section_reference is null)`,
        [tenantId],
      )
    ).rows[0] as { total: number; overdue: number } | undefined;
    const totalOpen = Number(totals?.total ?? rows.length);

    return {
      totalOpen,
      overdueTotal: Number(totals?.overdue ?? rows.filter((r) => r.overdue).length),
      truncated: totalOpen > rows.length,
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
      unreadable: false,
    };
  } catch (err) {
    logger.warn('reg_questions read failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      rows: [], provisioned: false, unreadable: !isUnprovisioned(err),
      totalOpen: 0, overdueTotal: 0, truncated: false,
    };
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
      const [portfolio, sections, correspondence] = await Promise.all([
        buildSpinePortfolio(tenantId,projectId),
        buildSections(tenantId, projectId),
        buildCorrespondence(tenantId),
      ]);

      const rpiValues = portfolio.rows
        .map((r) => r.rpi)
        .filter((v): v is number => typeof v === 'number');
      const rpiAverage = rpiValues.length
        ? Math.round(rpiValues.reduce((a, b) => a + b, 0) / rpiValues.length)
        : null;

      // The same real correspondence read feeds both the card and its overdue
      // KPI. An absent or failed store establishes no overdue count.
      const irOverdue: number | null = correspondence.provisioned
        ? correspondence.overdueTotal
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
            spinePortfolioProvisioned: portfolio.provisioned,
            sectionsProvisioned: sections ? sections.provisioned : null,
            correspondenceProvisioned: correspondence.provisioned,
            /* provisioned:false answers two different questions; these say which
               one you got, so a failed read is never rendered as "none open". */
            correspondenceUnreadable: correspondence.unreadable,
            portfolioUnreadable: portfolio.unreadable,
            sectionsUnreadable: sections ? sections.unreadable : null,
            /* The card shows a page; these describe the store behind it, so a
               surface can say "50 of 128" rather than imply it holds them all. */
            correspondenceTotalOpen: correspondence.provisioned ? correspondence.totalOpen : null,
            correspondenceOverdueTotal: correspondence.provisioned ? correspondence.overdueTotal : null,
            correspondenceTruncated: correspondence.provisioned ? correspondence.truncated : null,
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
