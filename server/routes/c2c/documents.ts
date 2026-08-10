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
 *   POST   /api/c2c/documents/:id/sections/:key/ai-draft — SSE streaming AnA draft
 *
 * The /ai-draft route (S1) heals the split-brain: AnA now drafts directly into
 * the governed c2c_documents model this UI reads, streaming tokens over SSE
 * instead of the legacy blocking JSON call on authoring_sections. It does NOT
 * persist — the human accepts a streamed draft via PATCH (draftSource:'ana'),
 * preserving the human-in-the-loop and Part-11 attribution contracts.
 *
 * @module server/routes/c2c/documents
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { writeMutation, recordGovernedAction } from './actions.js';
import { detectSpans } from '../../services/sentenceTraceabilityService.js';
import {
  replaceAuthorSpans,
  assertLineageCoversContent,
} from '../../services/clinical-regulatory-evidence/span-lineage.service.js';
import {
  normalizeRulePackProvenance,
  rulePackProvenanceSelectSql,
} from '../../../shared/rule-pack-provenance.js';

/** The raw column names `rulePackProvenanceSelectSql` puts on a row. */
const RAW_PROVENANCE_COLUMNS = new Set([
  'source_basis',
  'confidence',
  'review_status',
  'governing_rule',
  'uncertainties',
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

/**
 * The canonical plain text of a c2c section, for lineage purposes.
 *
 * `c2c_document_sections.content` is jsonb — `{ paragraphs: [{ id, text, … }] }`
 * — while span lineage addresses half-open character ranges over a string. This
 * is the one function that decides how that jsonb becomes those characters, and
 * it MUST be the only one: spans are recorded against the string it returns and
 * later verified against the string it returns, so any second serialisation
 * would silently shift every offset and make provenance point at the wrong words.
 *
 * Paragraphs are joined with a blank line, which is how the editor renders them.
 * Non-string or absent text contributes nothing rather than "undefined".
 */
export function sectionPlainText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const paras = (content as { paragraphs?: unknown }).paragraphs;
  if (!Array.isArray(paras)) return '';
  return paras
    .map((p) => (p && typeof p === 'object' ? (p as { text?: unknown }).text : undefined))
    .filter((t): t is string => typeof t === 'string')
    .join('\n\n');
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
              d.status, d.readiness, rp.required_sections,
              ${rulePackProvenanceSelectSql('rp')}
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
        // What the tree below was built FROM. The editor navigates by this
        // outline, so this is the one place a filer is guaranteed to be
        // looking when the answer matters.
        provenance: normalizeRulePackProvenance(doc),
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
  const { content, status, reason, draftSource } = req.body as {
    content?:     Record<string, unknown>;
    status?:      string;
    reason?:      string;
    draftSource?: string;
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

  // Accepting an AnA-authored draft attributes it to 'ana' (vs default 'human'),
  // so the version trigger records who really produced the content. Only these
  // two provenance kinds are writable through this route; 'imported'/'template'
  // come from other paths.
  const VALID_DRAFT_SOURCES = new Set(['human', 'ana']);
  if (draftSource !== undefined && !VALID_DRAFT_SOURCES.has(draftSource)) {
    return send400(res, `draftSource must be one of: ${[...VALID_DRAFT_SOURCES].join(', ')}`);
  }
  const resolvedDraftSource = draftSource ?? 'human';

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

      // Set GUCs for Part-11 trigger attribution.
      //
      // `set_config(..., true)`, NOT `SET LOCAL ... = $1`. `SET` is a utility
      // statement and its grammar has no parameter production, so a bind
      // placeholder is a syntax error — and node-postgres uses the extended
      // protocol whenever a values array is passed, so it fails at Parse with
      // 42601 every single time. It threw here, before the existence check
      // below, which meant NEITHER the INSERT branch nor the UPDATE branch ever
      // ran: no section was ever created or updated through this route, and the
      // catch-all turned it into a 500. The dossier editor rendered
      // "Not saved — HTTP 500" for every save.
      //
      // The rest of the repository already knew this — server/middleware/
      // tenantContext.ts, server/services/tenant/governed-tenant-context.ts and
      // eleven call sites in server/src/routes/stability.router.ts all use
      // set_config(). This route was the only place that deviated.
      //
      // `true` is the is_local flag: it scopes the setting to the surrounding
      // transaction exactly as SET LOCAL would, so the BEFORE UPDATE trigger
      // c2c_snapshot_section_version() sees the actor and the value does not
      // leak to the next borrower of this pooled connection.
      await client.query(`SELECT set_config('app.actor_id', $1, true)`, [String(userId)]);
      await client.query(`SELECT set_config('app.reason', $1, true)`, [reason.trim()]);

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
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           RETURNING *`,
          [
            id, key, label, pathOrder, mandatory,
            content !== undefined ? JSON.stringify(content) : '{}',
            status ?? 'drafted',
            resolvedDraftSource,
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
          params.push(resolvedDraftSource);
          setClauses.push(`draft_source = $${params.length}`);
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

      // 21 CFR Part 11 §11.10(e): record the audit IN the same transaction as
      // the section change, so they commit or roll back together. Previously
      // the audit ran fire-and-forget AFTER COMMIT with a swallowed error, so a
      // crash (or an audit failure) left a section transition unaudited.
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

      // ── Lineage gate ───────────────────────────────────────────────────────
      //
      // The same invariant PATCH /api/authoring/sections/:sectionId enforces:
      // content and its provenance commit together or neither does. Until now
      // this route had no gate at all, so the governed store — the system of
      // record for a regulatory filing — was the one write path where text could
      // land with nothing recorded about where it came from. Anything reading
      // lineage would report full coverage of the spans it happened to have and
      // say nothing about the rest, which is worse than reporting none.
      //
      // Inside the existing transaction on purpose: a refused save must leave no
      // section row behind.
      if (content !== undefined) {
        const plain = sectionPlainText(content);
        if (plain.trim().length > 0) {
          const ref = {
            documentTable: 'c2c_document_sections',
            // bigserial id -> the lineage table's text document_id.
            documentId: String(row.id),
          };
          const spans = detectSpans(plain, 'clause').map((s) => ({
            charStart: s.charStart,
            charEnd: s.charEnd,
            spanText: s.text,
          }));

          await replaceAuthorSpans(
            orgId,
            ref,
            spans,
            { assertedBy: String(userId), createdBy: String(userId) },
            client,
          );

          // Ask the database what it is about to commit rather than trusting
          // that the writer not throwing means the rows say what they should.
          await assertLineageCoversContent(orgId, ref, plain, client);
        }
      }

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
    // Distinguish a refused save from a generic fault, so the editor can say
    // why. A 500 that reads INTERNAL_ERROR when the real answer is "this text
    // has no recorded provenance" trains people to retry rather than fix it.
    const msg = err instanceof Error ? err.message : String(err);
    if (/lineage/i.test(msg)) {
      return res.status(500).json({
        error: 'LINEAGE_REQUIRED',
        message:
          'The section was not saved: its data lineage could not be recorded. ' +
          'Saving content without provenance is not permitted.',
      });
    }
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

    // Atomic: the governed-action audit and the submit UPDATE commit or roll back
    // together, so the ledger can never record a submission that didn't take.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await writeMutation(
        'transition',
        { target: `document:${req.params.id}`, reason: reason.trim() },
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
      return res.json({ ...result, status: 'submitted' });
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

// ── POST /api/c2c/documents/:id/sections/:key/ai-draft ───────────────────────
//
// S1 — Streaming AnA draft on the CANONICAL model. Reuses the AI gateway's
// native streaming (gateway.route({stream,onStream})) and the Data-Room hybrid
// RAG retrieval that the legacy blocking route used, but emits tokens over SSE
// so the author sees the draft form in real time instead of waiting for a whole
// 3k-token completion.
//
// Contract: this route NEVER persists. It streams a proposed draft; the human
// accepts it by calling PATCH …/sections/:key with {content, draftSource:'ana'},
// which runs the Part-11 version trigger. Nothing is written to the governed
// document without a human hand — the truthfulness/human-in-the-loop contract.
//
// SSE events: {type:'meta'} (sources retrieved, model), {type:'text',content},
// {type:'thinking',content}, {type:'draft_complete', content, metadata},
// {type:'error', message}, {type:'done'}.

router.post('/:id/sections/:key/ai-draft', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId  = resolveOrgId(req);
  if (!userId || !orgId) return send403(res);

  const { id, key } = req.params;
  const { tone = 'professional', context, requirements } = (req.body ?? {}) as {
    tone?: string; context?: string; requirements?: string;
  };

  // Resolve the section within its document + rule pack so the prompt carries
  // real doc_type / agency / label / product context — org-scoped for tenancy.
  let section: {
    label: string; doc_type: string; agency: string;
    title: string; product_code: string | null;
  };
  try {
    // Document + product context (org-scoped for tenancy).
    const docRes = await pool.query(
      `SELECT d.doc_type, d.agency, d.title AS doc_title, d.rule_pack_version,
              COALESCE(p.product_code, p.code, '') AS product_code
       FROM c2c_documents d
       LEFT JOIN regulatory_programs p ON p.id = d.project_id
       WHERE d.id = $1 AND d.org_id = $2 LIMIT 1`,
      [id, orgId],
    );
    if (docRes.rows.length === 0) return send404(res);
    const r = docRes.rows[0] as any;

    // Resolve the human-readable section label from the rule pack (same jsonb
    // pattern PATCH uses); fall back to the key if the section isn't listed.
    const labelRes = await pool.query(
      `SELECT elem ->> 'label' AS label
       FROM c2c_rule_packs rp,
            jsonb_array_elements(rp.required_sections) AS elem
       WHERE rp.doc_type = $1 AND rp.agency = $2 AND rp.version = $3
             AND elem ->> 'key' = $4
       LIMIT 1`,
      [r.doc_type, r.agency, r.rule_pack_version, key],
    );
    const sectionLabel = (labelRes.rows[0] as any)?.label ?? key;

    section = {
      label: sectionLabel,
      doc_type: r.doc_type,
      agency: r.agency,
      title: r.doc_title,
      product_code: r.product_code || null,
    };
  } catch (err: unknown) {
    console.error('[c2c/documents] ai-draft section resolve', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  // Open the SSE stream.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const sse = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // ── Data-Room hybrid RAG (same retrieval the legacy route used) ────────────
  let evidenceBlock = '';
  let sourcesRetrieved = 0;
  try {
    const { getEmbeddingService } = await import('../../services/enhancedEmbeddingService.js');
    const embeddingService = getEmbeddingService(pool);
    const searchQuery = `${section.doc_type} ${key} ${section.label} ${section.product_code || ''}`.trim();
    const searchResults = await embeddingService.searchHybrid(searchQuery, 5, 0.65);
    if (searchResults.length > 0) {
      sourcesRetrieved = searchResults.length;
      evidenceBlock =
        '\n\n--- RETRIEVED EVIDENCE FROM DATA ROOM (cite as [SRC-n]) ---\n' +
        searchResults
          .map((r: any, i: number) => {
            const content = r.content.length > 600 ? r.content.substring(0, 600) + '…' : r.content;
            return `[SRC-${i + 1}] "${r.title}"\n${content}`;
          })
          .join('\n\n') +
        '\n--- END EVIDENCE ---\n\n' +
        'When your content relies on evidence above, cite it inline using [SRC-n]. ' +
        'Do NOT fabricate citations for evidence not provided.';
    }
  } catch (e: any) {
    console.warn('[c2c/documents] ai-draft Data Room retrieval failed (non-fatal):', e?.message);
  }

  sse({ type: 'meta', sourcesRetrieved });

  // ── Stream the draft from the gateway ──────────────────────────────────────
  try {
    const { getGateway } = await import('../../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      // Honest failure — no fabricated content when no provider is available.
      sse({ type: 'error', message: 'AI drafting is unavailable (no model provider configured).' });
      sse({ type: 'done' });
      return res.end();
    }

    // Industry-specific tailoring: resolve the framework-grade system prompt for
    // THIS build type from the Global Document Registry — the same authoring
    // brain the batch drafter uses — so a 510(k) section drafts like a 510(k), an
    // IVDR section speaks to the Annex XIII performance evaluation, a CTD section
    // follows ICH M4, an eTMF artifact follows the DIA reference model. The map
    // normalizes c2c doc_type ids to registry submission types; unmapped types
    // fall back gracefully to the resolver's default.
    const { resolveSystemPrompt } = await import('../../services/ana/AnaDocumentDraftingService.js');
    const DOC_TYPE_TO_SUBMISSION: Record<string, string> = {
      k510: '510k', pma: 'PMA', denovo: 'De Novo', ide: 'IDE',
      ivdr: 'IVDR', ivdr_tf: 'IVDR', ivdr_pe: 'IVDR', cer: 'MDR',
      nda: 'NDA', bla: 'BLA', anda: 'ANDA', maa: 'MAA', impd: 'EU_CTA',
      ind: 'US_IND', ectd: 'NDA', dmf: 'DMF', tmf: 'US_IND',
    };
    const submissionType =
      DOC_TYPE_TO_SUBMISSION[String(section.doc_type).toLowerCase()] ?? section.doc_type;
    const systemPrompt = resolveSystemPrompt(submissionType);

    const prompt = `Generate professional ${section.agency} regulatory content for:
Document: ${section.title} (${section.doc_type})
Section: ${key} — ${section.label}
Product: ${section.product_code || 'the product'}
Tone: ${tone}
${context ? `Context: ${context}` : ''}
${requirements ? `Requirements: ${requirements}` : ''}
${evidenceBlock}

Provide detailed, compliance-ready content following ${section.agency} guidelines. Do not invent quantitative results; where a value is unknown, state that it must be supplied.`;

    let assembled = '';
    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      maxTokens: 3000,
      temperature: 0.3,
      stream: true,
      onStream: (chunk: string, meta?: { type?: string }) => {
        if (meta?.type === 'thinking') {
          sse({ type: 'thinking', content: chunk });
          return;
        }
        assembled += chunk;
        sse({ type: 'text', content: chunk });
      },
      organizationId: orgId,
      userId,
      callerModule: 'c2c/documents/ai-draft',
    });

    const finalContent = (assembled || gwResponse.content || '').trim();
    sse({
      type: 'draft_complete',
      content: finalContent,
      metadata: {
        tone,
        agency: section.agency,
        docType: section.doc_type,
        submissionType,
        sectionKey: key,
        model: gwResponse.model,
        provider: gwResponse.provider,
        sourcesRetrieved,
        generatedAt: new Date().toISOString(),
      },
    });
    sse({ type: 'done' });
    return res.end();
  } catch (err: unknown) {
    console.error('[c2c/documents] ai-draft stream', err);
    sse({ type: 'error', message: err instanceof Error ? err.message : 'draft generation failed' });
    sse({ type: 'done' });
    return res.end();
  }
});

export default router;
