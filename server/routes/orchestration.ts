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
import { deriveVerdict } from '../services/orchestration/pre-submission-gate-verdict';
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
  if (req.user?.organizationId) {
    const orgId = typeof req.user.organizationId === 'number'
      ? req.user.organizationId
      : parseInt(String(req.user.organizationId), 10);
    if (!isNaN(orgId)) return orgId;
  }
  throw new Error('Organization context required');
}

function getUserId(req: Request): number {
  const raw = req.userId ?? req.user?.id;
  if (raw !== undefined) {
    const userId = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!isNaN(userId)) return userId;
  }
  throw new Error('Authentication required');
}

/**
 * The actor's name for the audit row — never manufactured from their id.
 * See the note on the same helper in routes/ai-actions.ts (ledger L142).
 * 'unknown' matches the 'system' sentinel this file already uses a few hundred
 * lines below for the genuinely unauthenticated case.
 */
function getUserName(req: Request): string {
  if (req.user?.email) return req.user.email;
  // Refuse rather than invent: `user-${id}` was a person-shaped guess an
  // inspector could not tell from a real address (ledger L142).
  throw new Error('Authentication required');
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
    const execution = getWorkflowExecution(String(req.params.id));
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
    const projectId = parseInt(String(req.params.id), 10);
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
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    /* ── This route had no tenant check ────────────────────────────────────
       `cancelWorkflow` looks a run up in a process-global map BY ID ALONE, so
       any authenticated user who knew an execution id could cancel another
       tenant's workflow run — reachable from the Cancel control on the
       Orchestration surface. Its sibling two routes up, GET /executions/:id,
       has always verified `execution.organizationId !== orgId` before
       answering; the destructive route was the one that did not.

       The ownership check is made FIRST and answers 404, not 403 — matching
       the read: a run in another tenant should not be distinguishable from a
       run that does not exist, or the id space itself becomes an oracle. */
    const execution = getWorkflowExecution(String(req.params.id));
    if (!execution || execution.organizationId !== orgId) {
      return res.status(404).json({ error: 'Workflow execution not found' });
    }
    const success = cancelWorkflow(String(req.params.id), userId);
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
    const projectId = parseInt(String(req.params.projectId), 10);
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
    const projectId = parseInt(String(req.params.projectId), 10);
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
  /**
   * UUID of the CMC project (cmc_projects.id) to include in the gate.
   * When omitted, the ICH compliance check is skipped but the rest of the
   * gate still runs against the integer projectId.
   */
  cmcProjectId?: string;
}

// ---------------------------------------------------------------------------
// GET /api/orchestration/pre-submission-gate/history/:projectId
//
// Returns the audit-logged history of pre-submission gate evaluations for
// the project, newest first. Reads regulatory_audit_logs where
// entityType='pre_submission_gate' so the 21 CFR Part 11 trail is queryable
// from the same endpoint that recorded it. Read-only.
// ---------------------------------------------------------------------------

