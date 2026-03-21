/**
 * Orchestration API Routes — Phase 3
 *
 * POST /api/orchestration/execute          — Execute a workflow
 * GET  /api/orchestration/templates        — List available workflow templates
 * GET  /api/orchestration/executions/:id   — Get workflow execution state
 * GET  /api/orchestration/project/:id      — Get all workflows for a project
 * POST /api/orchestration/cancel/:id       — Cancel a running workflow
 *
 * POST /api/orchestration/readiness        — Compute readiness assessment
 * POST /api/orchestration/recommendations  — Generate recommendations
 * POST /api/orchestration/continuity       — Get project continuity briefing
 * GET  /api/orchestration/continuity/:projectId — Get latest continuity snapshot
 */

import { Router, Request, Response } from 'express';
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
    console.error('[Orchestration] Execute error:', err);
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
    console.error('[Orchestration] Readiness error:', err);
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
    console.error('[Orchestration] Recommendations error:', err);
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
    console.error('[Orchestration] Continuity error:', err);
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

export default router;
