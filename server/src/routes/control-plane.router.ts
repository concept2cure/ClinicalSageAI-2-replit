import { Router } from 'express';
import { z } from 'zod';
import {
  getKernelDecisionSummary,
  getRecentKernelDecisions,
  clearKernelDecisionLog,
} from '../control-plane/decision-log';
import { anaMicrokernel } from '../control-plane/kernel';
import { defaultAnaPolicyBundle } from '../control-plane/policy-bundle';
import {
  getPersistentKernelDecisionSummary,
  verifyPersistentKernelHashChain,
} from '../control-plane/persistent-queries';
import { buildAnaAuditReport } from '../control-plane/audit-report';
import { ANA_RULE_CATALOG } from '../control-plane/rule-catalog';
import { runAnaSelfTest } from '../control-plane/self-test';
import {
  getRecentGovernedDecisions,
  getGovernedDecisionSummary,
  getGovernedDecision,
  getArtifactDecisionTrace,
  GOVERNED_DECISION_SERVICE_VERSION,
} from '../control-plane/governed-decision-service';
import {
  evaluateGovernedDocument,
  GOVERNED_DOCUMENT_EVALUATOR_VERSION,
} from '../control-plane/governed-document-evaluator';
import { READINESS_GATES_VERSION } from '../control-plane/readiness-gates';
import { PLACEMENT_AUTHORITY_VERSION } from '../control-plane/placement-authority';
import { EXPORT_PUBLISH_GATES_VERSION } from '../control-plane/export-publish-gates';
import { DOCUMENT_CONSEQUENCE_ENGINE_VERSION } from '../control-plane/document-consequence-engine';
import { DOCUMENT_CONTEXT_RESOLVER_VERSION } from '../control-plane/document-context-resolver';

const router = Router();

function requireControlPlaneAccess(req: any, res: any, next: any) {
  const role = req?.user?.role || req?.user?.roles?.[0];
  const hasAdminRole = typeof role === 'string' && role.toLowerCase().includes('admin');
  const opsToken = process.env.ANA_OPS_TOKEN;
  const hasOpsHeader = Boolean(
    opsToken && req.headers['x-ana-ops-token'] && req.headers['x-ana-ops-token'] === opsToken
  );
  const nonProd = process.env.NODE_ENV !== 'production';
  const allowNonProdBypass = process.env.ANA_ALLOW_NONPROD_CONTROL_PLANE !== 'false';

  if (hasAdminRole || hasOpsHeader || (nonProd && allowNonProdBypass)) {
    return next();
  }

  return res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: 'Control plane endpoint requires admin/operator access.',
    },
  });
}

const simulateSchema = z.object({
  method: z.string().default('POST'),
  path: z.string().default('/api/ana/simulate'),
  actorId: z.string().optional(),
  tenantId: z.string().optional(),
  bodySnippet: z.string().optional(),
});

router.get('/kernel/policy', requireControlPlaneAccess, (_req, res) => {
  res.json({
    policy: {
      id: defaultAnaPolicyBundle.id,
      version: defaultAnaPolicyBundle.version,
      mode: defaultAnaPolicyBundle.mode,
      reviewThreshold: defaultAnaPolicyBundle.reviewThreshold,
      denyThreshold: defaultAnaPolicyBundle.denyThreshold,
      biasTermThreshold: defaultAnaPolicyBundle.biasTermThreshold,
      scientificIntegrityTermCount: defaultAnaPolicyBundle.scientificIntegrityTerms.length,
      identityExemptRoutePatterns: defaultAnaPolicyBundle.identityExemptRoutePatterns.map(p =>
        p.toString()
      ),
      highRiskRegulatoryRoutePatterns: defaultAnaPolicyBundle.highRiskRegulatoryRoutePatterns.map(
        p => p.toString()
      ),
      immutableRoutePatterns: defaultAnaPolicyBundle.immutableRoutePatterns.map(p => p.toString()),
    },
  });
});

