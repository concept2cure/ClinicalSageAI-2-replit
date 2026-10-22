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
 *   PATCH  /api/c2c/documents/:id/sections/:key         — move a section between unsigned states (text is refused)
 *   POST   /api/c2c/documents/:id/sections/:key/evidence — attach evidence link
 *   DELETE /api/c2c/documents/:id/sections/:key/evidence/:evId — remove evidence link
 *   POST   /api/c2c/documents/:id/lock                  — lock document via /actions/lock
 *   POST   /api/c2c/documents/:id/submit                — submit (sets submitted_at)
 *
 * There is no AI-draft route here any more (ledger L32). The SSE stream this
 * module used to carry drafted against Data Room sources it never parked, so a
 * draft accepted through PATCH could carry author lineage but never source
 * lineage — and nothing in the client called it. Drafting lives in
 * server/routes/authoring.router.ts (POST /api/authoring/sections/:id/ai/draft
 * and its /accept), which parks the retrieved sources server-side and records
 * verified source + author spans in the same transaction as the content.
 *
 * @module server/routes/c2c/documents
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { writeMutation, recordGovernedAction, verifyReauth, separationOfDutiesRefusal } from './actions.js';
import { assertSignerIsNotAuthor } from '../../services/governance/separation-of-duties.js';
import { readDocumentOutline } from '../../services/c2c/document-outline.js';
import { checkFilingWritable } from '../../services/authoring/document-lock.js';
import {
  normalizeRulePackProvenance,
  rulePackProvenanceSelectSql,
} from '../../../shared/rule-pack-provenance.js';

/**
 * The raw column names `rulePackProvenanceSelectSql` puts on a row.
 *
 * Must list every field that fragment selects. A field missing from this set
 * survives onto the response beside the normalised object, which is the second
 * un-guarded copy `withRulePackProvenance` exists to prevent — and the review
 * fields are the ones where that would matter most, since `review_status` is
 * the single value a filer is entitled to rely on.
 */
const RAW_PROVENANCE_COLUMNS = new Set([
  'source_basis',
  'confidence',
  'review_status',
  'governing_rule',
  'uncertainties',
  'reviewed_by',
  'reviewed_at',
  'review_scope',
  'effective_review_state',
]);

/**
 * Replace the five raw provenance columns on a rule-pack row with one
 * normalised `provenance` object.
 *
 * The raw columns are dropped rather than carried alongside. If both shapes
 * were emitted, a consumer could read the un-normalised value and bypass the
 * conservative default — which is the whole protection, because a database
 * that has not yet taken 20260810c returns NULL for all five and a client
 * treating NULL as "no constraint" would render an unattested outline as an
 * unqualified one.
 */
function withRulePackProvenance(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!RAW_PROVENANCE_COLUMNS.has(k)) out[k] = v;
  }
  out.provenance = normalizeRulePackProvenance(row);
  return out;
}


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

  const { projectId, docType, agency, scope } = req.query as Record<string, string | undefined>;
  // `scope` (FILING_SPINE F22): 'home' is the project's filing, 'market' an
  // added market's regional modules (c2c_documents.filing_scope). Absent, every
  // document is listed, as before.
  if (scope !== undefined && scope !== 'home' && scope !== 'market') {
    return res.status(400).json({ error: 'BAD_SCOPE', message: "scope is 'home' or 'market'." });
  }

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
    if (scope) {
      params.push(scope);
      conditions.push(`d.filing_scope = $${params.length}`);
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
  // SECURITY: this resolver mapped ANY legacy section id to its (documentId,
  // sectionKey) with no caller-org scoping, leaking cross-tenant document/section
  // mappings. Scope every lookup to the caller's org via s.organization_id.
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);
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
      WHERE s.id = $1 AND s.document_id IS NOT NULL AND s.organization_id = $2
      LIMIT 1
    `, [legacyId, orgId]);

    if (rows.length === 0) {
      // Section not linked to a project: fall back to org-level lookup
      const { rows: fallback } = await pool.query(`
        SELECT d.id AS document_id, s.section_key
        FROM cerv2_510k_sections s
        JOIN c2c_documents d ON d.doc_type = 'k510' AND d.org_id = s.organization_id
        WHERE s.id = $1 AND s.organization_id = $2
        ORDER BY d.created_at ASC
        LIMIT 1
      `, [legacyId, orgId]);

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
              esubmit_channel, effective_from,
              ${rulePackProvenanceSelectSql('rp')}
       FROM c2c_rule_packs rp
       WHERE ${conditions.join(' AND ')}
       ORDER BY doc_type, agency`,
      params,
    );

    return res.json({ rulePacks: rows.map(withRulePackProvenance) });
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
// The rule pack's sections merged with live section status; a market's
// document is its own part of the pack, with its gaps (document-outline.ts).
// Sections not yet created are returned with status='todo' and empty content
// so the authoring UI can render them.

