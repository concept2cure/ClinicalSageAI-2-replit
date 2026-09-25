import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { isPlatformAdmin, requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
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
  GOVERNED_DECISION_REPOSITORY_VERSION as GOVERNED_DECISION_SERVICE_VERSION,
} from '../../services/governed-decision-repository';
import {
  computeGovernedEvaluation,
  GOVERNED_DOCUMENT_EVALUATOR_VERSION,
} from '../control-plane/governed-document-evaluator';
import { getSecureOrgId } from '../../utils/tenantContext';
import { READINESS_GATES_VERSION } from '../control-plane/readiness-gates';
import { PLACEMENT_AUTHORITY_VERSION } from '../control-plane/placement-authority';
import { EXPORT_PUBLISH_GATES_VERSION } from '../control-plane/export-publish-gates';
import { DOCUMENT_CONSEQUENCE_ENGINE_VERSION } from '../control-plane/document-consequence-engine';
import { DOCUMENT_CONTEXT_RESOLVER_VERSION } from '../control-plane/document-context-resolver';

const router = Router();

/*
 * Who may reach the control plane (ledger L183). It serves two audiences, and
 * each route names its own.
 *
 * PLATFORM-WIDE routes are for platform operators. These are the kernel's
 * decision log and its summaries, which are process-wide: every tenant's
 * request paths, tenant ids and actor ids. Also the log's clear, the kernel's
 * policy, rules, self-test, hash chain and simulator, and the fabric's health
 * and versions. The guard is requirePlatformAdmin, the Master Administration
 * guard: a platform role or a platform grant, with no org-admin bypass. Or
 * monitoring that presents ANA_OPS_TOKEN.
 *
 * TENANT-SCOPED routes are for the caller's own organization's administrators
 * (`admin` exactly, the organization_users vocabulary) or platform operators.
 * These are the org's governed decisions, which requireCallerOrg scopes, and the
 * evaluator simulation, which reads and writes nothing.
 *
 * This replaced one guard for both. It admitted any role whose name CONTAINED
 * "admin", so a tenant's `admin` or `research_admin` read every tenant's kernel
 * log and could clear it. It also admitted everyone outside production unless
 * ANA_ALLOW_NONPROD_CONTROL_PLANE=false had been set. That bypass is now opt-in
 * (`=true`), and it never applies in production.
 */
