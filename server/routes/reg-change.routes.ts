/**
 * Regulatory-change intelligence — GET + POST /api/reg-change.
 *
 * The org's tracked regulatory changes (FDA/ISO/IEC/EU horizon scan), held in
 * the REAL, org-scoped store `reg_change_items` (reg-change-service.ts — a live
 * write path, not the seed-only c2c_reg_changes blob), shaped on read to
 * exactly the keys the v2 RegChange surface renders ({ id, src, kind, when,
 * sev, live, title, summary, affects[], action, doc, owner, due }). The
 * `when_label` column rehydrates as `when`; the nested per-device impact list
 * (affects) rehydrates straight from JSONB.
 *
 *   GET  /api/reg-change  → list the org's tracked changes. Honest empty list.
 *   POST /api/reg-change  → record a tracked change (the real write path). Audited.
 *
 * Org scoped; 403 without org context. GET fails CLOSED to an honest empty list
 * (never 500, never fabricated) on a missing store (42P01), so an unprovisioned
 * store degrades gracefully.
 *
 * @module server/routes/reg-change.routes
 */
import { Router, type Request, type Response } from 'express';
import {
  createRegChange, listRegChanges, RegChangeValidationError, type RegChangeItemRow,
} from '../services/reg-change/reg-change-service';
import auditService from '../services/auditService';

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

function getUserId(req: Request): number | null {
  const r = req as { userId?: unknown; user?: { id?: unknown } };
  const raw = r.userId ?? r.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Shape a stored row to the surface's render contract (when_label → when). */
function toView(r: RegChangeItemRow) {
  return {
    id: r.id,
    src: r.src,
    kind: r.kind,
    when: r.when_label,
    sev: r.sev,
    live: r.live,
    title: r.title,
    summary: r.summary,
    affects: r.affects ?? [],
    action: r.action,
    doc: r.doc,
    owner: r.owner,
    due: r.due,
  };
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const rows = await listRegChanges(orgId);
    const data = rows.map(toView);
    return res.json({ data, meta: { count: data.length, source: 'reg_change_items' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read regulatory changes.' } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const change = await createRegChange(orgId, {
      title: String(b.title ?? ''),
      kind: String(b.kind ?? ''),
      sev: String(b.sev ?? ''),
      src: b.src != null ? String(b.src) : null,
      // The render contract calls it `when`; accept the internal name too.
      whenLabel: b.when != null ? String(b.when) : b.whenLabel != null ? String(b.whenLabel) : null,
      live: typeof b.live === 'boolean' ? b.live : null,
      summary: b.summary != null ? String(b.summary) : null,
      affects: b.affects,
      action: b.action != null ? String(b.action) : null,
      doc: b.doc != null ? String(b.doc) : null,
      owner: b.owner != null ? String(b.owner) : null,
      due: b.due != null ? String(b.due) : null,
      createdBy: userId,
    });
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'REG_CHANGE_RECORDED',
      resourceType: 'reg_change_item',
      resourceId: change.id,
      details: { title: change.title, kind: change.kind, sev: change.sev },
    });
    return res.status(201).json({ data: toView(change), id: change.id });
  } catch (err) {
    if (err instanceof RegChangeValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record regulatory change.' } });
  }
});

export default router;
