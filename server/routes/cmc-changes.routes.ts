/**
 * Post-approval CMC change control — GET + POST /api/cmc-changes.
 *
 * The org's proposed CMC changes, held in the REAL, org-scoped store
 * `cmc_change_controls` (cmc-change-control-service.ts — a live write path, not the
 * seed-only c2c_cmc_changes blob), projected on read through the deterministic
 * SUPAC/variations classifier (`projectCmcChanges` → `classifyVariation`) into the shape
 * the v2 Lifecycle "CMC change control" card renders ({ risk, title, area, programs,
 * status } + fdaCategory / emaCategory / supacTier / citation). The reporting category
 * and risk band are COMPUTED from each change's structured attributes — never a
 * stored/fabricated verdict.
 *
 *   GET  /api/cmc-changes  → list the org's changes (projected). Honest empty list.
 *   POST /api/cmc-changes  → propose a change (the real write path). Audited.
 *
 * Org scoped; 403 without org context. GET fails CLOSED to an honest empty list
 * (never 500, never fabricated) on a missing store (42P01), so an unprovisioned store
 * degrades gracefully.
 *
 * @module server/routes/cmc-changes.routes
 */
import { Router, type Request, type Response } from 'express';
import { projectCmcChanges, type CmcChangeRow } from '../services/cmc/cmc-change-view';
import {
  createCmcChange, listCmcChanges, CmcChangeValidationError,
} from '../services/cmc/cmc-change-control-service';
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

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const rows = await listCmcChanges(orgId);
    const data = projectCmcChanges(rows as unknown as CmcChangeRow[]);
    return res.json({ data, meta: { count: data.length, source: 'cmc_change_controls' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read CMC changes.' } });
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
    const change = await createCmcChange(orgId, {
      title: String(b.title ?? ''),
      dosageFormFamily: String(b.dosageFormFamily ?? ''),
      changeCategory: String(b.changeCategory ?? ''),
      area: b.area != null ? String(b.area) : null,
      programs: b.programs != null ? String(b.programs) : null,
      scaleChangeFactor: b.scaleChangeFactor != null ? String(b.scaleChangeFactor) : null,
      excipientLevelChange: b.excipientLevelChange != null ? String(b.excipientLevelChange) : null,
      siteChangeKind: b.siteChangeKind != null ? String(b.siteChangeKind) : null,
      processChangeKind: b.processChangeKind != null ? String(b.processChangeKind) : null,
      touchesCriticalStep: typeof b.touchesCriticalStep === 'boolean' ? b.touchesCriticalStep : null,
      affects: b.affects != null ? String(b.affects) : null,
      hasComparabilityData: typeof b.hasComparabilityData === 'boolean' ? b.hasComparabilityData : null,
      status: b.status != null ? String(b.status) : null,
      description: b.description != null ? String(b.description) : null,
      createdBy: userId,
    });
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'CMC_CHANGE_PROPOSED',
      resourceType: 'cmc_change_control',
      resourceId: change.id,
      details: { title: change.title, dosageFormFamily: change.dosage_form_family, changeCategory: change.change_category },
    });
    // Return the projected (classified) view so the caller sees the computed verdict.
    const [view] = projectCmcChanges([change as unknown as CmcChangeRow]);
    return res.status(201).json({ data: view, id: change.id });
  } catch (err) {
    if (err instanceof CmcChangeValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create CMC change.' } });
  }
});

export default router;
