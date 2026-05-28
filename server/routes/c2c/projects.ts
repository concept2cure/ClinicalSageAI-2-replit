/**
 * /api/c2c/projects/* — Project detail endpoints.
 *
 * Unified project-level reads for the Projects detail surface (Phase 10).
 * Aggregates over `regulatory_programs`, `c2c_document_sections`,
 * `project_members`, `c2c_project_pinned_evidence`, and `audit_logs`.
 *
 * Routes:
 *   GET  /api/c2c/projects/:id                     project metadata
 *   GET  /api/c2c/projects/:id/workstreams          section counts grouped by CTD module
 *   GET  /api/c2c/projects/:id/drafts?limit=7       recent section drafts
 *   GET  /api/c2c/projects/:id/team                 project members
 *   GET  /api/c2c/projects/:id/evidence?pinned=1    pinned evidence cards
 *   POST /api/c2c/projects/:id/evidence             pin evidence
 *   DELETE /api/c2c/projects/:id/evidence/:evId     unpin
 *   GET  /api/c2c/projects/:id/activity?limit=5     recent audit_logs
 *
 * @module server/routes/c2c/projects
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw == null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function send400(res: Response, msg: string) {
  return res.status(400).json({ error: msg });
}

function send403(res: Response) {
  return res.status(403).json({ error: 'FORBIDDEN' });
}

function send404(res: Response) {
  return res.status(404).json({ error: 'NOT_FOUND' });
}

// ── GET /api/c2c/projects/:id ─────────────────────────────────────────────────

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
         p.team_members
       FROM regulatory_programs p
       WHERE p.id = $1 AND p.organization_id = $2
       LIMIT 1`,
      [req.params.id, orgId],
    );

    if (rows.length === 0) return send404(res);
    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/projects/:id/workstreams ─────────────────────────────────────
//
// Groups c2c_document_sections by CTD module prefix (the first component of
// section_key, e.g. 'm3', 'm4', 'm5', 'm2', 'm1'). Each group returns a
// status rollup and a completion percentage.
//
// Falls back gracefully when no sections exist yet.

router.get('/:id/workstreams', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    // Verify project access.
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         split_part(ds.section_key, '.', 1) AS module,
         COUNT(*)                            AS total,
         COUNT(*) FILTER (WHERE ds.status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE ds.status = 'review')   AS review,
         COUNT(*) FILTER (WHERE ds.status = 'drafted')  AS drafted,
         COUNT(*) FILTER (WHERE ds.status = 'todo')     AS todo,
         ROUND(
           AVG(CASE WHEN ds.status = 'approved' THEN 100
                    WHEN ds.status = 'review'   THEN  75
                    WHEN ds.status = 'drafted'  THEN  50
                    ELSE 0 END)
         )::integer AS completion_pct,
         MAX(ds.updated_at) AS last_updated
       FROM c2c_document_sections ds
       JOIN c2c_documents d ON d.id = ds.document_id
       WHERE d.project_id = $1 AND d.org_id = $2
       GROUP BY 1
       ORDER BY 1`,
      [req.params.id, orgId],
    );

    return res.json({ workstreams: rows });
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id/workstreams', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/projects/:id/drafts ─────────────────────────────────────────
//
// Most-recently-updated sections for the project. Default limit 7.

router.get('/:id/drafts', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const limit = Math.min(parseInt(String((req.query as any).limit ?? '7'), 10) || 7, 50);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         ds.id, ds.document_id, ds.section_key, ds.label,
         ds.status, ds.draft_source, ds.owner_id,
         ds.updated_at, ds.version,
         d.doc_type, d.agency, d.title AS document_title
       FROM c2c_document_sections ds
       JOIN c2c_documents d ON d.id = ds.document_id
       WHERE d.project_id = $1 AND d.org_id = $2
         AND ds.status != 'todo'
       ORDER BY ds.updated_at DESC NULLS LAST
       LIMIT $3`,
      [req.params.id, orgId, limit],
    );

    return res.json({ drafts: rows });
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id/drafts', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/projects/:id/team ───────────────────────────────────────────
//
// Reads from `project_members` (Phase PR#601 sharing migration).

router.get('/:id/team', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    // project_members may not exist in all environments (Phase 14 sharing migration).
    // Soft-degrade to empty list if the table is absent.
    try {
      const { rows } = await pool.query(
        `SELECT
           pm.user_id, pm.role, pm.added_at,
           u.name, u.email
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = $1
         ORDER BY pm.added_at ASC`,
        [req.params.id],
      );
      return res.json({ team: rows });
    } catch {
      return res.json({ team: [] });
    }
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id/team', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/projects/:id/evidence ───────────────────────────────────────

router.get('/:id/evidence', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         e.id, e.evidence_kind, e.evidence_ref, e.title, e.meta,
         e.pinned_by, e.pinned_at, e.reason
       FROM c2c_project_pinned_evidence e
       WHERE e.project_id = $1
       ORDER BY e.pinned_at DESC`,
      [req.params.id],
    );

    return res.json({ evidence: rows });
  } catch (err: unknown) {
    // c2c_project_pinned_evidence may not exist in all environments yet.
    console.error('[c2c/projects] GET /:id/evidence', err);
    return res.json({ evidence: [] });
  }
});

// ── POST /api/c2c/projects/:id/evidence ──────────────────────────────────────

router.post('/:id/evidence', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { evidenceKind, evidenceRef, title, meta, reason } = req.body as {
    evidenceKind: string;
    evidenceRef:  string;
    title:        string;
    meta?:        string;
    reason?:      string;
  };

  if (!evidenceKind || !evidenceRef || !title) {
    return send400(res, 'evidenceKind, evidenceRef, and title are required');
  }

  const VALID_KINDS = new Set(['artifact','vault_doc','rim_precedent','guidance']);
  if (!VALID_KINDS.has(evidenceKind)) {
    return send400(res, `evidenceKind must be one of: ${[...VALID_KINDS].join(', ')}`);
  }

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `INSERT INTO c2c_project_pinned_evidence
         (project_id, evidence_kind, evidence_ref, title, meta, pinned_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id, evidence_kind, evidence_ref) DO NOTHING
       RETURNING *`,
      [req.params.id, evidenceKind, evidenceRef, title, meta ?? null, userId, reason ?? null],
    );

    return res.status(201).json(rows[0] ?? { message: 'already pinned' });
  } catch (err: unknown) {
    console.error('[c2c/projects] POST /:id/evidence', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── DELETE /api/c2c/projects/:id/evidence/:evId ───────────────────────────────

router.delete('/:id/evidence/:evId', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const del = await pool.query(
      `DELETE FROM c2c_project_pinned_evidence
       WHERE id = $1 AND project_id = $2
       RETURNING id`,
      [req.params.evId, req.params.id],
    );

    if (del.rows.length === 0) return send404(res);
    return res.status(204).send();
  } catch (err: unknown) {
    console.error('[c2c/projects] DELETE /:id/evidence/:evId', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/projects/:id/activity ───────────────────────────────────────

router.get('/:id/activity', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const limit = Math.min(parseInt(String((req.query as any).limit ?? '5'), 10) || 5, 50);

  try {
    const check = await pool.query(
      `SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (check.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `SELECT
         al.id, al.action, al.resource_type, al.resource_id,
         al.actor_id, al.details, al.occurred_at, al.ip_address
       FROM audit_logs al
       WHERE al.tenant_id = $2
         AND (al.resource_id = $1 OR al.details->>'project_id' = $1)
       ORDER BY al.occurred_at DESC NULLS LAST
       LIMIT $3`,
      [req.params.id, orgId, limit],
    );

    return res.json({ activity: rows });
  } catch (err: unknown) {
    console.error('[c2c/projects] GET /:id/activity', err);
    // audit_logs schema varies; degrade gracefully.
    return res.json({ activity: [] });
  }
});

export default router;
