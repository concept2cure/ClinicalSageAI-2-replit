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
         p.id, p.code, p.name, p.program_type, p.status,
         p.sponsor_name, p.lead_indication, p.created_at, p.updated_at,
         p.target_agencies, p.filing_date, p.pdufa_date,
         p.completion_percentage,
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

// ── GET /api/biopharma/programs/:id ──────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.code, p.name, p.program_type, p.status,
         p.sponsor_name, p.lead_indication, p.description,
         p.target_agencies, p.filing_date, p.pdufa_date,
         p.completion_percentage, p.created_at, p.updated_at,
         p.team_members, p.tags,
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

// ── GET /api/biopharma/meetings ───────────────────────────────────────────────
//
// Returns upcoming FDA / EMA / PMDA meeting milestones from
// regulatory_programs.milestones filtered to meeting-type entries.
// `within` param: '30d' | '60d' | '90d' (default '90d')

router.get('/meetings', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const within = String((req.query as any).within ?? '90d');
  const days = parseInt(within, 10) || 90;

  try {
    const { rows } = await pool.query(
      `SELECT
         p.id AS program_id, p.code, p.name AS program_name,
         p.program_type, p.target_agencies,
         m.value AS milestone
       FROM regulatory_programs p,
            jsonb_array_elements(
              CASE WHEN p.milestones IS NOT NULL
                   THEN p.milestones::jsonb
                   ELSE '[]'::jsonb
              END
            ) AS m(value)
       WHERE p.organization_id = $1
         AND p.program_type = ANY($2::text[])
         AND (m.value ->> 'type') ILIKE '%meeting%'
         AND (m.value ->> 'target_date')::date BETWEEN CURRENT_DATE AND CURRENT_DATE + $3::int
       ORDER BY (m.value ->> 'target_date')::date ASC
       LIMIT 200`,
      [orgId, BIOPHARMA_TYPES, days],
    );

    return res.json({ meetings: rows });
  } catch (err: unknown) {
    // milestones column may be absent or non-jsonb on some schemas.
    console.error('[biopharma/meetings] GET /meetings', err);
    return res.json({ meetings: [] });
  }
});

export default router;
