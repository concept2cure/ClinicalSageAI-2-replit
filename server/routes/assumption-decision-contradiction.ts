/**
 * Assumption Registry + Decision Records + Contradiction Engine API Routes
 *
 * Unified REST API for the Sprint 2 operating-system layer:
 *
 * Assumptions:
 *   POST /api/governed-intelligence/assumptions/search
 *   POST /api/governed-intelligence/assumptions
 *   GET  /api/governed-intelligence/assumptions/:id
 *   POST /api/governed-intelligence/assumptions/:id/supersede
 *   PATCH /api/governed-intelligence/assumptions/:id/status
 *   GET  /api/governed-intelligence/assumptions/project/:projectId/summary
 *
 * Decisions:
 *   POST /api/governed-intelligence/decisions/search
 *   POST /api/governed-intelligence/decisions
 *   GET  /api/governed-intelligence/decisions/:id
 *   POST /api/governed-intelligence/decisions/:id/transition
 *
 * Contradictions:
 *   POST /api/governed-intelligence/contradictions/search
 *   GET  /api/governed-intelligence/contradictions/:id
 *   POST /api/governed-intelligence/contradictions/scan/:projectId
 *   POST /api/governed-intelligence/contradictions/:id/review
 *   POST /api/governed-intelligence/contradictions/:id/execute-consequence
 *   POST /api/governed-intelligence/contradictions/check-promotion
 *
 * Overlay Rules:
 *   POST /api/governed-intelligence/overlays/search
 *   POST /api/governed-intelligence/overlays
 *
 * Health:
 *   GET  /api/governed-intelligence/health
 *
 * @module server/routes/assumption-decision-contradiction
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { assumptionRegistryService } from '../services/assumption-registry-service';
import { decisionRecordService } from '../services/decision-record-service';
import { contradictionEngineService } from '../services/contradiction-engine-service';
import { reactiveDependencyService } from '../services/reactive-dependency-service';
import { requireUuidParams } from '../middleware/uuidParam';

const router = Router();

/* ── A malformed id is a 400, not a 500 ─────────────────────────────────────
 * `assumption_records.id`, `cmc_contradictions.id` and `governed_dependencies.id`
 * are uuid, checked against the live catalog. Without this, a non-uuid segment
 * reached SQL and 22P02 came back as a 500 carrying the driver's text.
 *
 * The case that found it is worth keeping in view: `GET /contradictions/scan/`
 * is not a bad id at all — `scan` is the literal segment of the sibling route
 * `POST /contradictions/scan/:projectId`, reached with the wrong method and a
 * trailing slash, falling through to `GET /contradictions/:id`. Nothing was
 * broken but the routing, and the product answered "internal server error".
 *
 * `:projectId` is deliberately excluded — regulatory_programs.id is uuid but
 * several project-scoped routes here accept the integer PM-spine id, so a uuid
 * rule on that name would refuse valid requests. */
requireUuidParams(router, ['id']);
const log = createScopedLogger('governed-intelligence-routes');

function getOrgId(req: Request): number {
  const orgId = Number(
    (req as Request & { organizationId?: number | string }).organizationId ??
      req.user?.organizationId ??
      (req as Request & { tenantId?: number | string }).tenantId
  );
  if (!orgId || orgId <= 0) throw new Error('Organization context required');
  return orgId;
}

function getUserId(req: Request): string {
  return String(
    (req as Request & { userId?: string | number }).userId ?? req.user?.id ?? 'system'
  );
}

