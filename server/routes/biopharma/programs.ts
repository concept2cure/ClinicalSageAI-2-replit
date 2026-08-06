/**
 * /api/biopharma/programs — Biopharma regulatory programs.
 *
 * Thin query layer over `regulatory_programs` filtered to biopharma
 * submission types: IND, NDA, BLA, MAA, JNDA, DE_NOVO (small molecule /
 * biologic pathways). Device types (510K, PMA, CER) are MDX territory.
 *
 * Routes:
 *   GET /api/biopharma/programs                   list, optionally filtered
 *   GET /api/biopharma/programs/:id               single program
 *   GET /api/biopharma/meetings?within=90d         upcoming meeting calendar
 *
 * @module server/routes/biopharma/programs
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';

const router = Router();

const BIOPHARMA_TYPES = ['IND', 'NDA', 'BLA', 'MAA', 'JNDA', 'DE_NOVO'];

/**
 * The program columns this router exposes, mapped from the canonical
 * `regulatory_programs` shape (shared/schema/programs.ts) to the field names the
 * client already reads (ProjectHeader.tsx / ProjectDetail.tsx).
 *
 * Every handler here previously selected `p.sponsor_name`, `p.lead_indication`,
 * `p.filing_date`, `p.pdufa_date` and `p.completion_percentage` — none of which
 * exist on that table, and none of which have ever existed. So every request to
 * this router failed with `column p.sponsor_name does not exist` and returned
 * 500. The names below are the real ones; the aliases keep the wire contract
 * unchanged, since the client types all five as nullable and renders them
 * conditionally.
 *
 * `pdufa_date` has no column and no equivalent — it is FDA's action date, which
 * is not `approval_date` and is not derivable from anything stored. It is
 * selected as NULL rather than aliased onto a near-miss: the client already
 * hides the chip when it is null, and quietly rendering a different date under
 * a PDUFA label is worse than rendering nothing.
 */
const PROGRAM_FIELDS = `
  p.id, p.code, p.name, p.program_type, p.status,
  o.name                     AS sponsor_name,
  p.indication               AS lead_indication,
  p.actual_submission_date   AS filing_date,
  NULL::timestamp            AS pdufa_date,
  p.progress_percent         AS completion_percentage,
  p.target_agencies, p.created_at, p.updated_at`;

/** Postgres raises 22P02 when a non-UUID is cast to uuid; treat as "not found". */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function send403(res: Response) {
  return res.status(403).json({ error: 'FORBIDDEN' });
}

function send404(res: Response) {
  return res.status(404).json({ error: 'NOT_FOUND' });
}

// ── GET /api/biopharma/programs ───────────────────────────────────────────────
//
// Returns biopharma programs visible to the caller's org.
// Optional query params:
//   pathway  — filter by program_type (ind, nda, bla, maa, jnda, de_novo)
//   status   — filter by status
//   limit    — max rows (default 100)

router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const { pathway, status, limit: limitRaw } = req.query as Record<string, string | undefined>;
  const limit = Math.min(parseInt(String(limitRaw ?? '100'), 10) || 100, 500);

  try {
    const conditions: string[] = [
      'p.organization_id = $1',
      `p.program_type = ANY($2::text[])`,
    ];
    const params: unknown[] = [orgId, BIOPHARMA_TYPES];

    if (pathway) {
      params.push(pathway.toUpperCase());
      conditions.push(`p.program_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT
         ${PROGRAM_FIELDS},
         (
           SELECT json_build_object(
             'todo',    COUNT(*) FILTER (WHERE ds.status = 'todo'),
             'drafted', COUNT(*) FILTER (WHERE ds.status = 'drafted'),
             'review',  COUNT(*) FILTER (WHERE ds.status = 'review'),
             'approved',COUNT(*) FILTER (WHERE ds.status = 'approved'),
             'locked',  COUNT(*) FILTER (WHERE ds.status = 'locked'),
             'total',   COUNT(*)
           )
           FROM c2c_document_sections ds
           JOIN c2c_documents d ON d.id = ds.document_id
           WHERE d.project_id = p.id
         ) AS section_counts
       FROM regulatory_programs p
       LEFT JOIN organizations o ON o.id = p.organization_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );

    return res.json({ programs: rows, total: rows.length });
  } catch (err: unknown) {
    console.error('[biopharma/programs] GET /', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/biopharma/meetings ───────────────────────────────────────────────
//
// Upcoming FDA / EMA / PMDA meeting milestones for the caller's biopharma
// programs. `within` param: '30d' | '60d' | '90d' (default '90d').
//
// MUST stay ABOVE `/:id`. Express matches in registration order, so with
// `/:id` first this handler was unreachable: a request for /api/biopharma/
// meetings bound `id = 'meetings'` and fell into the single-program handler,
// where the uuid cast failed. The route was documented and mounted but could
// never have returned a meeting.

router.get('/meetings', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const days = parseInt(String((req.query as any).within ?? '90d'), 10) || 90;

  try {
    // Milestones live in `program_milestones`, one row per milestone. The
    // previous query unnested `p.milestones`, a jsonb column that does not exist
    // on regulatory_programs — and then swallowed the resulting error and
    // returned `{meetings: []}`, so the calendar rendered permanently empty and
    // looked like "no meetings scheduled" rather than a broken query.
    const { rows } = await pool.query(
      `SELECT
         p.id   AS program_id,
         p.code,
         p.name AS program_name,
         p.program_type,
         p.target_agencies,
         json_build_object(
           'id',          m.id,
           'name',        m.name,
           'description', m.description,
           'category',    m.category,
           'status',      m.status,
           'target_date', m.target_date,
           'actual_date', m.actual_date
         ) AS milestone
       FROM program_milestones m
       JOIN regulatory_programs p ON p.id = m.program_id
       WHERE p.organization_id = $1
         AND p.program_type = ANY($2::text[])
         AND (m.category ILIKE '%meeting%' OR m.name ILIKE '%meeting%')
         AND m.target_date IS NOT NULL
         AND m.target_date::date BETWEEN CURRENT_DATE AND CURRENT_DATE + $3::int
       ORDER BY m.target_date ASC
       LIMIT 200`,
      [orgId, BIOPHARMA_TYPES, days],
    );

    return res.json({ meetings: rows });
  } catch (err: unknown) {
    console.error('[biopharma/meetings] GET /meetings', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/biopharma/programs/:id ──────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);
  if (!UUID_RE.test(req.params.id)) return send404(res);

  try {
    const { rows } = await pool.query(
      `SELECT
         ${PROGRAM_FIELDS},
         p.description, p.team_members, p.tags,
         (
           SELECT json_agg(json_build_object(
             'id', d.id, 'title', d.title, 'doc_type', d.doc_type,
             'agency', d.agency, 'status', d.status,
             'readiness', d.readiness, 'updated_at', d.updated_at
           ) ORDER BY d.updated_at DESC NULLS LAST)
           FROM c2c_documents d
           WHERE d.project_id = p.id AND d.org_id = $2
         ) AS documents
       FROM regulatory_programs p
       LEFT JOIN organizations o ON o.id = p.organization_id
       WHERE p.id = $1
         AND p.organization_id = $2
         AND p.program_type = ANY($3::text[])
       LIMIT 1`,
      [req.params.id, orgId, BIOPHARMA_TYPES],
    );

    if (rows.length === 0) return send404(res);
    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('[biopharma/programs] GET /:id', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
