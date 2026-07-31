/**
 * PDEV evidence-object library read — `GET /api/evidence-objects`.
 *
 * Backs the pdev Evidence Picker's search list
 * (client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx). Reads the REAL,
 * canonical evidence graph — `evidence_objects` (uuid PK, org-scoped; defined in
 * shared/schema/programs.ts, the SAME store the attach POST resolves against and
 * that 10+ live services read) — NOT the seed-only `c2c_evidence_objects` blob,
 * which is deprecated (db/migrations/20260717_evidence_objects_store.sql) and no
 * longer written by the demo seed.
 *
 * The picker parses `{ data: EvidenceObjectRow[] }` where each row is
 * `{ id, title, type, category, source }` and renders
 * `{title}` + `{type} · {category} · {source}` — so the SELECT aliases the real
 * columns to exactly those keys. The client is the contract.
 *
 * Column → contract mapping (real evidence_objects columns only — nothing
 * fabricated):
 *   id       ← id::text                                    (uuid PK)
 *   title    ← title                                       (text NOT NULL)
 *   type     ← evidence_type                               (text NOT NULL)
 *   category ← evidence_category                           (text NOT NULL)
 *   source   ← COALESCE(source_reference, source_type, '') (honest derivation)
 *
 *   The real table has NO single `source` column; provenance lives in
 *   `source_reference` (the URL / document ref / provenance label, e.g.
 *   "Internal CSR · TR-204-301") with `source_type` (NOT NULL, e.g. 'internal' /
 *   'literature') as the always-present fallback and '' as the final floor. All
 *   three are real columns — the picker's `source` is derived, never invented.
 *
 * Request shape from the picker:
 *   GET /api/evidence-objects?programId=<uuid>[&q=<text>]
 *
 *   - org-scoped: rows are filtered by the caller's organization only. The
 *     library is org-wide (evidence is cross-program attachable), so `programId`
 *     is accepted but NOT used as a row filter — the real table's `program_id` is
 *     a nullable link that the evidence library does not populate, so filtering by
 *     it would re-empty the list. Program context travels in the title / code /
 *     source_reference text instead, which the `q` search covers.
 *   - `q`: case-insensitive ILIKE across title / source_reference / source_type /
 *     evidence_type / evidence_category / code, still org-scoped. (The blob's
 *     `program_code` search column does not exist on the real table; `code` and
 *     the source/title text carry the program token, e.g. "204", "512".)
 *   - No status filter: the picker surfaces the org's whole evidence library, the
 *     same all-rows semantics the attach POST honors (it gates on id + org only).
 *
 * Envelope: ok/orgRequired/serverError ({ data, meta }); meta notes
 * source:'evidence_objects'. Fails closed to an empty envelope on 42P01 so the
 * picker degrades to its honest empty-state (never a crash, never a fixture) when
 * the store isn't provisioned.
 *
 * Mounted at its own prefix /api/evidence-objects (nothing else mounts it).
 *
 * @module server/routes/evidence-objects.routes
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('evidence-objects');

const router = Router();

/** Resolve the tenant id off the request (auth middleware populates these). */
function resolveOrgId(req: Request): number | null {
  const r = req as unknown as {
    tenantId?: unknown;
    organizationId?: unknown;
    user?: { organizationId?: unknown };
  };
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

// ── GET /api/evidence-objects ───────────────────────────────────────────────
//
// Org-scoped read of the REAL evidence_objects graph, shaped to the picker's
// display contract ({ id, title, type, category, source }). Optional `q` narrows
// via ILIKE across the real searchable columns.
router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId === null) return orgRequired(res);

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const params: unknown[] = [orgId];
  let where = 'WHERE organization_id = $1';
  if (q) {
    params.push(`%${q}%`);
    where +=
      ' AND (title ILIKE $2 OR source_reference ILIKE $2 OR source_type ILIKE $2' +
      ' OR evidence_type ILIKE $2 OR evidence_category ILIKE $2 OR code ILIKE $2)';
  }

  try {
    const { rows } = await pool.query(
      `SELECT id::text                              AS id,
              title                                 AS title,
              evidence_type                         AS "type",
              evidence_category                     AS "category",
              COALESCE(source_reference, source_type, '') AS "source"
         FROM evidence_objects
         ${where}
        ORDER BY title ASC`,
      params,
    );
    return ok(res, rows, { count: rows.length, source: 'evidence_objects' });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return ok(res, [], { count: 0, pendingStore: true, source: 'evidence_objects' });
    }
    return serverError(res, log, 'list-evidence-objects', err);
  }
});

export default router;