router.get('/kernel/summary', requireControlPlaneAccess, (_req, res) => {
  res.json({ summary: getKernelDecisionSummary() });
});

router.get('/kernel/rules', requireControlPlaneAccess, (_req, res) => {
  res.json({ rules: ANA_RULE_CATALOG });
});

router.get('/kernel/self-test', requireControlPlaneAccess, (_req, res) => {
  const result = runAnaSelfTest();
  const status = result.overallPassed ? 200 : 503;
  res.status(status).json({ selfTest: result });
});

router.get('/kernel/hash-chain/verify', requireControlPlaneAccess, async (_req, res) => {
  const verification = await verifyPersistentKernelHashChain();
  res.json({ verification });
});

router.get('/kernel/summary/persistent', requireControlPlaneAccess, async (req, res) => {
  const rawHours = Number(req.query.hours || 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(rawHours, 24 * 90)) : 24;
  const summary = await getPersistentKernelDecisionSummary(hours);
  res.json({
    persistenceEnabled: process.env.ANA_KERNEL_PERSIST === 'true',
    windowHours: hours,
    summary,
  });
});

router.get('/kernel/audit-report', requireControlPlaneAccess, async (req, res) => {
  const rawHours = Number(req.query.hours || 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(rawHours, 24 * 90)) : 24;
  const report = await buildAnaAuditReport(hours);
  res.json({ report });
});

router.get('/kernel/recent', requireControlPlaneAccess, (req, res) => {
  const raw = Number(req.query.limit || 50);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 500)) : 50;
  res.json({ entries: getRecentKernelDecisions(limit) });
});

router.post('/kernel/simulate', requireControlPlaneAccess, (req, res) => {
  const parsed = simulateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'INVALID_SIMULATION_INPUT',
        details: parsed.error.flatten(),
      },
    });
  }

  const decision = anaMicrokernel.evaluate(parsed.data);
  return res.json({ decision });
});

router.post('/kernel/recent/clear', requireControlPlaneAccess, (_req, res) => {
  clearKernelDecisionLog();
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
// Governed Document Decision Fabric — Inspection Endpoints
// ═══════════════════════════════════════════════════════════════════════

const governedDecisionQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(50),
  projectId: z.string().optional(),
  artifactId: z.string().optional(),
  intent: z.string().optional(),
  outcome: z.string().optional(),
  since: z.string().optional(),
});

/**
 * GET /governed/health — Governance system health check
 */
router.get('/governed/health', requireControlPlaneAccess, async (_req, res) => {
  try {
    const { governanceMetrics } = await import('../../../server/services/governance-observability.js');
    const health = await governanceMetrics.getHealth();
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json({ health });
  } catch (err) {
    res.status(503).json({ health: { status: 'unhealthy', error: 'Health check failed' } });
  }
});

/**
 * GET /governed/fabric-version — Version info for all fabric modules
 */
router.get('/governed/fabric-version', requireControlPlaneAccess, (_req, res) => {
  res.json({
    fabric: {
      evaluator: GOVERNED_DOCUMENT_EVALUATOR_VERSION,
      contextResolver: DOCUMENT_CONTEXT_RESOLVER_VERSION,
      readinessGates: READINESS_GATES_VERSION,
      placementAuthority: PLACEMENT_AUTHORITY_VERSION,
      exportPublishGates: EXPORT_PUBLISH_GATES_VERSION,
      consequenceEngine: DOCUMENT_CONSEQUENCE_ENGINE_VERSION,
      decisionService: GOVERNED_DECISION_SERVICE_VERSION,
    },
  });
});

/**
 * GET /governed/decisions — Recent governed document decisions
 */
router.get('/governed/decisions', requireControlPlaneAccess, (req, res) => {
  const parsed = governedDecisionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_QUERY', details: parsed.error.flatten() } });
  }
  const entries = getRecentGovernedDecisions(parsed.data);
  return res.json({ entries, count: entries.length });
});

