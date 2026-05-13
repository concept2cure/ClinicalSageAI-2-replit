/**
 * Orchestration API Routes — Phase 3
 *
 * POST /api/orchestration/execute          — Execute a workflow
 * GET  /api/orchestration/templates        — List available workflow templates
 * GET  /api/orchestration/executions/:id   — Get workflow execution state
 * GET  /api/orchestration/project/:id      — Get all workflows for a project
 * POST /api/orchestration/cancel/:id       — Cancel a running workflow
 *
 * GET  /api/orchestration/projects/:projectId/readiness — Get readiness for a project (dashboard)
 * POST /api/orchestration/readiness        — Compute readiness assessment (with body)
 * POST /api/orchestration/recommendations  — Generate recommendations
 * POST /api/orchestration/continuity       — Get project continuity briefing
 * GET  /api/orchestration/continuity/:projectId — Get latest continuity snapshot
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('orchestration');

import {
  executeWorkflow,
  cancelWorkflow,
  getWorkflowExecution,
  getProjectWorkflows,
  getRegisteredTemplates,
  assembleCrossObjectPayload,
  computeReadinessAssessment,
  generateRecommendations,
  generateContinuitySnapshot,
  getLatestSnapshot,
} from '../services/orchestration';
import type {
  OrchestrationStartRequest,
  ReadinessRequest,
  RecommendationRequest,
  ContinuityRequest,
} from '../../shared/types/orchestration';

const router = Router();

// ---------------------------------------------------------------------------
// Auth extraction (same pattern as ai-actions routes)
// ---------------------------------------------------------------------------

function getOrganizationId(req: Request): number {
  if ((req as any).tenantContext?.organizationId) {
    const orgId = typeof (req as any).tenantContext.organizationId === 'number'
      ? (req as any).tenantContext.organizationId
      : parseInt((req as any).tenantContext.organizationId as string, 10);
    if (!isNaN(orgId)) return orgId;
  }
  if ((req as any).organizationId) {
    return typeof (req as any).organizationId === 'number'
      ? (req as any).organizationId
      : parseInt((req as any).organizationId as string, 10);
  }
  if (req.user?.organizationId) return req.user.organizationId;
  throw new Error('Organization context required');
}

function getUserId(req: Request): number {
  if (req.userId) return req.userId;
  if (req.user?.id) return req.user.id;
  throw new Error('Authentication required');
}

function getUserName(req: Request): string {
  return req.user?.name || req.user?.email || `user-${getUserId(req)}`;
}

function getUserRole(req: Request): string {
  return req.user?.role || 'user';
}

// ---------------------------------------------------------------------------
// POST /api/orchestration/execute
// ---------------------------------------------------------------------------

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const body = req.body as OrchestrationStartRequest;

    if (!body.templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }
    if (!body.projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const execution = await executeWorkflow({
      templateId: body.templateId,
      projectId: body.projectId,
      organizationId: orgId,
      module: body.module,
      targetType: body.targetType,
      targetId: body.targetId,
      context: body.context,
      requestedBy: {
        userId,
        userName: getUserName(req),
        userRole: getUserRole(req),
        organizationId: orgId,
      },
      sourceSurface: 'api',
    });

    res.json(execution);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Workflow execution failed';
    logger.error('Execute error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orchestration/templates
// ---------------------------------------------------------------------------

router.get('/templates', (_req: Request, res: Response) => {
  const templates = getRegisteredTemplates();
  res.json({
    templates: templates.map((t) => ({
      templateId: t.templateId,
      name: t.name,
      description: t.description,
      stepCount: t.steps.length,
      estimatedDurationMinutes: t.estimatedDurationMinutes,
      applicableModules: t.applicableModules,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /api/orchestration/executions/:id
// ---------------------------------------------------------------------------

router.get('/executions/:id', (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const execution = getWorkflowExecution(req.params.id);
    if (!execution || execution.organizationId !== orgId) {
      return res.status(404).json({ error: 'Workflow execution not found' });
    }
    res.json(execution);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch execution';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orchestration/project/:id
// ---------------------------------------------------------------------------

router.get('/project/:id', (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.id, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const workflows = getProjectWorkflows(orgId, projectId);
    res.json({ workflows });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch workflows';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/orchestration/cancel/:id
// ---------------------------------------------------------------------------

router.post('/cancel/:id', (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const success = cancelWorkflow(req.params.id, userId);
    if (!success) {
      return res.status(404).json({ error: 'Workflow not found or not cancellable' });
    }
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel failed';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orchestration/projects/:projectId/readiness
// ---------------------------------------------------------------------------

router.get('/projects/:projectId/readiness', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }

    const module = req.query.module as string | undefined;

    const payload = await assembleCrossObjectPayload({
      organizationId: orgId,
      projectId,
      module,
    });

    const assessment = computeReadinessAssessment(payload);
    res.json(assessment);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Readiness assessment failed';
    logger.error('GET readiness error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/orchestration/readiness
// ---------------------------------------------------------------------------

router.post('/readiness', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const body = req.body as ReadinessRequest;

    const projectId = typeof body.projectId === 'number' ? body.projectId : parseInt(String(body.projectId), 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }

    const payload = await assembleCrossObjectPayload({
      organizationId: orgId,
      projectId,
      module: body.module,
    });

    const assessment = computeReadinessAssessment(payload);
    res.json(assessment);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Readiness assessment failed';
    logger.error('Readiness error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/orchestration/recommendations
// ---------------------------------------------------------------------------

router.post('/recommendations', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const body = req.body as RecommendationRequest;

    const projectId = typeof body.projectId === 'number' ? body.projectId : parseInt(String(body.projectId), 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }

    const payload = await assembleCrossObjectPayload({
      organizationId: orgId,
      projectId,
      module: body.module,
    });

    const recSet = generateRecommendations(payload, body);
    res.json(recSet);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recommendation generation failed';
    logger.error('Recommendations error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/orchestration/continuity
// ---------------------------------------------------------------------------

router.post('/continuity', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const body = req.body as ContinuityRequest;

    const projectId = typeof body.projectId === 'number' ? body.projectId : parseInt(String(body.projectId), 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }

    const snapshot = await generateContinuitySnapshot(orgId, projectId);
    res.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Continuity snapshot failed';
    logger.error('Continuity error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orchestration/continuity/:projectId
// ---------------------------------------------------------------------------

router.get('/continuity/:projectId', (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    const snapshot = getLatestSnapshot(orgId, projectId);
    if (!snapshot) {
      return res.status(404).json({ error: 'No continuity snapshot available. POST to /api/orchestration/continuity to generate one.' });
    }
    res.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch continuity data';
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orchestration/readiness/freshness/:projectId
//
// Returns the timestamp of the most recent underlying-data change for the
// project (artifacts, CMC source objects, CMC contradictions). Consumers
// poll this to decide whether to recompute readiness; the score itself is
// stateless and recomputes on every POST /readiness call.
// ---------------------------------------------------------------------------

router.get('/readiness/freshness/:projectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(String(req.params.projectId), 10);
    if (isNaN(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }

    const payload = await assembleCrossObjectPayload({
      organizationId: orgId,
      projectId,
    });

    res.json({
      projectId,
      organizationId: orgId,
      lastSignalAt: payload.lastSignalAt,
      assembledAt: payload.assembledAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Freshness query failed';
    logger.error('Readiness freshness error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/orchestration/pre-submission-gate
//
// Unified pre-submission quality gate. Combines:
//   - readiness assessment (with CMC signals)
//   - CMC contradiction list
//   - CRL risk assessment against the seeded trigger pattern library
//   - RTF prevention report against the seeded trigger pattern library
//
// Returns a single go/no-go report with the strictest verdict across all
// engines, so a reviewer can run one check before transmitting.
// ---------------------------------------------------------------------------

interface PreSubmissionGateRequest {
  projectId: number | string;
  submissionType?: string;     // IND | NDA | BLA | sNDA | sBLA | ANDA
  therapeuticArea?: string;
  indication?: string;
  center?: string;             // CDER | CBER
  module?: string;
}

router.post('/pre-submission-gate', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const body = req.body as PreSubmissionGateRequest;

    const projectId = typeof body.projectId === 'number'
      ? body.projectId
      : parseInt(String(body.projectId), 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }

    const orgIdStr = String(orgId);
    const submissionType = body.submissionType ?? 'NDA';

    const { crlTriggerService, rtfTriggerService } = await import(
      '../services/regulatory-precedent-intelligence'
    );

    const [payload, crlAssessment, rtfReport] = await Promise.all([
      assembleCrossObjectPayload({
        organizationId: orgId,
        projectId,
        module: body.module,
      }),
      crlTriggerService.assessCRLRisk({
        organizationId: orgIdStr,
        submissionType,
        therapeuticArea: body.therapeuticArea,
        indication: body.indication,
      }),
      rtfTriggerService.generatePreventionReport({
        organizationId: orgIdStr,
        submissionType,
        center: body.center,
      }),
    ]);

    const readiness = computeReadinessAssessment(payload);

    const verdict = deriveVerdict({
      readinessStatus: readiness.status,
      readinessScore: readiness.overallScore,
      readinessBlockers: readiness.blockers,
      crlRisk: crlAssessment.overallRisk,
      rtfRisk: rtfReport.overallRisk,
      cmcOpenCritical: payload.cmcSignals.contradictionCounts.critical,
    });

    res.json({
      projectId,
      organizationId: orgId,
      submissionType,
      verdict: verdict.verdict,
      verdictRationale: verdict.rationale,
      readiness: {
        overallScore: readiness.overallScore,
        status: readiness.status,
        scores: readiness.scores,
        blockers: readiness.blockers,
        moduleBreakdown: readiness.moduleBreakdown,
      },
      cmc: {
        sourceObjectCount: payload.cmcSignals.sourceObjectCount,
        sourceTypeBreakdown: payload.cmcSignals.sourceTypeBreakdown,
        sectionCount: payload.cmcSignals.sectionCount,
        staleSectionCount: payload.cmcSignals.staleSectionCount,
        contradictionCounts: payload.cmcSignals.contradictionCounts,
        topContradictions: payload.cmcSignals.contradictions.slice(0, 10),
      },
      crl: {
        overallRisk: crlAssessment.overallRisk,
        riskScore: crlAssessment.riskScore,
        matchedPatternCount: crlAssessment.matchedPatterns.length,
        topPatterns: crlAssessment.matchedPatterns.slice(0, 5).map(p => ({
          patternCode: p.patternCode,
          patternName: p.patternName,
          category: p.category,
          frequencyRate: p.frequencyRate,
          resolutionDifficulty: p.resolutionDifficulty,
        })),
        trajectoryPrediction: crlAssessment.trajectoryPrediction,
        mitigationStrategies: crlAssessment.mitigationStrategies.slice(0, 8),
      },
      rtf: {
        overallRisk: rtfReport.overallRisk,
        riskScore: rtfReport.riskScore,
        matchedPatternCount: rtfReport.matchedPatterns.length,
        preventionChecklist: rtfReport.preventionChecklist.slice(0, 15),
        estimatedRecoveryDays: rtfReport.estimatedRecoveryDays,
      },
      lastSignalAt: payload.lastSignalAt,
      assessedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pre-submission gate failed';
    logger.error('Pre-submission gate error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

type GateVerdict = 'ready' | 'conditional' | 'hold';

function deriveVerdict(input: {
  readinessStatus: string;
  readinessScore: number;
  readinessBlockers: Array<{ severity: string }>;
  crlRisk: string;
  rtfRisk: string;
  cmcOpenCritical: number;
}): { verdict: GateVerdict; rationale: string[] } {
  const rationale: string[] = [];
  let verdict: GateVerdict = 'ready';

  const hasCriticalReadiness = input.readinessBlockers.some(b => b.severity === 'critical');
  if (hasCriticalReadiness) {
    verdict = 'hold';
    rationale.push('Readiness has critical blockers');
  }

  if (input.cmcOpenCritical > 0) {
    verdict = 'hold';
    rationale.push(`${input.cmcOpenCritical} open critical CMC contradiction(s)`);
  }

  if (input.crlRisk === 'critical' || input.rtfRisk === 'critical') {
    verdict = 'hold';
    if (input.crlRisk === 'critical') rationale.push('CRL risk is critical');
    if (input.rtfRisk === 'critical') rationale.push('RTF risk is critical');
  }

  if (verdict !== 'hold') {
    const moderateRisk = input.crlRisk === 'high' || input.rtfRisk === 'high'
      || input.readinessScore < 70 || input.readinessStatus === 'needs_attention';
    if (moderateRisk) {
      verdict = 'conditional';
      if (input.crlRisk === 'high') rationale.push('CRL risk is high');
      if (input.rtfRisk === 'high') rationale.push('RTF risk is high');
      if (input.readinessScore < 70) rationale.push(`Readiness score is ${input.readinessScore} (<70)`);
    }
  }

  if (verdict === 'ready') {
    rationale.push('Readiness on track, no critical blockers, CRL/RTF risk acceptable');
  }

  return { verdict, rationale };
}

export default router;
