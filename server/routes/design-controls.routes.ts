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
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';

const router = Router();

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

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref
         FROM c2c_design_controls
        WHERE organization_id = $1
        ORDER BY id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      cat: r.cat,
      req: r.req,
      riskRef: r.risk_ref ?? null,
      outputs: Array.isArray(r.outputs) ? r.outputs : [],
      ver: r.ver ?? null,
      verRef: r.ver_ref ?? null,
      val: r.val ?? null,
      valRef: r.val_ref ?? null,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read design controls.' } });
  }
});

/**
 * POST /api/design-controls → create one org-scoped design input.
 *
 * A design input is a plain controlled record; adding one persists it untraced
 * (no output/verification/validation yet). Body: { req (required), cat, riskRef?,
 * outputs? }. Returns the created row in the same display shape the GET renders
 * so the surface adopts it straight into the traceability matrix. Org scoped;
 * 403 without org; 400 if the requirement is missing; 42P01 → 503 PENDING_STORE.
 */
router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }

  const body = (req.body ?? {}) as {
    req?: unknown;
    cat?: unknown;
    riskRef?: unknown;
    outputs?: unknown;
  };

  const requirement = typeof body.req === 'string' ? body.req.trim() : '';
  if (!requirement) {
    return res.status(400).json({ error: { code: 'INVALID', message: 'A requirement (req) is required.' } });
  }
  const cat = typeof body.cat === 'string' && body.cat.trim() ? body.cat.trim() : 'functional';
  const riskRef = typeof body.riskRef === 'string' && body.riskRef.trim() ? body.riskRef.trim() : null;
  const outputs = Array.isArray(body.outputs) ? body.outputs : [];

  const id = 'dc-' + Date.now();

  try {
    const { rows } = await pool.query(
      `INSERT INTO c2c_design_controls
         (id, organization_id, cat, req, risk_ref, outputs)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, cat, req, risk_ref, outputs, ver, ver_ref, val, val_ref`,
      [id, orgId, cat, requirement, riskRef, JSON.stringify(outputs)],
    );
    const r = rows[0];
    const data = {
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
    return res.status(201).json({ data, meta: { created: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({ error: { code: 'PENDING_STORE', message: 'Design controls store is not provisioned yet.' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create design input.' } });
  }
});

export default router;