/**
 * GET /governed/decisions/summary — Aggregated decision summary
 */
router.get('/governed/decisions/summary', requireControlPlaneAccess, (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const since = typeof req.query.since === 'string' ? req.query.since : undefined;
  const summary = getGovernedDecisionSummary({ projectId, since });
  res.json({ summary });
});

/**
 * GET /governed/decisions/:decisionId — Single decision detail
 */
router.get('/governed/decisions/:decisionId', requireControlPlaneAccess, (req, res) => {
  const decision = getGovernedDecision(req.params.decisionId);
  if (!decision) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Decision not found' } });
  }
  return res.json({ decision });
});

/**
 * GET /governed/trace/:projectId/:artifactId — Decision trace for an artifact
 */
router.get('/governed/trace/:projectId/:artifactId', requireControlPlaneAccess, (req, res) => {
  const trace = getArtifactDecisionTrace(req.params.projectId, req.params.artifactId);
  res.json({ trace, count: trace.length });
});

/**
 * POST /governed/evaluate — Simulate a governed document evaluation
 */
const evaluateSchema = z.object({
  context: z.object({
    organizationId: z.string(),
    projectId: z.string(),
    actorId: z.string(),
    intendedAction: z.string(),
    artifactId: z.string().optional(),
    artifactVersionId: z.string().optional(),
    documentType: z.string().optional(),
    regulatorBody: z.string().optional(),
    submissionType: z.string().optional(),
    ctdSection: z.string().optional(),
    moduleCode: z.string().optional(),
    sectionCode: z.string().optional(),
    dossierId: z.string().optional(),
    clientTrack: z.string().optional(),
    workspaceTarget: z.string().optional(),
    originSurface: z.string().optional(),
    currentLifecycleStatus: z.string().optional(),
    currentPlacement: z.string().optional(),
    intendedPlacementTarget: z.string().optional(),
    actorRole: z.string().optional(),
  }),
  documentState: z.object({
    hasContent: z.boolean().default(false),
    hasEvidence: z.boolean().default(false),
    evidenceCount: z.number().optional(),
    hasBeenReviewed: z.boolean().default(false),
    reviewApprovalCount: z.number().optional(),
    requiredReviewCount: z.number().optional(),
    hasApproval: z.boolean().default(false),
    approvalDate: z.string().optional(),
    hasPlacement: z.boolean().default(false),
    placementValid: z.boolean().default(false),
    hasProvenance: z.boolean().default(false),
    unresolvedContradictionCount: z.number().default(0),
    criticalContradictionCount: z.number().default(0),
    isStale: z.boolean().optional(),
    staleReason: z.string().optional(),
    completenessScore: z.number().optional(),
    missingRequiredFields: z.array(z.string()).optional(),
  }),
  exportState: z.object({
    contentHash: z.string().optional(),
    humanReviewApproved: z.boolean(),
    aiGenerated: z.boolean(),
    provenanceComplete: z.boolean(),
  }).optional(),
  publishState: z.object({
    exportCompleted: z.boolean(),
    exportHash: z.string().optional(),
    hasGatewayProfile: z.boolean(),
    gatewayProfileValid: z.boolean(),
    hasSequenceNumber: z.boolean(),
    hasAuthorityProfile: z.boolean(),
    authorityAcceptsFormat: z.boolean(),
    allSectionsApproved: z.boolean(),
    staleSectionCount: z.number(),
  }).optional(),
});

router.post('/governed/evaluate', requireControlPlaneAccess, (req, res) => {
  const parsed = evaluateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_EVALUATION_INPUT', details: parsed.error.flatten() } });
  }
  const result = evaluateGovernedDocument(parsed.data as Parameters<typeof evaluateGovernedDocument>[0]);
  return res.json({ result });
});

export default router;