function presentsOpsToken(req: any): boolean {
  const expected = process.env.ANA_OPS_TOKEN;
  const presented = req.headers?.['x-ana-ops-token'];
  if (!expected || typeof presented !== 'string') return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function nonProdBypassRequested(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ANA_ALLOW_NONPROD_CONTROL_PLANE === 'true';
}

function requirePlatformOperator(req: any, res: any, next: any) {
  if (presentsOpsToken(req) || nonProdBypassRequested()) return next();
  return requirePlatformAdmin(req, res, next);
}

function requireOrgAdminOrOperator(req: any, res: any, next: any) {
  if (presentsOpsToken(req) || nonProdBypassRequested()) return next();
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (role === 'admin' || isPlatformAdmin(req)) return next();
  return res.status(403).json({
    error: {
      code: 'FORBIDDEN',
      message: "This control plane endpoint is for your organization's administrators.",
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

router.get('/kernel/policy', requirePlatformOperator, (_req, res) => {
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

router.get('/kernel/summary', requirePlatformOperator, (_req, res) => {
  res.json({ summary: getKernelDecisionSummary() });
});

router.get('/kernel/rules', requirePlatformOperator, (_req, res) => {
  res.json({ rules: ANA_RULE_CATALOG });
});

router.get('/kernel/self-test', requirePlatformOperator, (_req, res) => {
  const result = runAnaSelfTest();
  const status = result.overallPassed ? 200 : 503;
  res.status(status).json({ selfTest: result });
});

router.get('/kernel/hash-chain/verify', requirePlatformOperator, async (_req, res) => {
  const verification = await verifyPersistentKernelHashChain();
  // A detected tamper (broken chain) must never be a 200 OK — monitoring that
  // watches HTTP status would otherwise miss an integrity violation. The honest
  // non-failure states (verified / empty / disabled / unavailable) stay 200; the
  // discriminated `status` in the body carries the full truth for each.
  const httpStatus = verification.status === 'broken' ? 409 : 200;
  res.status(httpStatus).json({ verification });
});

router.get('/kernel/summary/persistent', requirePlatformOperator, async (req, res) => {
  const rawHours = Number(req.query.hours || 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(rawHours, 24 * 90)) : 24;
  const summary = await getPersistentKernelDecisionSummary(hours);
  res.json({
    persistenceEnabled: process.env.ANA_KERNEL_PERSIST === 'true',
    windowHours: hours,
    summary,
  });
});

router.get('/kernel/audit-report', requirePlatformOperator, async (req, res) => {
  const rawHours = Number(req.query.hours || 24);
  const hours = Number.isFinite(rawHours) ? Math.max(1, Math.min(rawHours, 24 * 90)) : 24;
  const report = await buildAnaAuditReport(hours);
  res.json({ report });
});

router.get('/kernel/recent', requirePlatformOperator, (req, res) => {
  const raw = Number(req.query.limit || 50);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(raw, 500)) : 50;
  res.json({ entries: getRecentKernelDecisions(limit) });
});

router.post('/kernel/simulate', requirePlatformOperator, (req, res) => {
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

router.post('/kernel/recent/clear', requirePlatformOperator, (_req, res) => {
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
router.get('/governed/health', requirePlatformOperator, async (_req, res) => {
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
router.get('/governed/fabric-version', requirePlatformOperator, (_req, res) => {
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
 * Governed decisions are tenant data, so every read below resolves the CALLER's
 * org from the authenticated request and refuses without one. The org is never
 * taken from the query, the body or the path.
 *
 * Three of these four used to pass no org at all. The repository's search()
 * binds `organization_id = $1` unconditionally, so an absent org became
 * `= NULL` and they answered "0 decisions" however many existed — an error
 * rendered as an empty result (ledger L182). The fourth read
 * `req.user.organizationId` inline and fell back to org 0. getSecureOrgId reads
 * that same JWT field FIRST, so this changes no one's precedence; it only
 * scopes the three that had none, and turns "no org" into a refusal.
 */
function requireCallerOrg(req: any, res: any, next: any) {
  const raw = getSecureOrgId(req);
  const organizationId = raw == null ? NaN : Number(raw);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return res.status(403).json({
      error: { code: 'ORG_CONTEXT_REQUIRED', message: 'Organization context required.' },
    });
  }
  res.locals.organizationId = organizationId;
  return next();
}

/**
 * GET /governed/decisions — Recent governed document decisions
 */
router.get('/governed/decisions', requireOrgAdminOrOperator, requireCallerOrg, async (req, res) => {
  const parsed = governedDecisionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_QUERY', details: parsed.error.flatten() } });
  }
  const entries = await getRecentGovernedDecisions({
    organizationId: String(res.locals.organizationId),
    projectId: parsed.data.projectId,
    limit: parsed.data.limit,
  });
  return res.json({ entries, count: entries.length });
});

/**
 * GET /governed/decisions/summary — Aggregated decision summary
 */
router.get('/governed/decisions/summary', requireOrgAdminOrOperator, requireCallerOrg, async (req, res) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const summary = await getGovernedDecisionSummary({
    organizationId: String(res.locals.organizationId),
    projectId,
  });
  res.json({ summary });
});

/**
 * GET /governed/decisions/:decisionId — Single decision detail
 */
router.get('/governed/decisions/:decisionId', requireOrgAdminOrOperator, requireCallerOrg, async (req, res) => {
  const decision = await getGovernedDecision(req.params.decisionId, res.locals.organizationId);
  if (!decision) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Decision not found' } });
  }
  return res.json({ decision });
});

/**
 * GET /governed/trace/:projectId/:artifactId — Decision trace for an artifact
 */
router.get('/governed/trace/:projectId/:artifactId', requireOrgAdminOrOperator, requireCallerOrg, async (req, res) => {
  const trace = await getArtifactDecisionTrace(
    req.params.projectId,
    req.params.artifactId,
    res.locals.organizationId,
  );
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

router.post('/governed/evaluate', requireOrgAdminOrOperator, (req, res) => {
  const parsed = evaluateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'INVALID_EVALUATION_INPUT', details: parsed.error.flatten() } });
  }
  // A SIMULATION computes and returns; it records nothing. This used to call
  // evaluateGovernedDocument(), the orchestrator that ALSO persists a
  // governed decision under context.organizationId — and that id, the project
  // and the actor all come from this request's BODY. The write only ever
  // failed because the recorder violated decision_records' CHECK
  // constraints; once recording works, this route would have let any caller
  // the control-plane guard then admitted (any role containing "admin", or
  // anyone at all outside production by default) file a decision into another tenant's
  // decision_records under an actor of their choosing. The evaluator's own
  // contract already says what to use here: "Use computeGovernedEvaluation()
  // directly for testing or dry-runs." It is pure — no reads, no writes — so a
  // body-supplied context can shape the answer but cannot touch any tenant.
  const result = computeGovernedEvaluation(parsed.data as Parameters<typeof computeGovernedEvaluation>[0]);
  return res.json({ result });
});

export default router;
