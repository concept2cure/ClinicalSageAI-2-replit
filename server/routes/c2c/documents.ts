/**
 * /api/c2c/documents/* — Universal document & section endpoints.
 *
 * Thin domain layer over the c2c_documents family. Every mutation
 * routes through writeMutation (actions.ts) so the same audit ledger
 * captures document-level and section-level changes.
 *
 * Routes:
 *   GET    /api/c2c/documents                           — list by projectId / docType / agency
 *   GET    /api/c2c/documents/by-legacy/cerv2-section/:id — resolver for legacy section IDs
 *   GET    /api/c2c/rule-packs                          — list seeded rule packs
 *   GET    /api/c2c/documents/:id                       — document + metadata
 *   GET    /api/c2c/documents/:id/outline               — rule pack sections joined with live statuses
 *   GET    /api/c2c/documents/:id/sections/:key         — single section content
 *   PATCH  /api/c2c/documents/:id/sections/:key         — update content (Part-11 versioned)
 *   POST   /api/c2c/documents/:id/sections/:key/evidence — attach evidence link
 *   DELETE /api/c2c/documents/:id/sections/:key/evidence/:evId — remove evidence link
 *   POST   /api/c2c/documents/:id/lock                  — lock document via /actions/lock
 *   POST   /api/c2c/documents/:id/submit                — submit (sets submitted_at)
 *
 * Day 4 (UI cutover) wires /ai-draft and replaces useAcceptAnaDraft.
 *
 * @module server/routes/c2c/documents
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { writeMutation } from './actions.js';

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

// ── GET /api/c2c/documents ────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const { projectId, docType, agency } = req.query as Record<string, string | undefined>;

  try {
    const conditions: string[] = ['d.org_id = $1'];
    const params: unknown[] = [orgId];

    if (projectId) {
      params.push(projectId);
      conditions.push(`d.project_id = $${params.length}`);
    }
    if (docType) {
      params.push(docType);
      conditions.push(`d.doc_type = $${params.length}`);
    }
    if (agency) {
      params.push(agency);
      conditions.push(`d.agency = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT d.id, d.org_id, d.project_id, d.doc_type, d.agency,
              d.rule_pack_version, d.title, d.status, d.readiness,
              d.owner_id, d.locked_at, d.submitted_at,
              d.created_at, d.updated_at
       FROM c2c_documents d
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.updated_at DESC`,
      params,
    );

    return res.json({ documents: rows });
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/documents/by-legacy/cerv2-section/:id ───────────────────────
//
// Resolves a legacy cerv2_510k_sections integer ID to the new
// (documentId, sectionKey) pair using the deterministic ID scheme
// established in the Day 2 backfill migration.

router.get('/by-legacy/cerv2-section/:id', async (req: Request, res: Response) => {
  const legacyId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(legacyId)) return send400(res, 'INVALID_ID');

  try {
    // Join through the chain: cerv2_510k_sections → fda_510k_documents → fda_510k_projects
    // c2c_documents.id = 'doc_fda510k_' + fda_510k_projects.id
    const { rows } = await pool.query(`
      SELECT
        'doc_fda510k_' || fd.project_id::text AS document_id,
        s.section_key
      FROM cerv2_510k_sections s
      JOIN fda_510k_documents fd ON fd.id = s.document_id
      WHERE s.id = $1 AND s.document_id IS NOT NULL
      LIMIT 1
    `, [legacyId]);

    if (rows.length === 0) {
      // Section not linked to a project: fall back to org-level lookup
      const { rows: fallback } = await pool.query(`
        SELECT d.id AS document_id, s.section_key
        FROM cerv2_510k_sections s
        JOIN c2c_documents d ON d.doc_type = 'k510' AND d.org_id = s.organization_id
        WHERE s.id = $1
        ORDER BY d.created_at ASC
        LIMIT 1
      `, [legacyId]);

      if (fallback.length === 0) return send404(res);
      return res.json(fallback[0]);
    }

    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /by-legacy/cerv2-section', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/rule-packs ───────────────────────────────────────────────────

router.get('/rule-packs', async (req: Request, res: Response) => {
  const { docType, agency } = req.query as Record<string, string | undefined>;

  try {
    const conditions: string[] = ['superseded_by IS NULL'];
    const params: unknown[] = [];

    if (docType) {
      params.push(docType);
      conditions.push(`doc_type = $${params.length}`);
    }
    if (agency) {
      params.push(agency);
      conditions.push(`agency = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT doc_type, agency, version, label, required_sections,
              esubmit_channel, effective_from
       FROM c2c_rule_packs
       WHERE ${conditions.join(' AND ')}
       ORDER BY doc_type, agency`,
      params,
    );

    return res.json({ rulePacks: rows });
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /rule-packs', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/documents/:id ────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.org_id, d.project_id, d.doc_type, d.agency,
              d.rule_pack_version, d.title, d.status, d.readiness,
              d.owner_id, d.artifact_id, d.locked_at, d.submitted_at,
              d.created_at, d.updated_at
       FROM c2c_documents d
       WHERE d.id = $1 AND d.org_id = $2
       LIMIT 1`,
      [req.params.id, orgId],
    );

    if (rows.length === 0) return send404(res);
    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /:id', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/documents/:id/outline ───────────────────────────────────────
//
// Returns the rule pack's required_sections list merged with live section
// status, content metadata, and readiness from c2c_document_sections.
// Sections not yet created in c2c_document_sections are returned with
// status='todo' and empty content so the authoring UI can render them.

router.get('/:id/outline', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const docRes = await pool.query(
      `SELECT d.id, d.doc_type, d.agency, d.rule_pack_version, d.title,
              d.status, d.readiness, rp.required_sections
       FROM c2c_documents d
       JOIN c2c_rule_packs rp
         ON rp.doc_type = d.doc_type AND rp.agency = d.agency
            AND rp.version = d.rule_pack_version
       WHERE d.id = $1 AND d.org_id = $2
       LIMIT 1`,
      [req.params.id, orgId],
    );

    if (docRes.rows.length === 0) return send404(res);
    const doc = docRes.rows[0] as any;

    // Fetch all live sections for this document.
    const secRes = await pool.query(
      `SELECT section_key, status, owner_id, draft_source,
              drafted_at, accepted_at, version,
              (content -> 'paragraphs') IS NOT NULL AS has_content
       FROM c2c_document_sections
       WHERE document_id = $1`,
      [req.params.id],
    );

    const liveSections = new Map<string, any>();
    for (const row of secRes.rows) {
      liveSections.set(row.section_key, row);
    }

    // Merge rule pack outline with live section statuses.
    const outline = (doc.required_sections as any[]).map(spec => ({
      key:         spec.key,
      parent_key:  spec.parent_key,
      label:       spec.label,
      mandatory:   spec.mandatory,
      path_order:  spec.path_order,
      // Overlay live data when section exists.
      ...(liveSections.has(spec.key) ? {
        status:      liveSections.get(spec.key).status,
        draft_source: liveSections.get(spec.key).draft_source,
        drafted_at:  liveSections.get(spec.key).drafted_at,
        accepted_at: liveSections.get(spec.key).accepted_at,
        version:     liveSections.get(spec.key).version,
        has_content: liveSections.get(spec.key).has_content,
      } : {
        status:      'todo',
        draft_source: null,
        drafted_at:  null,
        accepted_at: null,
        version:     1,
        has_content: false,
      }),
    }));

    return res.json({
      document: {
        id:       doc.id,
        title:    doc.title,
        doc_type: doc.doc_type,
        agency:   doc.agency,
        status:   doc.status,
        readiness: doc.readiness,
      },
      outline,
    });
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /:id/outline', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── GET /api/c2c/documents/:id/sections/:key ─────────────────────────────────

router.get('/:id/sections/:key', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  const { id, key } = req.params;

  try {
    // Verify doc org membership first.
    const docCheck = await pool.query(
      `SELECT 1 FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [id, orgId],
    );
    if (docCheck.rows.length === 0) return send404(res);

    const { rows } = await pool.query(
      `SELECT id, document_id, section_key, parent_key, label,
              path_order, mandatory, status, owner_id, content,
              draft_source, drafted_at, accepted_by, accepted_at, version
       FROM c2c_document_sections
       WHERE document_id = $1 AND section_key = $2
       LIMIT 1`,
      [id, key],
    );

    if (rows.length === 0) return send404(res);
    return res.json(rows[0]);
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /:id/sections/:key', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── PATCH /api/c2c/documents/:id/sections/:key ───────────────────────────────
//
// Updates section content. The Part-11 version snapshot trigger
// (c2c_snapshot_section_version) fires on UPDATE and writes a
// c2c_document_section_versions row. app.actor_id + app.reason GUCs
// must be set BEFORE the UPDATE so the trigger can attribute the change.
//
// If the section does not exist yet it is created (upsert) and no
// version row is written (INSERT doesn't trigger the BEFORE UPDATE).
//
// Also writes a c2c_ana_actions row via writeMutation('transition')
// so the audit ledger captures every content change.

router.patch('/:id/sections/:key', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { id, key } = req.params;
  const { content, status, reason } = req.body as {
    content?: Record<string, unknown>;
    status?:  string;
    reason?:  string;
  };

  if (content === undefined && status === undefined) {
    return send400(res, 'content or status required');
  }
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return send400(res, 'reason required for Part-11 attribution');
  }

  const VALID_STATUSES = new Set(['todo','drafted','review','approved','locked']);
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return send400(res, `status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  try {
    // Verify doc org membership.
    const docCheck = await pool.query(
      `SELECT 1 FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [id, orgId],
    );
    if (docCheck.rows.length === 0) return send404(res);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Set GUCs for Part-11 trigger attribution.
      await client.query(`SET LOCAL app.actor_id = $1`, [String(userId)]);
      await client.query(`SET LOCAL app.reason = $1`, [reason.trim()]);

      // Check if section already exists.
      const existing = await client.query(
        `SELECT id FROM c2c_document_sections WHERE document_id = $1 AND section_key = $2`,
        [id, key],
      );

      let row: any;
      if (existing.rows.length === 0) {
        // Section doesn't exist yet — INSERT (trigger won't fire, no version row).
        // Look up label + path_order from the rule pack when available.
        const rpackRes = await client.query(
          `SELECT elem ->> 'label' AS label,
                  (elem ->> 'path_order')::integer AS path_order,
                  (elem ->> 'mandatory')::boolean AS mandatory
           FROM c2c_documents d
           JOIN c2c_rule_packs rp
             ON rp.doc_type = d.doc_type AND rp.agency = d.agency
                AND rp.version = d.rule_pack_version,
           jsonb_array_elements(rp.required_sections) AS elem
           WHERE d.id = $1 AND elem ->> 'key' = $2
           LIMIT 1`,
          [id, key],
        );

        const rpackRow = rpackRes.rows[0] as any;
        const label      = rpackRow?.label      ?? key;
        const pathOrder  = rpackRow?.path_order ?? 0;
        const mandatory  = rpackRow?.mandatory  ?? false;

        const ins = await client.query(
          `INSERT INTO c2c_document_sections
             (document_id, section_key, label, path_order, mandatory, content, status, draft_source)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'human')
           RETURNING *`,
          [
            id, key, label, pathOrder, mandatory,
            content !== undefined ? JSON.stringify(content) : '{}',
            status ?? 'drafted',
          ],
        );
        row = ins.rows[0];
      } else {
        // Section exists — UPDATE; GUCs set above activate the version trigger.
        const setClauses: string[] = ['updated_at = now()'];
        const params: unknown[] = [id, key];

        if (content !== undefined) {
          params.push(JSON.stringify(content));
          setClauses.push(`content = $${params.length}::jsonb`);
        }
        if (status !== undefined) {
          params.push(status);
          setClauses.push(`status = $${params.length}`);
        }
        if (content !== undefined) {
          setClauses.push(`draft_source = 'human'`);
        }

        const upd = await client.query(
          `UPDATE c2c_document_sections
           SET ${setClauses.join(', ')}
           WHERE document_id = $1 AND section_key = $2
           RETURNING *`,
          params,
        );
        row = upd.rows[0];
      }

      await client.query('COMMIT');

      // Write audit ledger entry (outside the section transaction — non-fatal).
      writeMutation(
        'transition',
        { target: `section:${id}:${key}`, reason: reason.trim(), payload: { status } },
        userId,
        orgId,
        'api',
        'documents',
      ).catch(err => console.error('[c2c/documents] writeMutation transition error:', err));

      return res.json(row);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error('[c2c/documents] PATCH /:id/sections/:key', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/c2c/documents/:id/sections/:key/evidence ───────────────────────

router.post('/:id/sections/:key/evidence', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { id, key } = req.params;
  const { evidenceKind, evidenceRef, paragraphId, confidence, reason } = req.body as {
    evidenceKind:  string;
    evidenceRef:   string;
    paragraphId?:  string;
    confidence?:   number;
    reason?:       string;
  };

  if (!evidenceKind || !evidenceRef) {
    return send400(res, 'evidenceKind and evidenceRef required');
  }

  const VALID_KINDS = new Set(['artifact','vault_doc','rim_precedent','guidance']);
  if (!VALID_KINDS.has(evidenceKind)) {
    return send400(res, `evidenceKind must be one of: ${[...VALID_KINDS].join(', ')}`);
  }

  try {
    // Verify doc + get section id.
    const secRes = await pool.query(
      `SELECT ds.id AS section_id
       FROM c2c_document_sections ds
       JOIN c2c_documents d ON d.id = ds.document_id
       WHERE ds.document_id = $1 AND ds.section_key = $2 AND d.org_id = $3
       LIMIT 1`,
      [id, key, orgId],
    );

    if (secRes.rows.length === 0) return send404(res);
    const sectionId = (secRes.rows[0] as any).section_id as number;

    const { rows } = await pool.query(
      `INSERT INTO c2c_document_section_evidence
         (section_id, evidence_kind, evidence_ref, paragraph_id, confidence, linked_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [sectionId, evidenceKind, evidenceRef, paragraphId ?? null, confidence ?? null, userId],
    );

    writeMutation(
      'resolve',
      { target: `section:${id}:${key}`, reason: reason ?? 'evidence linked', payload: { evidenceRef } },
      userId,
      orgId,
      'api',
      'documents',
    ).catch(err => console.error('[c2c/documents] writeMutation resolve error:', err));

    return res.status(201).json(rows[0]);
  } catch (err: unknown) {
    console.error('[c2c/documents] POST /:id/sections/:key/evidence', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── DELETE /api/c2c/documents/:id/sections/:key/evidence/:evId ───────────────

router.delete('/:id/sections/:key/evidence/:evId', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { id, key, evId } = req.params;

  try {
    // Verify org membership and ownership.
    const check = await pool.query(
      `SELECT ev.id
       FROM c2c_document_section_evidence ev
       JOIN c2c_document_sections ds ON ds.id = ev.section_id
       JOIN c2c_documents d ON d.id = ds.document_id
       WHERE ev.id = $1 AND ds.document_id = $2 AND ds.section_key = $3 AND d.org_id = $4
       LIMIT 1`,
      [evId, id, key, orgId],
    );

    if (check.rows.length === 0) return send404(res);

    // 21 CFR Part 11 §11.10(e): record the audit BEFORE removing the evidence,
    // and AWAIT it. Previously the audit ran fire-and-forget AFTER the delete
    // with a swallowed error — a crash in between, or an audit failure, left a
    // deletion of regulated evidence with no audit trail. Auditing first and
    // awaiting makes it fail-closed: if the governed-action write fails, the
    // delete does not happen.
    await writeMutation(
      'resolve',
      { target: `section:${id}:${key}`, reason: 'evidence unlinked', payload: { evidenceId: evId } },
      userId,
      orgId,
      'api',
      'documents',
    );

    await pool.query(`DELETE FROM c2c_document_section_evidence WHERE id = $1`, [evId]);

    return res.status(204).send();
  } catch (err: unknown) {
    console.error('[c2c/documents] DELETE /:id/sections/:key/evidence/:evId', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/c2c/documents/:id/lock ─────────────────────────────────────────

router.post('/:id/lock', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { reason, reauth } = req.body as { reason?: string; reauth?: unknown };
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return send400(res, 'reason required');
  }

  try {
    const docCheck = await pool.query(
      `SELECT id, status FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (docCheck.rows.length === 0) return send404(res);
    if ((docCheck.rows[0] as any).status === 'locked') {
      return res.status(409).json({ error: 'ALREADY_LOCKED' });
    }

    const result = await writeMutation(
      'lock',
      { target: `document:${req.params.id}`, reason: reason.trim(), reauth } as any,
      userId,
      orgId,
      'api',
      'documents',
    );

    await pool.query(
      `UPDATE c2c_documents SET status = 'locked', locked_at = now(), updated_at = now()
       WHERE id = $1`,
      [req.params.id],
    );

    return res.json({ ...result, status: 'locked' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
    if (msg === 'REAUTH_PASSWORD_REQUIRED' || msg.startsWith('REAUTH_')) {
      return res.status(401).json({ error: msg });
    }
    console.error('[c2c/documents] POST /:id/lock', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/c2c/documents/:id/submit ───────────────────────────────────────
//
// Sets submitted_at and status='submitted'. Snapshot to concept2cure_artifacts
// and gateway fire are Moat #5 scope — not wired here.

router.post('/:id/submit', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { reason } = req.body as { reason?: string };
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return send400(res, 'reason required');
  }

  try {
    const docCheck = await pool.query(
      `SELECT id, status FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [req.params.id, orgId],
    );
    if (docCheck.rows.length === 0) return send404(res);

    const docStatus = (docCheck.rows[0] as any).status;
    if (docStatus === 'submitted') {
      return res.status(409).json({ error: 'ALREADY_SUBMITTED' });
    }

    const result = await writeMutation(
      'transition',
      { target: `document:${req.params.id}`, reason: reason.trim() },
      userId,
      orgId,
      'api',
      'documents',
    );

    await pool.query(
      `UPDATE c2c_documents
       SET status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1`,
      [req.params.id],
    );

    return res.json({ ...result, status: 'submitted' });
  } catch (err: unknown) {
    console.error('[c2c/documents] POST /:id/submit', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
