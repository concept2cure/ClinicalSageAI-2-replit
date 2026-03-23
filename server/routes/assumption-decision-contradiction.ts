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

const router = Router();
const log = createScopedLogger('governed-intelligence-routes');

function getOrgId(req: Request): number {
  return Number((req as Record<string, unknown>).organizationId ?? req.headers['x-organization-id'] ?? 1);
}

function getUserId(req: Request): string {
  return String((req as Record<string, unknown>).userId ?? req.headers['x-user-id'] ?? 'system');
}

function handleError(res: Response, error: unknown, context: string) {
  log.error(`Error in ${context}`, { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({ error: `Failed to ${context}`, details: error instanceof Error ? error.message : 'Unknown error' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSUMPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/assumptions/search', async (req: Request, res: Response) => {
  try {
    const results = await assumptionRegistryService.search({ organizationId: getOrgId(req), ...req.body });
    res.json({ assumptions: results, count: results.length });
  } catch (error) { handleError(res, error, 'search assumptions'); }
});

router.post('/assumptions', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.create({ organizationId: getOrgId(req), createdBy: getUserId(req), ...req.body });
    res.status(201).json(result);
  } catch (error) { handleError(res, error, 'create assumption'); }
});

router.get('/assumptions/:id', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.getById(req.params.id, getOrgId(req));
    if (!result) return res.status(404).json({ error: 'Assumption not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'get assumption'); }
});

router.post('/assumptions/:id/supersede', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.supersede(req.params.id, {
      organizationId: getOrgId(req), performedBy: getUserId(req), ...req.body,
    });
    if (!result) return res.status(404).json({ error: 'Assumption not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'supersede assumption'); }
});

router.patch('/assumptions/:id/status', async (req: Request, res: Response) => {
  try {
    const result = await assumptionRegistryService.updateStatus(
      req.params.id, getOrgId(req), req.body.status, getUserId(req)
    );
    if (!result) return res.status(404).json({ error: 'Assumption not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'update assumption status'); }
});

router.get('/assumptions/project/:projectId/summary', async (req: Request, res: Response) => {
  try {
    const summary = await assumptionRegistryService.getByProject(getOrgId(req), Number(req.params.projectId));
    res.json(summary);
  } catch (error) { handleError(res, error, 'get project assumption summary'); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/decisions/search', async (req: Request, res: Response) => {
  try {
    const results = await decisionRecordService.search({ organizationId: getOrgId(req), ...req.body });
    res.json({ decisions: results, count: results.length });
  } catch (error) { handleError(res, error, 'search decisions'); }
});

router.post('/decisions', async (req: Request, res: Response) => {
  try {
    const result = await decisionRecordService.create({ organizationId: getOrgId(req), decidedBy: getUserId(req), ...req.body });
    res.status(201).json(result);
  } catch (error) { handleError(res, error, 'create decision'); }
});

router.get('/decisions/:id', async (req: Request, res: Response) => {
  try {
    const result = await decisionRecordService.getById(req.params.id, getOrgId(req));
    if (!result) return res.status(404).json({ error: 'Decision not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'get decision'); }
});

router.post('/decisions/:id/transition', async (req: Request, res: Response) => {
  try {
    const result = await decisionRecordService.transition(req.params.id, {
      organizationId: getOrgId(req), performedBy: getUserId(req), ...req.body,
    });
    if (!result) return res.status(404).json({ error: 'Decision not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'transition decision'); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRADICTIONS
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/contradictions/search', async (req: Request, res: Response) => {
  try {
    const results = await contradictionEngineService.searchFindings({ organizationId: getOrgId(req), ...req.body });
    res.json({ findings: results, count: results.length });
  } catch (error) { handleError(res, error, 'search contradictions'); }
});

router.get('/contradictions/:id', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.getFinding(req.params.id, getOrgId(req));
    if (!result) return res.status(404).json({ error: 'Finding not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'get contradiction'); }
});

router.post('/contradictions/scan/:projectId', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.scanProject(getOrgId(req), Number(req.params.projectId));
    res.json(result);
  } catch (error) { handleError(res, error, 'scan project for contradictions'); }
});

router.post('/contradictions/:id/review', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.transitionReviewState(
      req.params.id, getOrgId(req), req.body.reviewState, getUserId(req), req.body.notes
    );
    if (!result) return res.status(404).json({ error: 'Finding not found' });
    res.json(result);
  } catch (error) { handleError(res, error, 'review contradiction'); }
});

router.post('/contradictions/:id/execute-consequence', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.executeConsequence(
      req.params.id, getOrgId(req), getUserId(req)
    );
    res.json(result);
  } catch (error) { handleError(res, error, 'execute consequence'); }
});

router.post('/contradictions/check-promotion', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.checkPromotionBlocked(
      getOrgId(req), req.body.projectId, req.body.artifactId
    );
    res.json(result);
  } catch (error) { handleError(res, error, 'check promotion'); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAY RULES
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/overlays/search', async (req: Request, res: Response) => {
  try {
    const results = await contradictionEngineService.getOverlayRules(
      getOrgId(req), req.body.contradictionType, req.body.regulatorBody
    );
    res.json({ rules: results, count: results.length });
  } catch (error) { handleError(res, error, 'search overlay rules'); }
});

router.post('/overlays', async (req: Request, res: Response) => {
  try {
    const result = await contradictionEngineService.createOverlayRule({ organizationId: getOrgId(req), ...req.body });
    res.status(201).json(result);
  } catch (error) { handleError(res, error, 'create overlay rule'); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'governed-intelligence',
    status: 'healthy',
    modules: ['assumption-registry', 'decision-records', 'contradiction-engine', 'overlay-rules', 'consequence-paths'],
    timestamp: new Date().toISOString(),
  });
});

export default router;
