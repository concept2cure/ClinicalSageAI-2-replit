/**
 * NDA/BLA cockpit — CTD module readiness read + Module-1 admin worklist read/write.
 *
 * GET /api/nda-cockpit/modules → the org's per-module (M1–M5) completeness
 * roll-up, shaped to exactly the keys the v2 NdaCockpit "CTD readiness" panel
 * renders ({ m, label, pct, docs, open, gate }). The panel derives the overall
 * "% ready" from these rows. This read is CONVERGED onto the REAL, org-scoped
 * eCTD submission core (submissions where application_type IN ('nda','bla') +
 * ectd_sequences + submission_leaves + coauthor_documents) — the same store the
 * IND checklist converged onto — assembled by nda-modules-view-assembler. There
 * is no seed-only blob and no fallback: an org with no NDA/BLA submission returns
 * an empty list (meta.source = 'submissions') and the surface renders its honest
 * empty state.
 *
 * GET  /api/nda-cockpit/m1 → the org's Module-1 administrative document set
 *   ({ id, label, st, blocker, note }), ordered by seq, backing the surface's
 *   "Module 1 admin" worklist.
 * POST /api/nda-cockpit/m1 → append a new Module-1 document (label required;
 *   optional st/note) as an org-scoped persisted row.
 *
 * GET  /api/nda-cockpit/rtf → the org's Refuse-to-File risk log
 *   ({ id, sev, area, text, fix }), ordered by seq, backing the surface's
 *   "Refuse-to-File risk" list.
 * POST /api/nda-cockpit/rtf → append a new filing-risk item (area + text
 *   required; optional sev/fix) as an org-scoped persisted row.
 *
 * The PDUFA clock stays the surface's local-first list. Org scoped; 403 without
 * org context; reads fail closed to an empty list on
 * 42P01 (never 500) and the write returns 503 PENDING_STORE on 42P01 so an
 * unprovisioned store never breaks the surface.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { assembleOrgNdaModules } from '../services/nda/nda-modules-view-assembler.js';

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
    const data = await assembleOrgNdaModules(orgId);
    return res.json({ data, meta: { count: data.length, source: 'submissions' } });
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

router.get('/rtf', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, sev, area, text, fix
         FROM c2c_nda_rtf
        WHERE organization_id = $1
        ORDER BY seq, id`,
      [orgId],
    );
    const data = rows.map((r) => ({
      id: r.id,
      sev: r.sev,
      area: r.area,
      text: r.text,
      fix: r.fix ?? '',
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read NDA Refuse-to-File risks.' } });
  }
});

/**
 * POST /api/nda-cockpit/rtf — append a Refuse-to-File risk-log item.
 *
 * The v2 NdaCockpit "Log a filing-risk item" form POSTs here once its read has
 * adopted the store (LIVE). Plain org-scoped persisted create — sev defaults to
 * 'med', seq = max(seq)+1 for this org. Org scoped; 403 without org; 400 when
 * area or text is missing; 503 PENDING_STORE on 42P01 so the client falls back
 * to its local-only behavior.
 */
router.post('/rtf', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const area = str(body.area);
  const text = str(body.text);
  const missing = [!area && 'area', !text && 'text'].filter(Boolean);
  if (missing.length) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: `Missing required field(s): ${missing.join(', ')}.` },
    });
  }

  const sev = str(body.sev) || 'med';
  const fix = str(body.fix) || null;
  const id = 'rtf-' + Date.now();

  try {
    const { rows } = await pool.query(
      `INSERT INTO c2c_nda_rtf (organization_id, id, sev, area, text, fix, seq)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE((SELECT MAX(seq) FROM c2c_nda_rtf WHERE organization_id = $1), -1) + 1)
       RETURNING id, sev, area, text, fix`,
      [orgId, id, sev, area, text, fix],
    );
    const r = rows[0];
    const data = {
      id: r.id,
      sev: r.sev,
      area: r.area,
      text: r.text,
      fix: r.fix ?? '',
    };
    return res.status(201).json({ data, meta: { created: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'PENDING_STORE', message: 'NDA Refuse-to-File store is not provisioned yet.' },
      });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create NDA Refuse-to-File risk.' } });
  }
});

export default router;
