/**
 * Labeling / prescribing-information — the org's USPI label worklist (GET + POST).
 *
 * GET /api/labeling-pi → the org's structured product-label sections (USPI / PLLR —
 * 21 CFR 201.57), held in the REAL, org-scoped store `labeling_pi_sections`
 * (labeling-pi-service.ts — a live write path, not the seed-only c2c_labeling_pi
 * blob), each shaped to exactly the keys the v2 LabelingPi surface renders
 * ({ n, label, st, flag, content, negotiation }), in USPI document order (HL, BW,
 * then numeric — derived from the section number, never stored). The rendered label
 * text (`content`) and the sponsor-vs-agency redline (`negotiation`) rehydrate from
 * JSONB.
 *
 *   GET  /api/labeling-pi → list (honest empty when the org has no label sections)
 *   POST /api/labeling-pi → record/author a section (upsert on org + section_no;
 *                           the real write path). Audited.
 *
 * Org scoped; 403 without org context; GET fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import {
  upsertLabelingPiSection, listLabelingPiSections, LabelingPiValidationError,
  type LabelingPiSectionRow,
} from '../services/labeling/labeling-pi-service';
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

/** Shape a stored row to the surface's render contract (section_no → n, status → st). */
function toView(r: LabelingPiSectionRow) {
  return {
    n: r.section_no,
    label: r.label,
    st: r.status,
    flag: r.flag ?? null,
    content: r.content ?? null,
    negotiation: r.negotiation ?? null,
  };
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const rows = await listLabelingPiSections(orgId);
    const data = rows.map(toView);
    return res.json({ data, meta: { count: data.length, source: 'labeling_pi_sections' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read labeling sections.' } });
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
    const row = await upsertLabelingPiSection(orgId, {
      sectionNo: String(b.sectionNo ?? b.n ?? ''),
      label: String(b.label ?? ''),
      status: b.status != null ? String(b.status) : b.st != null ? String(b.st) : null,
      flag: b.flag != null ? String(b.flag) : null,
      program: b.program != null ? String(b.program) : null,
      content: b.content,
      negotiation: b.negotiation,
      createdBy: userId,
    });
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'LABELING_PI_SECTION_RECORDED',
      resourceType: 'labeling_pi_section',
      resourceId: row.id,
      details: { sectionNo: row.section_no, status: row.status, flag: row.flag },
    });
    return res.status(201).json({ data: toView(row), id: row.id });
  } catch (err) {
    if (err instanceof LabelingPiValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record labeling section.' } });
  }
});

export default router;
