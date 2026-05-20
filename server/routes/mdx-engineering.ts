/**
 * Engineering aggregator — backs Surface 2 (rail item `engineering`) of the
 * paying-client beta brief.
 *
 *   GET /api/mdx/engineering/:programId
 *
 * Returns the 4 metric-card values + the engineering-deliverables table the
 * kit's EngineeringSurface needs:
 *   - dhfCompletion       (percent of required device sections validated)
 *   - openEcrs            (open engineering blockers)
 *   - bomLines            (count of BOM artifacts)
 *   - riskLastUpdated     (ISO timestamp of latest risk_items.updated_at)
 *   - deliverables        (array of engineering artifacts + sections)
 *
 * Read-only aggregator over concept2cure_artifacts, c2c_blockers,
 * cerv2_510k_sections, risk_items. Tenant-scoped via the program.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, notFoundInTenant, serverError } from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-engineering');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/engineering/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) {
    return clientError(res, 422, 'programId must be a UUID');
  }

  try {
    /* Verify the program belongs to the org before computing the summary —
       otherwise an attacker enumerating UUIDs gets a real 404 for valid
       UUIDs in other orgs but a 404 too for non-existent UUIDs, which
       leaks nothing. */
    const program = await pool.query<{ id: string }>(
      `SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [programId, orgId],
    );
    if (program.rows.length === 0) return notFoundInTenant(res, 'Program');

    /* Device-section completion — required sections in the 'device'
       category, marked validated or approved. */
    const sections = await pool.query<{ total: number; done: number }>(
      `SELECT
          COUNT(*) FILTER (WHERE is_required = true) AS total,
          COUNT(*) FILTER (WHERE is_required = true AND status IN ('validated','approved')) AS done
         FROM cerv2_510k_sections
        WHERE organization_id = $1 AND category = 'device'`,
      [orgId],
    );
    const total = Number(sections.rows[0]?.total ?? 0);
    const done  = Number(sections.rows[0]?.done ?? 0);
    const dhfCompletion = total === 0 ? 0 : Math.round((done / total) * 100);

    /* Open ECRs — c2c_blockers categorized as 'engineering' or 'design'. */
    let openEcrs = 0;
    try {
      const ecr = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM c2c_blockers
          WHERE org_id = $1
            AND status = 'open'
            AND (category ILIKE 'eng%' OR category ILIKE 'design%')`,
        [orgId],
      );
      openEcrs = ecr.rows[0]?.n ?? 0;
    } catch { /* table optional */ }

    /* BOM artifacts — concept2cure_artifacts with ctd_section LIKE '3.2.P%'
       AND type = 'bom'. Loose match because client conventions vary. */
    let bomLines = 0;
    try {
      const bom = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM concept2cure_artifacts
          WHERE organization_id = $1
            AND (ctd_section ILIKE '3.2.P%' OR type = 'bom')`,
        [orgId],
      );
      bomLines = bom.rows[0]?.n ?? 0;
    } catch { /* defensive */ }

    /* Most recent risk_items.updated_at for this program. */
    let riskLastUpdated: string | null = null;
    try {
      const risk = await pool.query<{ updated_at: Date | null }>(
        `SELECT MAX(updated_at) AS updated_at FROM risk_items
          WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
        [orgId, programId],
      );
      riskLastUpdated = risk.rows[0]?.updated_at?.toISOString() ?? null;
    } catch { /* table may not exist pre-migration */ }

    /* Engineering deliverables list — joined view of sections in 'device'
       category + artifacts in Module 3 / 4. Limited to ~50 for the table. */
    const deliverables = await pool.query<{
      kind:           'section' | 'artifact';
      title:          string;
      section:        string | null;
      status:         string;
      owner:          string | null;
      last_edit:      Date;
      blocker:        boolean;
    }>(
      `(
         SELECT 'section'::text AS kind,
                section_title    AS title,
                section_number   AS section,
                status,
                NULL::text       AS owner,
                updated_at       AS last_edit,
                (is_required AND status NOT IN ('validated','approved')) AS blocker
           FROM cerv2_510k_sections
          WHERE organization_id = $1 AND category = 'device'
       )
       UNION ALL
       (
         SELECT 'artifact'::text AS kind,
                title,
                ctd_section      AS section,
                status,
                NULL::text       AS owner,
                updated_at       AS last_edit,
                (status NOT IN ('approved','locked')) AS blocker
           FROM concept2cure_artifacts a
           LEFT JOIN projects p ON p.id = a.project_id
          WHERE a.organization_id = $1
            AND p.regulatory_program_id::text = $2
            AND (a.ctd_section ILIKE '3%' OR a.ctd_section ILIKE '4%')
            AND a.status != 'archived'
       )
       ORDER BY last_edit DESC
       LIMIT 50`,
      [orgId, programId],
    );

    return ok(res, {
      dhfCompletion,
      openEcrs,
      bomLines,
      riskLastUpdated,
      deliverables: deliverables.rows,
    });
  } catch (err) {
    return serverError(res, log, 'engineering', err);
  }
});

export default router;