router.get('/pre-submission-gate/history/:projectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(String(req.params.projectId), 10);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId must be a positive integer' });
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 100);

    const { db } = await import('../db.js');
    const { regulatoryAuditLogs } = await import('../../shared/schema.js');
    const { and, eq, desc } = await import('drizzle-orm');

    const rows = await db
      .select({
        auditId: regulatoryAuditLogs.auditId,
        timestamp: regulatoryAuditLogs.timestamp,
        userId: regulatoryAuditLogs.userId,
        userName: regulatoryAuditLogs.userName,
        userRole: regulatoryAuditLogs.userRole,
        newValue: regulatoryAuditLogs.newValue,
        metadata: regulatoryAuditLogs.metadata,
      })
      .from(regulatoryAuditLogs)
      .where(and(
        eq(regulatoryAuditLogs.organizationId, orgId),
        eq(regulatoryAuditLogs.entityType, 'pre_submission_gate'),
        eq(regulatoryAuditLogs.entityId, String(projectId)),
      ))
      .orderBy(desc(regulatoryAuditLogs.timestamp))
      .limit(limit);

    const history = rows.map(r => {
      const v = (r.newValue ?? {}) as Record<string, unknown>;
      return {
        auditId: r.auditId,
        timestamp: r.timestamp?.toISOString() ?? null,
        evaluatedBy: { userId: r.userId, userName: r.userName, userRole: r.userRole },
        submissionType: v.submissionType ?? null,
        verdict: v.verdict ?? null,
        verdictRationale: v.verdictRationale ?? [],
        readinessScore: v.readinessScore ?? null,
        readinessStatus: v.readinessStatus ?? null,
        cmcOpenCritical: v.cmcOpenCritical ?? 0,
        crlRisk: v.crlRisk ?? null,
        rtfRisk: v.rtfRisk ?? null,
        ichStatus: v.ichStatus ?? null,
      };
    });

    res.json({
      projectId,
      organizationId: orgId,
      historyCount: history.length,
      history,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gate history query failed';
    logger.error('Gate history error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

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
    const cmcProjectId = typeof body.cmcProjectId === 'string' && body.cmcProjectId.length > 0
      ? body.cmcProjectId
      : null;

    const { crlTriggerService, rtfTriggerService } = await import(
      '../services/regulatory-precedent-intelligence'
    );
    const { runIchComplianceCheck } = await import(
      '../services/cmc/ich-compliance-checker'
    );

    const ichPromise = cmcProjectId
      ? runIchComplianceCheck(orgId, cmcProjectId).catch(err => {
          logger.warn('ICH check failed within pre-submission gate', {
            err: err instanceof Error ? err.message : String(err),
          });
          return null;
        })
      : Promise.resolve(null);

    const [payload, crlAssessment, rtfReport, ichReport] = await Promise.all([
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
      ichPromise,
    ]);

    const readiness = computeReadinessAssessment(payload);

    const verdict = deriveVerdict({
      readinessStatus: readiness.status,
      readinessScore: readiness.overallScore,
      readinessBlockers: readiness.blockers,
      crlRisk: crlAssessment.overallRisk,
      rtfRisk: rtfReport.overallRisk,
      cmcOpenCritical: payload.cmcSignals.contradictionCounts.critical,
      ichStatus: ichReport?.overallStatus,
      ichFailCount: ichReport?.counts.fail ?? 0,
    });

    const response = {
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
      ich: ichReport ? {
        cmcProjectId,
        overallStatus: ichReport.overallStatus,
        guidelineStatus: ichReport.guidelineStatus,
        counts: ichReport.counts,
        failingFindings: ichReport.findings.filter(f => f.status === 'fail').slice(0, 10),
        warnings: ichReport.findings.filter(f => f.status === 'warning').slice(0, 10),
      } : null,
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
    };

    // Audit the verdict so "why did the system say ready" is traceable.
    // Fire-and-forget — audit failure must not break the gate response.
    void recordGateAudit(req, response).catch(err => {
      logger.warn('Pre-submission gate audit failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pre-submission gate failed';
    logger.error('Pre-submission gate error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: message });
  }
});

/**
 * Persist the gate verdict to `regulatory_audit_logs` so the regulatory
 * trail can later answer "what did the system say, when, and based on
 * what inputs". GxP-relevant entry; safe to call fire-and-forget.
 */
async function recordGateAudit(req: Request, response: {
  projectId: number;
  organizationId: number;
  submissionType: string;
  verdict: string;
  verdictRationale: string[];
  readiness: { overallScore: number; status: string };
  cmc: { contradictionCounts: Record<string, number> };
  crl: { overallRisk: string; riskScore: number };
  rtf: { overallRisk: string; riskScore: number };
  ich: { overallStatus: string; counts: Record<string, number> } | null;
  assessedAt: string;
}): Promise<void> {
  let userId: number;
  try {
    userId = getUserId(req);
  } catch {
    // System / unauthenticated callers (internal jobs) still get audited
    // but with a sentinel user. The route auth middleware should normally
    // prevent this branch in production.
    userId = 0;
  }
  // An authenticated caller is attributed or refused — never filed as the
  // sentinel, which would record a person's action as the system's.
  const userName = userId ? getUserName(req) : 'system';
  const { db } = await import('../db.js');
  const { regulatoryAuditLogs } = await import('../../shared/schema.js');
  const auditId = `gate-${response.projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ipAddress = (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString();
  const userAgent = (req.headers['user-agent'] || 'unknown').toString();

  await db.insert(regulatoryAuditLogs).values({
    auditId,
    organizationId: response.organizationId,
    entityType: 'pre_submission_gate',
    entityId: String(response.projectId),
    action: 'gate_evaluated',
    actionCategory: 'system',
    newValue: {
      submissionType: response.submissionType,
      verdict: response.verdict,
      verdictRationale: response.verdictRationale,
      readinessScore: response.readiness.overallScore,
      readinessStatus: response.readiness.status,
      cmcOpenCritical: response.cmc.contradictionCounts?.critical ?? 0,
      crlRisk: response.crl.overallRisk,
      crlScore: response.crl.riskScore,
      rtfRisk: response.rtf.overallRisk,
      rtfScore: response.rtf.riskScore,
      ichStatus: response.ich?.overallStatus ?? null,
      ichCounts: response.ich?.counts ?? null,
    },
    userId,
    userName,
    userRole: getUserRole(req),
    ipAddress,
    userAgent,
    isGxpRelevant: true,
    metadata: {
      assessedAt: response.assessedAt,
      source: 'pre_submission_gate',
    },
  });
}

export default router;
