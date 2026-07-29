/**
 * PDEV evidence-object library read — `GET /api/evidence-objects`.
 *
 * Backs the pdev Evidence Picker's search list
 * (client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx). Before this route
 * existed the picker's fetch 404'd and the list sat in a permanent empty state.
 *
 * The picker parses `{ data: EvidenceObjectRow[] }` where each row is
 * `{ id, title, type, category, source }` and renders
 * `{title}` + `{type} · {category} · {source}` — so the SELECT aliases the
 * store's columns to exactly those keys. The client is the contract.
 *
 * Request shape from the picker:
 *   GET /api/evidence-objects?programId=<uuid>[&q=<text>]
 *
 *   - org-scoped: rows are filtered by the caller's organization only. The
 *     library is org-wide (evidence is cross-program attachable), so `programId`
 *     is accepted but NOT used as a row filter — filtering by the picker's
 *     program would re-empty the list for programs whose evidence lives under a
 *     different code. Program context travels in `program_code`/`title` instead,
 *     which the `q` search covers.
 *   - `q`: case-insensitive ILIKE across title / source / type / category /
 *     program_code, still org-scoped.
 *
 * Envelope: ok/orgRequired/serverError ({ data, meta }). Fails closed to an
 * empty envelope on 42P01 so the picker degrades to its empty-state (and the
 * kit fixture is never resurrected) when the store isn't provisioned.
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
// Org-scoped evidence library shaped to the picker's display contract
// ({ id, title, type, category, source }). Optional `q` narrows via ILIKE.
router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (orgId === null) return orgRequired(res);

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const params: unknown[] = [orgId];
  let where = 'WHERE organization_id = $1';
  if (q) {
    params.push(`%${q}%`);
    where +=
      ' AND (title ILIKE $2 OR source ILIKE $2 OR evidence_type ILIKE $2' +
      ' OR evidence_category ILIKE $2 OR program_code ILIKE $2)';
  }

  try {
    const { rows } = await pool.query(
      `SELECT id::text                  AS id,
              title                      AS title,
              evidence_type             AS "type",
              evidence_category         AS "category",
              source                    AS "source"
         FROM c2c_evidence_objects
         ${where}
        ORDER BY title ASC`,
      params,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return ok(res, [], { count: 0, pendingStore: true });
    }
    return serverError(res, log, 'list-evidence-objects', err);
  }
});

export default router;
