/**
 * NDA/BLA cockpit — CTD module readiness read + Module-1 admin worklist read/write.
 *
 * GET /api/nda-cockpit/modules → the org's per-module (M1–M5) completeness
 * roll-up, shaped to exactly the keys the v2 NdaCockpit "CTD readiness" panel
 * renders ({ m, label, pct, docs, open, gate }). The panel derives the overall
 * "% ready" from these rows.
 *
 * GET  /api/nda-cockpit/m1 → the org's Module-1 administrative document set
 *   ({ id, label, st, blocker, note }), ordered by seq, backing the surface's
 *   "Module 1 admin" worklist.
 * POST /api/nda-cockpit/m1 → append a new Module-1 document (label required;
 *   optional st/note) as an org-scoped persisted row.
 *
 * The PDUFA clock and Refuse-to-File log stay the surface's local-first lists.
 * Org scoped; 403 without org context; reads fail closed to an empty list on
 * 42P01 (never 500) and the write returns 503 PENDING_STORE on 42P01 so an
 * unprovisioned store never breaks the surface.
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

router.get('/modules', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT m, label, pct, docs, open_count, gate
         FROM c2c_nda_modules
        WHERE organization_id = $1
        ORDER BY m`,
      [orgId],
    );
    const data = rows.map((r) => ({
      m: r.m,
      label: r.label,
      pct: r.pct,
      docs: r.docs,
      open: r.open_count,
      gate: r.gate ?? null,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read NDA module readiness.' } });
  }
});

router.get('/m1', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, label, st, blocker, note
         FROM c2c_nda_m1_docs
        WHERE organization_id = $1
        ORDER BY seq, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      label: r.label,
      st: r.st,
      blocker: r.blocker ?? false,
      note: r.note ?? undefined,
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read NDA Module 1 documents.' } });
  }
});

/**
 * POST /api/nda-cockpit/m1 — append a Module-1 administrative document.
 *
 * The v2 NdaCockpit "Add a Module 1 document" form POSTs here once its read has
 * adopted the store (LIVE). Plain org-scoped persisted create — st defaults to
 * 'draft', blocker false, seq = max(seq)+1 for this org. Org scoped; 403
 * without org; 400 when label is missing; 503 PENDING_STORE on 42P01 so the
 * client falls back to its local-only behavior.
 */
router.post('/m1', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const label = str(body.label);
  if (!label) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: 'Missing required field(s): label.' },
    });
  }

  const st = str(body.st) || 'draft';
  const note = str(body.note) || null;
  const id = 'm1-' + Date.now();

  try {
    const { rows } = await pool.query(
      `INSERT INTO c2c_nda_m1_docs (organization_id, id, label, st, blocker, note, seq)
       VALUES ($1, $2, $3, $4, FALSE,
               $5,
               COALESCE((SELECT MAX(seq) FROM c2c_nda_m1_docs WHERE organization_id = $1), -1) + 1)
       RETURNING id, label, st, blocker, note`,
      [orgId, id, label, st, note],
    );
    const r = rows[0];
    const data = {
      id: r.id,
      label: r.label,
      st: r.st,
      blocker: r.blocker ?? false,
      note: r.note ?? undefined,
    };
    return res.status(201).json({ data, meta: { created: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'PENDING_STORE', message: 'NDA Module 1 store is not provisioned yet.' },
      });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create NDA Module 1 document.' } });
  }
});

export default router;