router.get('/:id/outline', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);

  try {
    const outline = await readDocumentOutline(pool, orgId, String(req.params.id));
    if (!outline) return send404(res);
    return res.json(outline);
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

// ── GET /api/c2c/documents/:id/sections/:key/versions ────────────────────────
//
// The section's own Part-11 history: the c2c_document_section_versions rows the
// snapshot trigger writes on every content change, each with its author and
// reason. This is what the dossier drawer's Activity tab shows. It used to show
// events the BROWSER wrote into an in-memory list — attributed to "You · Reg
// Lead", with a Math.random id — before and regardless of whether this route's
// PATCH succeeded. A record no server witnessed is not an audit trail.
router.get('/:id/sections/:key/versions', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return send403(res);
  const { id, key } = req.params;
  try {
    const docCheck = await pool.query(
      `SELECT 1 FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [id, orgId],
    );
    if (docCheck.rows.length === 0) return send404(res);
    const { rows } = await pool.query(
      `SELECT v.id, v.version, v.author_id, v.author_kind, v.reason, v.occurred_at,
              COALESCE(u.name, u.email) AS author_name
         FROM c2c_document_section_versions v
         JOIN c2c_document_sections s ON s.id = v.section_id
         JOIN c2c_documents d ON d.id = s.document_id AND d.org_id = $3
         -- Named through public.actor_name, not users: since users took row-level
         -- security (D3, 2026-09-28) a join on users found no one who had left
         -- the organization (docs/evidence/D3/2026-09-29-actor-names/).
         LEFT JOIN LATERAL public.actor_name(v.author_id) u ON TRUE
        WHERE s.document_id = $1 AND s.section_key = $2
        ORDER BY v.version DESC
        LIMIT 200`,
      [id, key, orgId],
    );
    return res.json({
      data: rows.map((r) => ({
        id: String(r.id),
        version: r.version,
        authorId: r.author_id,
        authorName: r.author_name ?? null,
        authorKind: r.author_kind,
        reason: r.reason,
        occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at,
      })),
    });
  } catch (err: unknown) {
    console.error('[c2c/documents] GET /:id/sections/:key/versions', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── PATCH /api/c2c/documents/:id/sections/:key ───────────────────────────────
//
// Moves a section between the unsigned states ('todo' | 'drafted' | 'review'),
// audited in the same transaction.
//
// It does NOT write section text (document store consolidation step 5,
// 2026-10-17; docs/design/DOCUMENT_STORE_CONSOLIDATION.md). The authoring
// editor is the one editor, and its write-through — commitSectionToFiling
// (server/services/c2c/commit-section-to-filing.ts), called in-process inside
// PATCH /api/authoring/sections/:sectionId's transaction — is the one writer of
// c2c_document_sections.content. This route was the second editor's save (the
// MDx dossier drawer, whose useSectionSave hook is deleted; the drawer now
// shows the text read-only and opens the authoring editor). A body carrying
// `content` is refused before anything is read or written: two editors over
// one filing section is the split the write-through exists to close, and a
// direct write here would leave authoring_sections disagreeing with the filing.
//
// The write-through does not come through this route, so refusing every
// content body refuses nothing it needs. Readiness is recomputed by the
// section trigger on any status change and is unaffected.

router.patch('/:id/sections/:key', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { id, key } = req.params;
  const { content, status, reason } = req.body as {
    content?: unknown;
    status?:  string;
    reason?:  string;
  };

  /* Consolidation step 5: section text is written only by the authoring
     write-through. Refused before anything is read or written. */
  if (content !== undefined) {
    return res.status(409).json({
      code: 'SECTION_TEXT_IS_AUTHORED',
      error: 'SECTION_TEXT_IS_AUTHORED',
      message:
        'Section text is written from the authoring editor, which files it into this section when you save there. ' +
        'Open the section in the authoring editor to change it. Nothing was changed.',
    });
  }
  if (status === undefined) {
    return send400(res, 'status required');
  }
  /* Spine F1 (2026-10-08): approval and lock are signed acts, not field edits.
     This route accepted status 'approved' (and 'locked') with only a reason, so
     a section could read approved — and count toward readiness and the
     dispatch gate — with no electronic signature behind it (21 CFR Part 11
     §11.50/§11.70). A section is approved by the approver's signature on the
     bound authoring document (POST /api/authoring/docs/:docId/e-sign or /sign,
     which move the bound sections whose text is the text signed, in the
     signature's own transaction). Nothing sets a section 'locked'; the document
     lock (POST /api/c2c/documents/:id/lock) sets c2c_documents.status only.
     Refused before anything is read or written. A locked section is not
     moved at all. */
  if (status === 'approved' || status === 'locked') {
    return res.status(409).json({
      code: 'APPROVAL_REQUIRES_SIGNATURE',
      error: 'APPROVAL_REQUIRES_SIGNATURE',
      message:
        status === 'approved'
          ? 'A section is approved only by an electronic signature with the meaning Approval on the authoring document bound to this filing, and only when its text is the text signed. Nothing was changed.'
          : 'A section cannot be locked here. Lock the document (POST /api/c2c/documents/:id/lock). Nothing was changed.',
    });
  }
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return send400(res, 'reason required for Part-11 attribution');
  }

  const VALID_STATUSES = new Set(['todo','drafted','review','approved','locked']);
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return send400(res, `status must be one of: ${[...VALID_STATUSES].join(', ')}`);
  }

  try {
    // Verify doc org membership + lifecycle state.
    const docCheck = await pool.query(
      `SELECT status FROM c2c_documents WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [id, orgId],
    );
    if (docCheck.rows.length === 0) return send404(res);
    // A locked or submitted document is immutable: its sections must not be
    // edited in place. Amendments go through a new version/submission, not a raw
    // section PATCH — consistent with the /submit and /lock 409 guards.
    const docStatus = (docCheck.rows[0] as { status?: string }).status;
    if (docStatus === 'locked' || docStatus === 'submitted') {
      return res.status(409).json({ error: docStatus === 'submitted' ? 'DOCUMENT_SUBMITTED' : 'DOCUMENT_LOCKED' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      /* ── A SEALED DOCUMENT'S FILED TEXT IS SEALED TOO ────────────────────
       * The authoring freeze sets `authoring_documents.status = 'FROZEN'` and
       * writes `frozen_documents`; it does not touch `c2c_documents`, and the
       * lifecycle check above reads only that. So this route — then the MDx
       * editor's save, and the writer of the store an eCTD leaf is
       * materialized from — was the one content path that could change a
       * FROZEN or APPROVED document's text while its seal, and every signature
       * over it, covered the editing layer only. §11.10(e) requires the record
       * a signature is applied to be protected from alteration. It no longer
       * writes text, and moving a sealed record through the workflow is still
       * a change to it, so the guard stays.
       *
       * Through the ONE canonical guard, which is that module's own stated
       * rule ("one guard, called by every writer"), and on the TRANSACTION
       * client, so a concurrent freeze cannot commit between the check and the
       * write. A filing with no bound authoring document is unaffected. */
      const seal = await checkFilingWritable(client, String(id), orgId);
      if (!seal.writable) {
        await client.query('ROLLBACK');
        client.release();
        return res
          .status(seal.code === 'SEAL_CHECK_UNAVAILABLE' ? 503 : 403)
          .json({ code: seal.code, error: seal.code, message: seal.reason });
      }

      // Part-11 attribution GUCs, transaction-local (`set_config(..., true)`,
      // never `SET LOCAL ... = $1`, which is a 42601 parse error under the
      // extended protocol). A status change does not snapshot a version — the
      // trigger fires on content — but the attribution is set for any trigger
      // that reads it, and does not leak to the next borrower of the pool.
      await client.query(`SELECT set_config('app.actor_id', $1, true)`, [String(userId)]);
      await client.query(`SELECT set_config('app.reason', $1, true)`, [reason.trim()]);

      // Its status is read on this transaction (FOR UPDATE): a locked section
      // is not moved.
      const existing = await client.query(
        `SELECT id, status FROM c2c_document_sections WHERE document_id = $1 AND section_key = $2 FOR UPDATE`,
        [id, key],
      );
      const previousStatus =
        (existing.rows[0] as { status?: string } | undefined)?.status ?? null;
      if (previousStatus === 'locked') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          code: 'SECTION_LOCKED',
          error: 'SECTION_LOCKED',
          message: 'This section is locked, so it is not edited in place. Nothing was changed.',
        });
      }

      let row: any;
      if (existing.rows.length === 0) {
        // Not created yet — INSERT with no text. Label, path_order and the
        // parent come from the rule pack when available. Without its parent a
        // section reads as a root, and the heading above it as a section that
        // holds nothing, which readiness then counts (F23 8/9).
        const rpackRes = await client.query(
          `SELECT elem ->> 'label' AS label,
                  (elem ->> 'path_order')::integer AS path_order,
                  (elem ->> 'mandatory')::boolean AS mandatory,
                  elem ->> 'parent_key' AS parent_key
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
        const ins = await client.query(
          `INSERT INTO c2c_document_sections
             (document_id, section_key, label, path_order, mandatory, content, status, parent_key)
           VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6, $7)
           RETURNING *`,
          [id, key, rpackRow?.label ?? key, rpackRow?.path_order ?? 0, rpackRow?.mandatory ?? false, status, rpackRow?.parent_key ?? null],
        );
        row = ins.rows[0];
      } else {
        const upd = await client.query(
          `UPDATE c2c_document_sections
           SET status = $3, updated_at = now()
           WHERE document_id = $1 AND section_key = $2
           RETURNING *`,
          [id, key, status],
        );
        row = upd.rows[0];
      }

      // 21 CFR Part 11 §11.10(e): record the audit IN the same transaction as
      // the section change, so they commit or roll back together.
      await recordGovernedAction(client, {
        orgId,
        userId,
        command: 'transition',
        target: `section:${id}:${key}`,
        reason: reason.trim(),
        payload: { status },
        domain: 'documents',
        surface: 'api',
      });

      await client.query('COMMIT');

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

    // 21 CFR Part 11 §11.10(e): create the evidence link and its audit in one
    // transaction, so they commit or roll back together. Previously the insert
    // ran on its own and the audit fired fire-and-forget afterwards with a
    // swallowed error, so a crash or audit failure left the create unaudited.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO c2c_document_section_evidence
           (section_id, evidence_kind, evidence_ref, paragraph_id, confidence, linked_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [sectionId, evidenceKind, evidenceRef, paragraphId ?? null, confidence ?? null, userId],
      );
      await recordGovernedAction(client, {
        orgId,
        userId,
        command: 'resolve',
        target: `section:${id}:${key}`,
        reason: reason ?? 'evidence linked',
        payload: { evidenceRef },
        domain: 'documents',
        surface: 'api',
      });
      await client.query('COMMIT');
      return res.status(201).json(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

    // 21 CFR Part 11 §11.10(e): audit the unlink and perform the DELETE in ONE
    // transaction, so they are atomic — a failure of either rolls back both. The
    // ledger never records a deletion of regulated evidence that didn't happen,
    // and evidence is never deleted without its audit.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await writeMutation(
        'resolve',
        { target: `section:${id}:${key}`, reason: 'evidence unlinked', payload: { evidenceId: evId } },
        userId,
        orgId,
        'api',
        'documents',
        client,
      );
      await client.query(`DELETE FROM c2c_document_section_evidence WHERE id = $1`, [evId]);
      await client.query('COMMIT');
      return res.status(204).send();
    } catch (txnErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txnErr;
    } finally {
      client.release();
    }
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

  const { reason, reauth } = req.body as { reason?: string; reauth?: Parameters<typeof verifyReauth>[1] };
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return send400(res, 'reason required');
  }

  // Locking is the governed `lock` command, and passes the gate every
  // high-risk command passes on POST /api/c2c/actions/lock: the signer
  // re-verified (§11.200), then not the document's author (separation of
  // duties). Until 2026-09-23 this route wrote the same ledger row through
  // writeMutation, which runs neither: the session alone locked a document,
  // its author could lock it, and the `reauth` it accepted was never read.
  // Re-verified first, so an unverified caller learns nothing of the document.
  const verified = await verifyReauth(userId, reauth);
  if (!verified.ok) {
    res.setHeader('WWW-Authenticate', 'ReAuth required');
    return res.status(401).json({ error: verified.error ?? 'REAUTH_REQUIRED' });
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
    await assertSignerIsNotAuthor(`document:${req.params.id}`, orgId, userId, { command: 'lock' });

    // Atomic: the governed-action audit and the lock UPDATE commit or roll back
    // together, so the ledger can never record a lock the document didn't take.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await writeMutation(
        'lock',
        { target: `document:${req.params.id}`, reason: reason.trim(), reauth } as any,
        userId,
        orgId,
        'api',
        'documents',
        client,
      );
      await client.query(
        `UPDATE c2c_documents SET status = 'locked', locked_at = now(), updated_at = now()
         WHERE id = $1`,
        [req.params.id],
      );
      await client.query('COMMIT');
      return res.json({ ...result, status: 'locked' });
    } catch (txnErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const sod = separationOfDutiesRefusal(err, 'c2c/documents/lock');
    if (sod) return res.status(sod.status).json(sod.body);
    console.error('[c2c/documents] POST /:id/lock', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ── POST /api/c2c/documents/:id/submit ───────────────────────────────────────
//
// Sets submitted_at and status='submitted' — on evidence that a filing actually
// happened. This route used to flip the status on a reason string alone: no
// package assembled, no sequence dispatched, nothing left the platform, yet the
// document (and every surface that reads its status) claimed it had been filed.
// A status of 'submitted' is a regulatory claim, and this was the one place in
// the product that could make it without a basis.
//
// Two bases are accepted. Whichever is given is persisted on the governed
// ledger row this route already writes (c2c_ana_actions.payload, hash-chained
// into audit_logs) beside the actor and the reason:
//
//   sequenceId     — an ectd_sequences row in the caller's organization that
//                    has been dispatched (status 'dispatched', or dispatch_status
//                    'sent' / 'acknowledged'). submission_leaves cannot tie a
//                    sequence to a c2c document in the current schema — its
//                    document_id is an INTEGER polymorphic key and
//                    c2c_documents.id is TEXT — and c2c_documents has no
//                    sequence column, so the tie is recorded on the ledger row
//                    rather than inferred from a leaf that cannot exist.
//   externalFiling — { channel, reference, filedAt }: an explicit attestation
//                    that the filing was made outside the platform (ESG, CDRH
//                    portal, CESP, courier), with the gateway receipt or portal
//                    confirmation number. The operator's assertion, attributed
//                    to them — not the platform's.
//
// Snapshot to concept2cure_artifacts is Moat #5 scope — not wired here.

const DISPATCHED_DISPATCH_STATUSES = new Set(['sent', 'acknowledged']);

router.post('/:id/submit', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { reason, sequenceId, externalFiling } = req.body as {
    reason?: string;
    sequenceId?: unknown;
    externalFiling?: unknown;
  };
  if (!reason || typeof reason !== 'string' || reason.trim() === '') {
    return send400(res, 'reason required');
  }

  // Shape validation before any database work — the same hand validation the
  // rest of this file uses.
  let sequenceIdNum: number | null = null;
  if (sequenceId !== undefined) {
    const n = typeof sequenceId === 'string' ? Number(sequenceId) : sequenceId;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
      return send400(res, 'sequenceId must be a positive integer');
    }
    sequenceIdNum = n;
  }

  let external: { channel: string; reference: string; filedAt: string } | null = null;
  if (externalFiling !== undefined) {
    const ef = externalFiling as Record<string, unknown> | null;
    if (!ef || typeof ef !== 'object' || Array.isArray(ef)) {
      return send400(res, 'externalFiling must be an object { channel, reference, filedAt }');
    }
    const channel   = typeof ef.channel   === 'string' ? ef.channel.trim()   : '';
    const reference = typeof ef.reference === 'string' ? ef.reference.trim() : '';
    const filedAt   = typeof ef.filedAt   === 'string' ? Date.parse(ef.filedAt) : NaN;
    if (!channel)   return send400(res, 'externalFiling.channel required');
    if (!reference) return send400(res, 'externalFiling.reference required (gateway receipt or portal confirmation number)');
    if (Number.isNaN(filedAt)) return send400(res, 'externalFiling.filedAt must be an ISO 8601 date');
    external = { channel, reference, filedAt: new Date(filedAt).toISOString() };
  }

  if (sequenceIdNum === null && external === null) {
    return res.status(409).json({
      error: 'FILING_EVIDENCE_REQUIRED',
      message:
        'Nothing has been filed. Supply the dispatched sequenceId, or an externalFiling ' +
        '{ channel, reference, filedAt } attestation for a filing made outside the platform.',
    });
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

    const filing: Record<string, unknown> = {};
    if (sequenceIdNum !== null) {
      // Org-scoped, like the 'ectd-sequence' target resolver in actions.ts: an
      // id that does not resolve in this organization is indistinguishable
      // from one that does not exist.
      const seq = await pool.query(
        `SELECT id, status, dispatch_status, sequence_number, region
           FROM ectd_sequences
          WHERE id = $1::int AND organization_id = $2 AND deleted_at IS NULL
          LIMIT 1`,
        [sequenceIdNum, orgId],
      );
      if (seq.rows.length === 0) return send400(res, 'SEQUENCE_NOT_FOUND');
      const row = seq.rows[0] as {
        status: string; dispatch_status: string | null; sequence_number: string; region: string;
      };
      const dispatched =
        row.status === 'dispatched' ||
        (row.dispatch_status != null && DISPATCHED_DISPATCH_STATUSES.has(row.dispatch_status));
      if (!dispatched) {
        return res.status(409).json({
          error: 'SEQUENCE_NOT_DISPATCHED',
          sequenceStatus: row.status,
          dispatchStatus: row.dispatch_status,
        });
      }
      filing.sequence = {
        sequenceId: sequenceIdNum,
        sequenceNumber: row.sequence_number,
        region: row.region,
        status: row.status,
        dispatchStatus: row.dispatch_status,
      };
    }
    if (external) filing.external = external;

    // Atomic: the governed-action audit and the submit UPDATE commit or roll back
    // together, so the ledger can never record a submission that didn't take.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await writeMutation(
        'transition',
        { target: `document:${req.params.id}`, reason: reason.trim(), payload: { filing } },
        userId,
        orgId,
        'api',
        'documents',
        client,
      );
      await client.query(
        `UPDATE c2c_documents
         SET status = 'submitted', submitted_at = now(), updated_at = now()
         WHERE id = $1`,
        [req.params.id],
      );
      await client.query('COMMIT');
      return res.json({ ...result, status: 'submitted', filing });
    } catch (txnErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txnErr;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    console.error('[c2c/documents] POST /:id/submit', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
