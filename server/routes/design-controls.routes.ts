/**
 * Design controls — DHF design-input traceability read.
 *
 * GET /api/design-controls → the org's 21 CFR 820.30(c) design inputs, shaped
 * to exactly the keys the v2 DesignControls traceability matrix renders
 * ({ id, cat, req, riskRef, outputs, ver, verRef, val, valRef }). The surface
 * derives the traceability roll-up and the 820.30 completeness checklist from
 * these rows; the "new design input" form stays a local-first interaction.
 * Nested design outputs rehydrate straight from JSONB. Org scoped; 403 without
 * org context; fails closed to an empty list on 42P01 so an unprovisioned
 * store never 500s.
 *
 * D2, fold F1 slice A, 2026-10-29
 * (docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/):
 * the read and the write take the open project. c2c_design_controls records it
 * (migrations/20261029c_design_controls_and_risk_items_program_keys.sql). A
 * request that names a project (`program_id` on the read, `programId` in the
 * write's body) is admitted first, through admitProject
 * (server/lib/admit-project.ts, over programInOrganization): 404 when the
 * organization does not own the live project, 503 when the check cannot run,
 * and nothing read or written either way. It then works on that project's
 * inputs only, and its response says `meta.scope: 'program'` with the
 * `programId`. An input recorded without a project is the organization's
 * unscoped input, and no project read returns it. A request that names no
 * project behaves as before, and its response says `meta.scope:
 * 'organization'`. The write takes an editing role (requireEditorAccess, as
 * the UDI and labeling writes do since 43fb57cc).
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { admitProject } from '../lib/admit-project';
import { requireEditorAccess } from '../middleware/orgMembership';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('design-controls');

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The project a request names, or null when it names none. Anything that is
 * not a string is passed on as text, so the ownership check refuses it (404)
 * instead of the request quietly becoming an organization-wide one.
 */
function namedProgram(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

/** What a response covers: one project's inputs, or, with no project named, the organization's. */
function scopeOf(programId: string | null): { scope: 'program'; programId: string } | { scope: 'organization' } {
  return programId ? { scope: 'program', programId } : { scope: 'organization' };
}

type DcRow = {
  id: string; cat: string; req: string; risk_ref: string | null; outputs: unknown;
  ver: string | null; ver_ref: string | null; val: string | null; val_ref: string | null;
};

/** One row in the display shape the surface renders. */
function displayRow(r: DcRow) {
  return {
    id: r.id,
    cat: r.cat,
    req: r.req,
    riskRef: r.risk_ref ?? null,
    outputs: Array.isArray(r.outputs) ? r.outputs : [],
    ver: r.ver ?? null,
    verRef: r.ver_ref ?? null,
    val: r.val ?? null,
    valRef: r.val_ref ?? null,
  };
}

/** The organization's inputs, or, with a project, that project's only. The project is a bind parameter. */
async function readInputs(orgId: number, programId: string | null): Promise<DcRow[]> {
  const { rows } = programId
    ? await pool.query<DcRow>(
        `SELECT id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref
           FROM c2c_design_controls
          WHERE organization_id = $1 AND program_id = $2
          ORDER BY id`,
        [orgId, programId],
      )
    : await pool.query<DcRow>(
        `SELECT id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref
           FROM c2c_design_controls
          WHERE organization_id = $1
          ORDER BY id`,
        [orgId],
      );
  return rows;
}

const orgRequired = (res: Response) =>
  res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });

/** SQLSTATE of a failed statement, or undefined. */
const sqlState = (err: unknown) => (err as { code?: string } | null)?.code;

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = namedProgram(req.query.program_id);
  const scope = scopeOf(programId);
  try {
    if (!(await admitProject(res, log, programId, orgId))) return;
    const data = (await readInputs(orgId, programId)).map(displayRow);
    return res.json({ data, meta: { count: data.length, ...scope } });
  } catch (err) {
    if (sqlState(err) === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true, ...scope } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read design controls.' } });
  }
});

/**
 * POST /api/design-controls → create one org-scoped design input.
 *
 * A design input is a plain controlled record; adding one persists it untraced
 * (no output/verification/validation yet). Body: { req (required), cat, riskRef?,
 * outputs?, programId? }. Returns the created row in the same display shape the
 * GET renders so the surface adopts it straight into the traceability matrix.
 * An editing role; org scoped; 403 without org; 400 if the requirement is
 * missing; a named project is admitted first and recorded on the row; 42P01 →
 * 503 PENDING_STORE.
 */
router.post('/', requireEditorAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const body = (req.body ?? {}) as {
    req?: unknown;
    cat?: unknown;
    riskRef?: unknown;
    outputs?: unknown;
    programId?: unknown;
  };

  const requirement = typeof body.req === 'string' ? body.req.trim() : '';
  if (!requirement) {
    return res.status(400).json({ error: { code: 'INVALID', message: 'A requirement (req) is required.' } });
  }
  const cat = typeof body.cat === 'string' && body.cat.trim() ? body.cat.trim() : 'functional';
  const riskRef = typeof body.riskRef === 'string' && body.riskRef.trim() ? body.riskRef.trim() : null;
  const outputs = Array.isArray(body.outputs) ? body.outputs : [];
  const programId = namedProgram(body.programId);

  const id = 'dc-' + Date.now();

  try {
    if (!(await admitProject(res, log, programId, orgId))) return;
    const { rows } = await pool.query<DcRow>(
      `INSERT INTO c2c_design_controls
         (id, organization_id, cat, req, risk_ref, outputs, program_id)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref`,
      [id, orgId, cat, requirement, riskRef, JSON.stringify(outputs), programId],
    );
    return res.status(201).json({ data: displayRow(rows[0]), meta: { created: true, ...scopeOf(programId) } });
  } catch (err) {
    if (sqlState(err) === '42P01') {
      return res.status(503).json({ error: { code: 'PENDING_STORE', message: 'Design controls store is not provisioned yet.' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create design input.' } });
  }
});

export default router;
