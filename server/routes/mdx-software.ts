/**
 * Software lifecycle (IEC 62304) — backs Surface 6 of the paying-client beta.
 *
 *   GET    /api/mdx/software?program_id=<UUID>     list lifecycle items
 *   POST   /api/mdx/software                        create a new item
 *   GET    /api/mdx/software/:id                    single item
 *   PATCH  /api/mdx/software/:id                    partial update
 *   GET    /api/mdx/software-summary/:programId     completeness summary
 *
 * Items are typed by item_kind covering the IEC 62304 / FDA 2023 software
 * guidance / FDA 2023 cybersecurity guidance deliverable set:
 *   srs / sds / arch / unit_test / integration_test / system_test /
 *   release_note / anomaly_log / ots_list / sbom / pentest / threat_model /
 *   risk_control / use_error / cybersecurity_label
 *
 * Doc level is 'basic' or 'enhanced' per the FDA 2023 software guidance —
 * the kit's summary card surfaces which deliverables are required given
 * the chosen level. Safety class follows IEC 62304 (A | B | C).
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-software');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ITEM_KIND = [
  'srs', 'sds', 'arch', 'unit_test', 'integration_test', 'system_test',
  'release_note', 'anomaly_log', 'ots_list', 'sbom', 'pentest', 'threat_model',
  'risk_control', 'use_error', 'cybersecurity_label',
] as const;
const DOC_LEVEL = ['basic', 'enhanced'] as const;
const SAFETY_CLASS = ['A', 'B', 'C'] as const;
const ITEM_STATUS = ['draft', 'in_review', 'approved', 'superseded'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  kind:       z.enum(ITEM_KIND).optional(),
  status:     z.enum(ITEM_STATUS).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createBody = z.object({
  programId:          z.string().regex(UUID_RE).optional().nullable(),
  docLevel:           z.enum(DOC_LEVEL),
  safetyClass:        z.enum(SAFETY_CLASS).optional().nullable(),
  itemKind:           z.enum(ITEM_KIND),
  title:              z.string().min(1).max(500),
  identifier:         z.string().max(120).optional().nullable(),
  status:             z.enum(ITEM_STATUS).optional(),
  evidenceArtifactId: z.number().int().positive().optional().nullable(),
  notes:              z.string().max(8000).optional().nullable(),
});

const patchBody = createBody.partial();

/* ─── GET /api/mdx/software ───────────────────────────────────────── */

router.get('/software', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: programId, kind, status, limit = 300 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  if (kind)      { args.push(kind);      filters.push(`item_kind = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`status = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM software_lifecycle_items
        WHERE ${filters.join(' AND ')}
        ORDER BY item_kind, identifier NULLS LAST, updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

/* ─── POST /api/mdx/software ──────────────────────────────────────── */

router.post('/software', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  try {
    const { rows } = await pool.query(
      `INSERT INTO software_lifecycle_items (
         organization_id, program_id, doc_level, safety_class, item_kind,
         title, identifier, status, evidence_artifact_id, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.docLevel, p.safetyClass ?? null,
        p.itemKind, p.title, p.identifier ?? null,
        p.status ?? 'draft', p.evidenceArtifactId ?? null, p.notes ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create', err);
  }
});

/* ─── GET /api/mdx/software/:id ───────────────────────────────────── */

router.get('/software/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `SELECT * FROM software_lifecycle_items
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Software lifecycle item');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'get', err);
  }
});

/* ─── PATCH /api/mdx/software/:id ─────────────────────────────────── */

router.patch('/software/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', docLevel: 'doc_level', safetyClass: 'safety_class',
    itemKind: 'item_kind', title: 'title', identifier: 'identifier',
    status: 'status', evidenceArtifactId: 'evidence_artifact_id', notes: 'notes',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE software_lifecycle_items SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Software lifecycle item');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch', err);
  }
});

/* ─── GET /api/mdx/software-summary/:programId ────────────────────── */

/* Required-deliverable matrix per the FDA 2023 software guidance. Basic
   documentation level requires the core set; Enhanced adds SDS and the
   cybersecurity deliverables. The kit's surface uses this to compute
   "completeness %" against the right denominator. */
const REQUIRED_BASIC: ReadonlyArray<(typeof ITEM_KIND)[number]> = [
  'srs', 'arch', 'unit_test', 'integration_test', 'system_test',
  'release_note', 'anomaly_log', 'ots_list', 'sbom',
];
const REQUIRED_ENHANCED: ReadonlyArray<(typeof ITEM_KIND)[number]> = [
  ...REQUIRED_BASIC, 'sds', 'threat_model', 'pentest', 'cybersecurity_label',
];

router.get('/software-summary/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');

  try {
    /* Determine the doc level — most recent item wins; defaults to 'basic'
       when no items exist. */
    const levelRow = await pool.query<{ doc_level: string | null }>(
      `SELECT doc_level FROM software_lifecycle_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
      [orgId, programId],
    );
    const docLevel = (levelRow.rows[0]?.doc_level ?? 'basic') as 'basic' | 'enhanced';
    const required = docLevel === 'enhanced' ? REQUIRED_ENHANCED : REQUIRED_BASIC;

    const present = await pool.query<{ item_kind: string; n: number; approved: number }>(
      `SELECT item_kind, COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
         FROM software_lifecycle_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        GROUP BY item_kind`,
      [orgId, programId],
    );
    const byKind = new Map(present.rows.map((r) => [r.item_kind, r]));
    const matrix = required.map((kind) => ({
      kind,
      required: true,
      present:  (byKind.get(kind)?.n ?? 0) > 0,
      approved: (byKind.get(kind)?.approved ?? 0) > 0,
    }));
    const approvedCount = matrix.filter((m) => m.approved).length;
    const completion = required.length === 0
      ? 0
      : Math.round((approvedCount / required.length) * 100);

    return ok(res, {
      docLevel,
      completion,
      required:    required.length,
      approved:    approvedCount,
      matrix,
    });
  } catch (err) {
    return serverError(res, log, 'summary', err);
  }
});

export default router;