function handleError(res: Response, error: unknown, context: string) {
  log.error(`Error in ${context}`, {
    error: error instanceof Error ? error.message : String(error),
  });
  res
    .status(500)
    .json({
      error: `Failed to ${context}`,
      details: error instanceof Error ? error.message : 'Unknown error',
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSUMPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/assumptions/search', async (req: Request, res: Response) => {
  try {
    const results = await assumptionRegistryService.search({
      organizationId: getOrgId(req),
      ...req.body,
    });
    res.json({ assumptions: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search assumptions');
  }
});

router.post('/assumptions', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.create({
      organizationId: getOrgId(req),
      createdBy: getUserId(req),
      ...req.body,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'create assumption');
  }
});

router.get('/assumptions/:id', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.getById(String(req.params.id), getOrgId(req));
    if (!result) return res.status(404).json({ error: 'Assumption not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'get assumption');
  }
});

router.post('/assumptions/:id/supersede', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.supersede(String(req.params.id), {
      organizationId: getOrgId(req),
      performedBy: getUserId(req),
      ...req.body,
    });
    if (!result) return res.status(404).json({ error: 'Assumption not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'supersede assumption');
  }
});

router.patch('/assumptions/:id/status', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.updateStatus(
      String(req.params.id),
      getOrgId(req),
      req.body.status,
      getUserId(req)
    );
    if (!result) return res.status(404).json({ error: 'Assumption not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'update assumption status');
  }
});

/**
 * POST /assumptions/:id/revalue — change a governed assumption's value.
 *
 * The Inconsistency surface's "Propagate change" button collected a new value
 * and a mandatory reason for change, then fired the toast "cross-dossier
 * propagation is not yet wired" and did nothing. The propagation IS wired —
 * `supersede` calls `propagateChange`, which marks every downstream object
 * stale — but changing a value takes TWO writes (record the new assumption,
 * then supersede the old one BY it), and doing them from the client would leave
 * an orphan replacement behind whenever the second failed.
 *
 * So it is one endpoint. The replacement carries the original's identity
 * (project, domain track, category, unit, regulators) with the new value, and
 * the reason travels into the supersession record — which is what a reviewer
 * reads to understand why the dossier moved.
 */
router.post('/assumptions/:id/revalue', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const id = String(req.params.id);
    const b = (req.body ?? {}) as Record<string, unknown>;

    const newValue = typeof b.newValue === 'string' ? b.newValue.trim() : '';
    if (!newValue) {
      return res.status(400).json({ error: 'newValue is required.' });
    }
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (reason.length < 8) {
      return res.status(400).json({
        error: 'A reason for change of at least 8 characters is required — it is what a reviewer reads to understand why the dossier moved.',
      });
    }

    const current = await assumptionRegistryService.getById(id, orgId);
    if (!current) return res.status(404).json({ error: 'Assumption not found' });
    if (current.status === 'superseded') {
      return res.status(409).json({
        error: 'This assumption is already superseded; change the value on the record that replaced it.',
      });
    }
    if (String(current.assumedValue) === newValue) {
      return res.status(409).json({ error: 'The new value is the same as the current one; nothing was changed.' });
    }

    // The replacement is the SAME assumption at a new value: it keeps the
    // original's project, track, category, unit and regulator scope, so the
    // supersession chain reads as one fact changing rather than two unrelated
    // records.
    const replacement = await assumptionRegistryService.create({
      organizationId: orgId,
      projectId: current.projectId,
      assumptionCode: current.assumptionCode,
      title: current.title,
      domainTrack: current.domainTrack,
      category: current.category,
      assumedValue: newValue,
      unit: current.unit ?? undefined,
      rationale: reason,
      sourceType: current.sourceType,
      sourceReference: current.sourceReference ?? undefined,
      confidenceLevel: current.confidenceLevel ?? undefined,
      applicableRegulators: current.applicableRegulators ?? undefined,
      linkedArtifactId: current.linkedArtifactId ?? undefined,
      linkedArtifactVersion: current.linkedArtifactVersion ?? undefined,
      linkedSectionCode: current.linkedSectionCode ?? undefined,
      createdBy: userId,
    });

    // Superseding is what triggers propagateChange — the downstream objects
    // this assumption feeds are marked stale by the service, not by the client.
    const superseded = await assumptionRegistryService.supersede(id, {
      organizationId: orgId,
      replacementId: replacement.id,
      reason,
      performedBy: userId,
    });
    if (!superseded) {
      return res.status(500).json({
        error: 'The new value was recorded but the previous assumption was not superseded. Both are now live — resolve this before filing.',
        replacementId: replacement.id,
      });
    }

    return res.status(201).json({
      previous: { id, assumedValue: current.assumedValue, status: superseded.status },
      replacement,
      reason,
    });
  } catch (error) {
    handleError(res, error, 'change assumption value');
  }
});

