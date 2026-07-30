/**
 * Program-journey spine — concept-to-submission read + write.
 *
 * GET /api/program-journey → the org's program-journey instances (segment scoped:
 * pharma BX-204 · NDA, biotech BX-301 · BLA), held in the REAL, org-scoped store
 * `program_journeys` + `program_journey_stages` (program-journey-service.ts — a live
 * write path, not the seed-only c2c_program_journey blob), each shaped to exactly the
 * keys the v2 BiopharmaJourney surface renders ({ seg, code, name, app, modality,
 * indication, pathway, sponsor, agency, readiness, current, target, overlay, modules,
 * clock, haqs, contra, blockers }). The per-stage overlay is assembled from REAL
 * per-stage rows.
 *
 *   GET  /api/program-journey                       → list (honest empty when none)
 *   POST /api/program-journey                       → record a journey (audited)
 *   POST /api/program-journey/:id/stages/:stageId   → advance/set one lifecycle stage
 *
 * Org scoped; 403 without org context; GET fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import {
  createProgramJourney, listProgramJourneys, updateJourneyStage,
  ProgramJourneyValidationError,
} from '../services/program-journey/program-journey-service';
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
    const data = await listProgramJourneys(orgId);
    return res.json({ data, meta: { count: data.length, source: 'program_journeys' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read program journey.' } });
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
    const journey = await createProgramJourney(orgId, {
      seg: String(b.seg ?? ''),
      code: String(b.code ?? ''),
      seq: b.seq != null ? Number(b.seq) : null,
      name: b.name != null ? String(b.name) : null,
      app: b.app != null ? String(b.app) : null,
      modality: b.modality != null ? String(b.modality) : null,
      indication: b.indication != null ? String(b.indication) : null,
      pathway: b.pathway != null ? String(b.pathway) : null,
      sponsor: b.sponsor != null ? String(b.sponsor) : null,
      agency: b.agency != null ? String(b.agency) : null,
      readiness: b.readiness != null ? Number(b.readiness) : null,
      currentStage: String(b.currentStage ?? b.current ?? ''),
      target: (b.target as { label?: unknown; v?: unknown; agency?: unknown } | null) ?? null,
      overlay: (b.overlay as Record<string, unknown> | null) ?? null,
      modules: b.modules,
      clock: b.clock,
      haqs: b.haqs,
      contra: b.contra,
      blockers: b.blockers,
      createdBy: userId,
    });
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'PROGRAM_JOURNEY_RECORDED',
      resourceType: 'program_journey',
      resourceId: journey.id,
      details: { seg: journey.seg, code: journey.code, currentStage: journey.current },
    });
    return res.status(201).json({ data: journey, id: journey.id });
  } catch (err) {
    if (err instanceof ProgramJourneyValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record program journey.' } });
  }
});

router.post('/:id/stages/:stageId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const stage = await updateJourneyStage(
      orgId, String(req.params.id), String(req.params.stageId), String(b.status ?? ''), b.pct,
    );
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'PROGRAM_JOURNEY_STAGE_ADVANCED',
      resourceType: 'program_journey',
      resourceId: stage.journey_id,
      details: { stageId: stage.stage_id, status: stage.status, pct: stage.pct },
    });
    return res.json({ data: stage });
  } catch (err) {
    if (err instanceof ProgramJourneyValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to update journey stage.' } });
  }
});

export default router;