router.get('/assumptions/project/:projectId/summary', async (req: Request, res: Response) => {
  try {
    const summary = await assumptionRegistryService.getByProject(
      getOrgId(req),
      Number(String(req.params.projectId ?? ""))
    );
    res.json(summary);
  } catch (error) {
    handleError(res, error, 'get project assumption summary');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/decisions/search', async (req: Request, res: Response) => {
  try {
    const results = await decisionRecordService.search({
      organizationId: getOrgId(req),
      ...req.body,
    });
    res.json({ decisions: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search decisions');
  }
});

router.post('/decisions', async (req: Request, res: Response) => {
  try {
    const result = await decisionRecordService.create({
      organizationId: getOrgId(req),
      decidedBy: getUserId(req),
      ...req.body,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'create decision');
  }
});

router.get('/decisions/:id', async (req: Request, res: Response) => {
  try {
    const result = await decisionRecordService.getById(String(req.params.id), getOrgId(req));
    if (!result) return res.status(404).json({ error: 'Decision not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'get decision');
  }
});

router.post('/decisions/:id/transition', async (req: Request, res: Response) => {
  try {
    const result = await decisionRecordService.transition(String(req.params.id), {
      organizationId: getOrgId(req),
      performedBy: getUserId(req),
      ...req.body,
    });
    if (!result) return res.status(404).json({ error: 'Decision not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'transition decision');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRADICTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/contradictions/search', async (req: Request, res: Response) => {
  try {
    const results = await contradictionEngineService.searchFindings({
      organizationId: getOrgId(req),
      ...req.body,
    });
    res.json({ findings: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search contradictions');
  }
});

router.get('/contradictions/:id', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.getFinding(String(req.params.id), getOrgId(req));
    if (!result) return res.status(404).json({ error: 'Finding not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'get contradiction');
  }
});

router.post('/contradictions/scan/:projectId', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.scanProject(
      getOrgId(req),
      Number(String(req.params.projectId ?? ""))
    );
    res.json(result);
  } catch (error) {
    handleError(res, error, 'scan project for contradictions');
  }
});

router.post('/contradictions/:id/review', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.transitionReviewState(
      String(req.params.id),
      getOrgId(req),
      req.body.reviewState,
      getUserId(req),
      req.body.notes
    );
    if (!result) return res.status(404).json({ error: 'Finding not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'review contradiction');
  }
});

router.post('/contradictions/:id/execute-consequence', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.executeConsequence(
      String(req.params.id),
      getOrgId(req),
      getUserId(req)
    );
    res.json(result);
  } catch (error) {
    handleError(res, error, 'execute consequence');
  }
});

router.post('/contradictions/check-promotion', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.checkPromotionBlocked(
      getOrgId(req),
      req.body.projectId,
      req.body.artifactId
    );
    res.json(result);
  } catch (error) {
    handleError(res, error, 'check promotion');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REACTIVE DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/dependencies', async (req: Request, res: Response) => {
  try {
    const result = await reactiveDependencyService.registerDependency({
      organizationId: getOrgId(req),
      ...req.body,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'register dependency');
  }
});

router.get(
  '/dependencies/downstream/:sourceType/:sourceId',
  async (req: Request, res: Response) => {
    try {
      const results = await reactiveDependencyService.getDownstream(
        getOrgId(req),
        String(req.params.sourceType),
        String(req.params.sourceId)
      );
      res.json({ dependencies: results, count: results.length });
    } catch (error) {
      handleError(res, error, 'get downstream dependencies');
    }
  }
);

router.get('/dependencies/stale/:projectId', async (req: Request, res: Response) => {
  try {
    const results = await reactiveDependencyService.getStale(
      getOrgId(req),
      Number(String(req.params.projectId ?? ""))
    );
    res.json({ stale: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'get stale dependencies');
  }
});

router.post('/dependencies/:id/resolve', async (req: Request, res: Response) => {
  try {
    const result = await reactiveDependencyService.resolveStale(
      String(req.params.id),
      getOrgId(req),
      getUserId(req)
    );
    if (!result) return res.status(404).json({ error: 'Dependency not found' });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'resolve stale dependency');
  }
});

router.get('/impact-summary/:projectId', async (req: Request, res: Response) => {
  try {
    const result = await reactiveDependencyService.getProjectImpactSummary(
      getOrgId(req),
      Number(String(req.params.projectId ?? ""))
    );
    res.json(result);
  } catch (error) {
    handleError(res, error, 'get impact summary');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAY RULES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/overlays/search', async (req: Request, res: Response) => {
  try {
    const results = await contradictionEngineService.getOverlayRules(
      getOrgId(req),
      req.body.contradictionType,
      req.body.regulatorBody
    );
    res.json({ rules: results, count: results.length });
  } catch (error) {
    handleError(res, error, 'search overlay rules');
  }
});

router.post('/overlays', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.createOverlayRule({
      organizationId: getOrgId(req),
      ...req.body,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'create overlay rule');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'governed-intelligence',
    status: 'healthy',
    modules: [
      'assumption-registry',
      'decision-records',
      'contradiction-engine',
      'overlay-rules',
      'consequence-paths',
    ],
    timestamp: new Date().toISOString(),
  });
});

export default router;
