/**
 * Innovation Platform API Routes
 * 
 * Comprehensive API endpoints for all 8 innovation features:
 * 1. Regulatory Delta Radar
 * 2. Evidence Confidence Heatmap
 * 3. Submission Readiness Twin
 * 4. Auto-traceability from Drafts
 * 5. Adaptive Reviewer Workspace
 * 6. Outcome-based Template Learning
 * 7. Regulatory Negotiation Logbook
 * 8. Compliance Guardrails SDK
 * 
 * Part 11 Compliance: All endpoints include audit logging
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

// Import all services
import RegulatoryDeltaRadarService from '../services/innovation/regulatory-delta-radar-service';
import EvidenceConfidenceHeatmapService from '../services/innovation/evidence-confidence-heatmap-service';
import SubmissionReadinessTwinService from '../services/innovation/submission-readiness-twin-service';
import AutoTraceabilityService, { type TraceLinkType } from '../services/innovation/auto-traceability-service';
import AdaptiveReviewerWorkspaceService from '../services/innovation/adaptive-reviewer-workspace-service';
import OutcomeBasedTemplateLearningService from '../services/innovation/outcome-based-template-learning-service';
import RegulatoryNegotiationLogbookService from '../services/innovation/regulatory-negotiation-logbook-service';
import ComplianceGuardrailsSDKService from '../services/innovation/compliance-guardrails-sdk-service';

import { createScopedLogger } from '../utils/logger.js';
import { requireAuthedOrgId } from '../utils/authedOrgId';
import { pool as sharedPool } from '../db';

const logger = createScopedLogger('innovation-routes');

const router: Router = express.Router();

// Service instances (will be initialized with pool)
let deltaRadarService: any;
let heatmapService: any;
let readinessTwinService: any;
let traceabilityService: any;
let workspaceService: any;
let templateLearningService: any;
let negotiationService: any;
let guardrailsService: any;

// Pool used by the tenant-ownership guards below. Falls back to the shared
// app pool when the router is mounted without initializeInnovationRoutes().
let guardPool: Pool | null = null;

/**
 * Initialize services with database pool
 */
export function initializeInnovationRoutes(pool: Pool): Router {
  guardPool = pool;
  deltaRadarService = new RegulatoryDeltaRadarService(pool);
  heatmapService = new EvidenceConfidenceHeatmapService(pool);
  readinessTwinService = new SubmissionReadinessTwinService(pool);
  traceabilityService = new AutoTraceabilityService(pool);
  workspaceService = new AdaptiveReviewerWorkspaceService(pool);
  templateLearningService = new OutcomeBasedTemplateLearningService(pool);
  negotiationService = new RegulatoryNegotiationLogbookService(pool);
  guardrailsService = new ComplianceGuardrailsSDKService(pool);

  return router;
}

// Async handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// ============================================================================
// TENANT OWNERSHIP GUARDS
// ============================================================================
//
// The innovation.* tables (negotiation_threads/entries/positions,
// auto_trace_links, template_usage, submission_outcomes, the readiness /
// evidence / delta-radar tables, guardrail_validation_runs and
// guardrail_findings) carry NO org column of their own — every row hangs off
// a program_id — and the services reach them with `SET app.bypass_rls`, so
// RLS does not protect them. Program ownership was never verified at this
// layer, which let a caller in org A read or write org B's rows by guessing
// a programId. These helpers close that hole at the route layer.
//
// Program -> org chain, strongest first (mirrors the services' own
// resolveProgramId() resolution order):
//   1. public.programs.organization_id      (the registry the innovation
//      services themselves resolve against)
//   2. core.programs.org_id                 (GCC core registry; org_id added
//      by db/migrations/069_gcc_multitenant_rls_expansion.sql)
//   3. regulatory_programs.organization_id  (program-workbench registry used
//      by the other tenant-scoped routes, e.g. mdx/c2c/q-sub)
// A program is in-org when ANY source confirms id+org. Unknown programs are
// denied with 404, so cross-tenant ids and non-existent ids are
// indistinguishable to the caller.
//
// Child identifiers are first resolved to their parent program inside the
// innovation schema (thread -> negotiation_threads.program_id, entry ->
// thread -> program, scan/finding/assessment/link/run -> program_id) and
// then funneled through the same program-in-org check. learning_templates,
// guardrail_rules and guardrail_profiles carry org_id directly (NULL =
// public/system) and are checked against it. Workspace preferences/analytics
// have no org chain at all (only a bare user_id), so those routes are bound
// to the authenticated user instead.

/**
 * Run a parameterized ownership query. The check must see all rows
 * regardless of the connection's RLS session state (tenant scoping is
 * enforced explicitly by the WHERE clauses), so RLS is bypassed only for
 * the duration of the transaction. Any failure (missing table in this
 * environment, no pool, bad cast) is treated as "no match" — deny by
 * default.
 */
async function guardQuery(text: string, params: unknown[]): Promise<Record<string, unknown>[] | null> {
  const pool = guardPool ?? (sharedPool as Pool | null);
  if (!pool) return null;
  let client;
  try {
    client = await pool.connect();
  } catch {
    return null;
  }
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.bypass_rls = 'true'");
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result.rows;
  } catch {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken — nothing to roll back */
    }
    return null;
  } finally {
    client.release();
  }
}

// `id::text` comparisons keep garbage input from raising uuid cast errors;
// `::text` on the org column tolerates integer or uuid org id shapes.
const PROGRAM_ORG_SOURCES: readonly string[] = [
  'SELECT 1 FROM programs WHERE id::text = $1 AND organization_id::text = $2 LIMIT 1',
  'SELECT 1 FROM core.programs WHERE id::text = $1 AND org_id::text = $2 LIMIT 1',
  'SELECT 1 FROM regulatory_programs WHERE id::text = $1 AND organization_id::text = $2 LIMIT 1',
];

/**
 * Exported so non-route callers can reuse this check rather than writing a
 * fourth copy of it. `server/routes/pdev/pdev-routes.ts` already carries a
 * second, and AnA's submission-readiness tool needs the same guarantee: a
 * program id supplied by a model must be proven to belong to the caller's org
 * before anything is read for it.
 */
export async function programBelongsToOrg(programId: string, orgId: number): Promise<boolean> {
  for (const source of PROGRAM_ORG_SOURCES) {
    const rows = await guardQuery(source, [programId, String(orgId)]);
    if (rows && rows.length > 0) return true;
  }
  return false;
}

/**
 * Verify a caller-supplied programId belongs to the authed org. Sends
 * 400/404 and returns false when it doesn't; handlers must bail out.
 */
async function assertProgramInOrg(res: Response, programId: unknown, orgId: number): Promise<boolean> {
  if (typeof programId !== 'string' || programId.trim() === '') {
    res.status(400).json({ success: false, error: 'programId is required' });
    return false;
  }
  if (!(await programBelongsToOrg(programId, orgId))) {
    res.status(404).json({ success: false, error: 'Program not found' });
    return false;
  }
  return true;
}

// Child-id -> program_id resolvers (innovation schema only; parameterized).
const SCAN_PROGRAM_SQL =
  'SELECT program_id FROM innovation.delta_radar_scans WHERE id::text = $1 LIMIT 1';
const DELTA_FINDING_PROGRAM_SQL =
  'SELECT program_id FROM innovation.delta_findings WHERE id::text = $1 LIMIT 1';
const EVIDENCE_ASSESSMENT_PROGRAM_SQL =
  'SELECT program_id FROM innovation.evidence_confidence_assessments WHERE id::text = $1 LIMIT 1';
// /evidence-heatmap/gaps/:assessmentId is historically fed a document id
// (identifyGaps resolves the latest assessment for a document), so accept
// either shape when resolving the owning program.
const EVIDENCE_DOC_OR_ASSESSMENT_PROGRAM_SQL = `
  SELECT program_id FROM innovation.evidence_confidence_assessments
  WHERE id::text = $1 OR document_id::text = $1
  ORDER BY assessed_at DESC LIMIT 1`;
const TRACE_LINK_PROGRAM_SQL =
  'SELECT program_id FROM innovation.auto_trace_links WHERE id::text = $1 LIMIT 1';
const THREAD_PROGRAM_SQL =
  'SELECT program_id FROM innovation.negotiation_threads WHERE id::text = $1 LIMIT 1';
const ENTRY_PROGRAM_SQL = `
  SELECT t.program_id FROM innovation.negotiation_entries e
  JOIN innovation.negotiation_threads t ON t.id = e.thread_id
  WHERE e.id::text = $1 LIMIT 1`;
const GUARDRAIL_RUN_PROGRAM_SQL =
  'SELECT program_id FROM innovation.guardrail_validation_runs WHERE id::text = $1 LIMIT 1';
const GUARDRAIL_FINDING_PROGRAM_SQL = `
  SELECT r.program_id FROM innovation.guardrail_findings f
  JOIN innovation.guardrail_validation_runs r ON r.id = f.run_id
  WHERE f.id::text = $1 LIMIT 1`;

/**
 * Resolve a child row (scan, finding, assessment, link, thread, entry, run)
 * to its parent program and verify that program belongs to the authed org.
 * Rows that don't exist, can't be resolved, or belong to another org all
 * yield the same 404.
 */
async function assertChildInOrg(
  res: Response,
  resolveSql: string,
  id: unknown,
  orgId: number,
  label: string
): Promise<boolean> {
  if (typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({ success: false, error: `${label} id is required` });
    return false;
  }
  const rows = await guardQuery(resolveSql, [id]);
  const programId = rows?.[0]?.program_id;
  if (programId == null || !(await programBelongsToOrg(String(programId), orgId))) {
    res.status(404).json({ success: false, error: `${label} not found` });
    return false;
  }
  return true;
}

/**
 * Templates carry org_id directly (NULL = public template shared across
 * tenants). A template is accessible when it is public or owned by the org.
 */
async function assertTemplateInOrg(res: Response, templateId: unknown, orgId: number): Promise<boolean> {
  if (typeof templateId !== 'string' || templateId.trim() === '') {
    res.status(400).json({ success: false, error: 'templateId is required' });
    return false;
  }
  const rows = await guardQuery(
    `SELECT 1 FROM innovation.learning_templates
     WHERE id::text = $1 AND (org_id IS NULL OR org_id::text = $2) LIMIT 1`,
    [templateId, String(orgId)]
  );
  if (!rows || rows.length === 0) {
    res.status(404).json({ success: false, error: 'Template not found' });
    return false;
  }
  return true;
}

/**
 * Guardrail rules carry org_id directly (NULL = system rule visible to all).
 */
async function assertRuleInOrg(res: Response, ruleId: unknown, orgId: number): Promise<boolean> {
  if (typeof ruleId !== 'string' || ruleId.trim() === '') {
    res.status(400).json({ success: false, error: 'ruleId is required' });
    return false;
  }
  const rows = await guardQuery(
    `SELECT 1 FROM innovation.guardrail_rules
     WHERE id::text = $1 AND (org_id IS NULL OR org_id::text = $2) LIMIT 1`,
    [ruleId, String(orgId)]
  );
  if (!rows || rows.length === 0) {
    res.status(404).json({ success: false, error: 'Rule not found' });
    return false;
  }
  return true;
}

/**
 * Guardrail profiles carry org_id directly (NULL = system profile).
 */
async function assertProfileInOrg(res: Response, profileId: unknown, orgId: number): Promise<boolean> {
  if (typeof profileId !== 'string' || profileId.trim() === '') {
    res.status(400).json({ success: false, error: 'profileId is required' });
    return false;
  }
  const rows = await guardQuery(
    `SELECT 1 FROM innovation.guardrail_profiles
     WHERE id::text = $1 AND (org_id IS NULL OR org_id::text = $2) LIMIT 1`,
    [profileId, String(orgId)]
  );
  if (!rows || rows.length === 0) {
    res.status(404).json({ success: false, error: 'Profile not found' });
    return false;
  }
  return true;
}

/**
 * Workspace preferences/analytics rows carry only a bare user_id — no org
 * column and no program chain — so the strongest available binding is the
 * authenticated subject itself: a caller may only touch their own rows.
 */
function authedUserId(req: Request): string | null {
  const raw = (req as any).user?.id ?? (req as any).user?.userId;
  return raw == null ? null : String(raw);
}

function requireSelfUser(req: Request, res: Response, userId: unknown): boolean {
  const self = authedUserId(req);
  if (!self || typeof userId !== 'string' || userId !== self) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return false;
  }
  return true;
}

// ============================================================================
// FEATURE 1: REGULATORY DELTA RADAR
// ============================================================================

/**
 * Import guidance document
 */
router.post('/delta-radar/guidance', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // importGuidanceDocument consumes organizationId (with an orgId fallback);
  // override both with the authed org so the body can't target another tenant.
  const document = await deltaRadarService.importGuidanceDocument({
    ...req.body,
    organizationId: String(orgGuard.orgId),
    orgId: String(orgGuard.orgId),
  });
  res.status(201).json({ success: true, data: document });
}));

/**
 * Get guidance documents
 */
router.get('/delta-radar/guidance', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getGuidanceDocuments scopes by organization id (filtering by agency/type/
  // search is not supported by the service). Org comes from the authed context,
  // never req.query (attacker-controlled).
  const documents = await deltaRadarService.getGuidanceDocuments(String(orgGuard.orgId));
  res.json({ success: true, data: documents });
}));

/**
 * Run delta scan
 */
router.post('/delta-radar/scan', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const { programId, documentId, scanType } = req.body;
  if (!(await assertProgramInOrg(res, programId, orgGuard.orgId))) return;
  // Pass the authed org so the scan row's org_id can't be spoofed (and so
  // the service never falls back to resolving another tenant's program).
  const scan = await deltaRadarService.runDeltaScan({
    programId,
    documentId,
    scanScope: scanType || 'full',
    organizationId: String(orgGuard.orgId),
    orgId: String(orgGuard.orgId)
  });
  res.status(201).json({ success: true, data: scan });
}));

/**
 * Get scan findings
 */
router.get('/delta-radar/scan/:scanId/findings', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Scan -> delta_radar_scans.program_id -> program -> org.
  if (!(await assertChildInOrg(res, SCAN_PROGRAM_SQL, String(req.params.scanId), orgGuard.orgId, 'Scan'))) return;
  const findings = await deltaRadarService.getScanFindings(String(req.params.scanId));
  res.json({ success: true, data: findings });
}));

/**
 * Update finding status
 */
router.patch('/delta-radar/findings/:findingId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Finding -> delta_findings.program_id -> program -> org.
  if (!(await assertChildInOrg(res, DELTA_FINDING_PROGRAM_SQL, String(req.params.findingId), orgGuard.orgId, 'Finding'))) return;
  const { status, resolution } = req.body;
  const finding = await deltaRadarService.updateFindingStatus(
    String(req.params.findingId),
    status,
    resolution
  );
  res.json({ success: true, data: finding });
}));

/**
 * Get delta statistics
 */
router.get('/delta-radar/statistics/:programId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertProgramInOrg(res, String(req.params.programId), orgGuard.orgId))) return;
  const stats = await deltaRadarService.getDeltaStatistics(String(req.params.programId));
  res.json({ success: true, data: stats });
}));

// ============================================================================
// FEATURE 2: EVIDENCE CONFIDENCE HEATMAP
// ============================================================================

/**
 * Configure scoring
 */
router.post('/evidence-heatmap/config', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // createScoringConfig consumes organizationId; never trust the body's value.
  const config = await heatmapService.createScoringConfig({
    ...req.body,
    organizationId: String(orgGuard.orgId),
  });
  res.status(201).json({ success: true, data: config });
}));

/**
 * Get scoring configs
 */
router.get('/evidence-heatmap/config', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getScoringConfigs scopes by org id (submissionType filtering is not supported).
  const configs = await heatmapService.getScoringConfigs(String(orgGuard.orgId));
  res.json({ success: true, data: configs });
}));

/**
 * Run evidence assessment
 */
router.post('/evidence-heatmap/assess', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const { documentId, programId, content, configId } = req.body;
  if (!(await assertProgramInOrg(res, programId, orgGuard.orgId))) return;
  // runAssessment takes the program id plus a map of section content keyed by
  // document/section id. Wrap the single document's content into that shape.
  const documentContent = new Map<string, { title: string; content: string }>([
    [String(documentId), { title: String(documentId), content: String(content ?? '') }],
  ]);
  const assessment = await heatmapService.runAssessment(programId, documentContent, configId);
  res.status(201).json({ success: true, data: assessment });
}));

/**
 * Get assessment
 */
router.get('/evidence-heatmap/assessment/:assessmentId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Assessment -> evidence_confidence_assessments.program_id -> program -> org.
  if (!(await assertChildInOrg(res, EVIDENCE_ASSESSMENT_PROGRAM_SQL, String(req.params.assessmentId), orgGuard.orgId, 'Assessment'))) return;
  const assessment = await heatmapService.getAssessmentWithGaps(String(req.params.assessmentId));
  if (!assessment) {
    return res.status(404).json({ success: false, error: 'Assessment not found' });
  }
  res.json({ success: true, data: assessment });
}));

/**
 * Get evidence gaps
 */
router.get('/evidence-heatmap/gaps/:assessmentId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // The param is historically a document id (identifyGaps resolves the
  // latest assessment for it); accept assessment id or document id, then
  // verify the owning program belongs to the authed org.
  if (!(await assertChildInOrg(res, EVIDENCE_DOC_OR_ASSESSMENT_PROGRAM_SQL, String(req.params.assessmentId), orgGuard.orgId, 'Assessment'))) return;
  const gaps = await heatmapService.identifyGaps(String(req.params.assessmentId));
  res.json({ success: true, data: gaps });
}));

/**
 * Generate heatmap data
 */
router.get('/evidence-heatmap/heatmap/:assessmentId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Assessment -> evidence_confidence_assessments.program_id -> program -> org.
  if (!(await assertChildInOrg(res, EVIDENCE_ASSESSMENT_PROGRAM_SQL, String(req.params.assessmentId), orgGuard.orgId, 'Assessment'))) return;
  const heatmap = await heatmapService.generateHeatmapData(String(req.params.assessmentId));
  res.json({ success: true, data: heatmap });
}));

// ============================================================================
// FEATURE 3: SUBMISSION READINESS TWIN
// ============================================================================

/**
 * Get readiness criteria
 */
router.get('/readiness-twin/criteria', asyncHandler(async (req: Request, res: Response) => {
  const criteria = await readinessTwinService.getCriteria(
    req.query.submissionType as string,
    req.query.agency as string | undefined
  );
  res.json({ success: true, data: criteria });
}));

/**
 * Run readiness assessment
 */
router.post('/readiness-twin/assess', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const { programId, submissionType, agency } = req.body;
  if (!(await assertProgramInOrg(res, programId, orgGuard.orgId))) return;
  const assessment = await readinessTwinService.runAssessment({
    programId,
    submissionType,
    targetAgency: agency
  });
  res.status(201).json({ success: true, data: assessment });
}));

/**
 * Get assessment
 */
router.get('/readiness-twin/assessment/:assessmentId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // NOTE: the service exposes no fetch-by-assessment-id method; the closest
  // available accessor is getAssessmentHistory(programId). The route param is
  // used as the program id to return the most recent assessment. This needs
  // design confirmation (see batch report). Because the param IS a program
  // id, it is verified against the authed org like every other programId.
  if (!(await assertProgramInOrg(res, String(req.params.assessmentId), orgGuard.orgId))) return;
  const history = await readinessTwinService.getAssessmentHistory(
    String(req.params.assessmentId),
    1
  );
  const assessment = history[0];
  if (!assessment) {
    return res.status(404).json({ success: false, error: 'Assessment not found' });
  }
  res.json({ success: true, data: assessment });
}));

/**
 * Get readiness dashboard
 */
router.get('/readiness-twin/dashboard/:programId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertProgramInOrg(res, String(req.params.programId), orgGuard.orgId))) return;
  const dashboard = await readinessTwinService.getDashboard(
    String(req.params.programId),
    req.query.submissionType as string,
    req.query.agency as string
  );
  res.json({ success: true, data: dashboard });
}));

/**
 * Get readiness trends
 */
router.get('/readiness-twin/trends/:programId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertProgramInOrg(res, String(req.params.programId), orgGuard.orgId))) return;
  const trends = await readinessTwinService.getTrendData(
    String(req.params.programId),
    parseInt(req.query.days as string) || 90
  );
  res.json({ success: true, data: trends });
}));

// ============================================================================
// FEATURE 4: AUTO-TRACEABILITY FROM DRAFTS
// ============================================================================

/**
 * Detect trace links
 */
router.post('/traceability/detect', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const { programId, sourceDocumentId, sourceContent } = req.body;
  if (!(await assertProgramInOrg(res, programId, orgGuard.orgId))) return;
  const links = await traceabilityService.detectLinks({
    programId,
    documentId: sourceDocumentId,
    content: sourceContent
  });
  res.json({ success: true, data: links });
}));

/**
 * Create manual trace link
 */
router.post('/traceability/links', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertProgramInOrg(res, req.body?.programId, orgGuard.orgId))) return;
  const link = await traceabilityService.createLink(req.body);
  res.status(201).json({ success: true, data: link });
}));

/**
 * Get trace links
 */
router.get('/traceability/links', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getLinks has no org filter of its own, so programId is mandatory here
  // and must belong to the authed org.
  if (!(await assertProgramInOrg(res, req.query.programId, orgGuard.orgId))) return;
  // getLinks takes the program id positionally plus an options bag; only
  // documentId and linkType are supported filters.
  const links = await traceabilityService.getLinks(req.query.programId as string, {
    documentId: req.query.sourceDocumentId as string | undefined,
    linkType: req.query.linkType as TraceLinkType | undefined
  });
  res.json({ success: true, data: links });
}));

/**
 * Validate link
 */
router.post('/traceability/links/:linkId/validate', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Link -> auto_trace_links.program_id -> program -> org.
  if (!(await assertChildInOrg(res, TRACE_LINK_PROGRAM_SQL, String(req.params.linkId), orgGuard.orgId, 'Link'))) return;
  const link = await traceabilityService.validateLink(
    String(req.params.linkId),
    'confirmed',
    req.body.validatedBy || 'system'
  );
  res.json({ success: true, data: link });
}));

/**
 * Generate traceability matrix
 */
router.post('/traceability/matrix', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const { programId, documentIds, createdBy } = req.body;
  if (!(await assertProgramInOrg(res, programId, orgGuard.orgId))) return;
  const snapshot = await traceabilityService.generateMatrixSnapshot(
    programId,
    documentIds,
    createdBy || 'system'
  );
  res.status(201).json({ success: true, data: snapshot });
}));

/**
 * Get traceability statistics
 */
router.get('/traceability/statistics/:programId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertProgramInOrg(res, String(req.params.programId), orgGuard.orgId))) return;
  const stats = await traceabilityService.getStatistics(String(req.params.programId));
  res.json({ success: true, data: stats });
}));

// ============================================================================
// FEATURE 5: ADAPTIVE REVIEWER WORKSPACE
// ============================================================================

/**
 * Get workspace roles
 */
router.get('/workspace/roles', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getRoles returns system roles (org_id IS NULL) plus the authed org's own.
  const roles = await workspaceService.getRoles(String(orgGuard.orgId));
  res.json({ success: true, data: roles });
}));

/**
 * Get workspace presets
 */
router.get('/workspace/presets', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getPresets supports roleId and orgId filters (submissionType is not supported).
  const presets = await workspaceService.getPresets({
    roleId: req.query.roleId as string,
    orgId: String(orgGuard.orgId)
  });
  res.json({ success: true, data: presets });
}));

/**
 * Create workspace preset
 */
router.post('/workspace/presets', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // createPreset consumes orgId; never trust the body's value.
  const preset = await workspaceService.createPreset({
    ...req.body,
    orgId: String(orgGuard.orgId),
  });
  res.status(201).json({ success: true, data: preset });
}));

/**
 * Get user preferences
 */
router.get('/workspace/preferences/:userId', asyncHandler(async (req: Request, res: Response) => {
  // user_workspace_preferences has no org or program chain (bare user_id),
  // so bind the route to the authenticated subject: self-access only.
  if (!requireSelfUser(req, res, String(req.params.userId))) return;
  const prefs = await workspaceService.getUserPreferences(String(req.params.userId));
  res.json({ success: true, data: prefs });
}));

/**
 * Save user preferences
 */
router.put('/workspace/preferences/:userId', asyncHandler(async (req: Request, res: Response) => {
  if (!requireSelfUser(req, res, String(req.params.userId))) return;
  const prefs = await workspaceService.updateUserPreferences(String(req.params.userId), req.body);
  res.json({ success: true, data: prefs });
}));

/**
 * Get computed workspace
 */
router.get('/workspace/computed/:userId', asyncHandler(async (req: Request, res: Response) => {
  if (!requireSelfUser(req, res, String(req.params.userId))) return;
  const workspace = await workspaceService.getComputedWorkspace(String(req.params.userId));
  res.json({ success: true, data: workspace });
}));

/**
 * Track workspace action
 */
router.post('/workspace/analytics/action', asyncHandler(async (req: Request, res: Response) => {
  // The service records workspace activity via recordFeatureUsage; map the
  // posted action body onto that signature.
  const { sessionId, featureId, durationMs } = req.body || {};
  // workspace_analytics rows carry only user_id/session_id (no org chain):
  // a session may only be written by the user who owns it.
  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }
  const sessionRows = await guardQuery(
    'SELECT user_id FROM innovation.workspace_analytics WHERE session_id::text = $1 LIMIT 1',
    [sessionId]
  );
  const sessionUserId = sessionRows?.[0]?.user_id;
  const self = authedUserId(req);
  if (sessionUserId == null || !self || String(sessionUserId) !== self) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  await workspaceService.recordFeatureUsage(sessionId, featureId, durationMs);
  res.status(201).json({ success: true });
}));

/**
 * Get workspace recommendations
 */
router.get('/workspace/recommendations/:userId', asyncHandler(async (req: Request, res: Response) => {
  if (!requireSelfUser(req, res, String(req.params.userId))) return;
  const recommendations = await workspaceService.getRecommendations(String(req.params.userId));
  res.json({ success: true, data: recommendations });
}));

// ============================================================================
// FEATURE 6: OUTCOME-BASED TEMPLATE LEARNING
// ============================================================================

/**
 * Create template
 */
router.post('/templates', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // createTemplate consumes organizationId (simple shape) or orgId
  // (LearningTemplate shape); override both with the authed org.
  const template = await templateLearningService.createTemplate({
    ...req.body,
    organizationId: String(orgGuard.orgId),
    orgId: String(orgGuard.orgId),
  });
  res.status(201).json({ success: true, data: template });
}));

/**
 * Get templates
 */
router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const templates = await templateLearningService.getTemplates({
    orgId: String(orgGuard.orgId),
    templateType: req.query.templateType as string,
    submissionType: req.query.submissionType as string,
    modulePath: req.query.modulePath as string,
    recommendedOnly: req.query.recommendedOnly === 'true'
  });
  res.json({ success: true, data: templates });
}));

/**
 * Get template
 */
router.get('/templates/:templateId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // learning_templates.org_id is the chain here (NULL = public template).
  if (!(await assertTemplateInOrg(res, String(req.params.templateId), orgGuard.orgId))) return;
  const template = await templateLearningService.getTemplate(String(req.params.templateId));
  if (!template) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  res.json({ success: true, data: template });
}));

/**
 * Record template usage
 */
router.post('/templates/usage', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // template_usage rows are keyed by program_id (org chain: program -> org)
  // and bump usage_count on the referenced template, so both ids must be
  // accessible to the authed org.
  if (!(await assertProgramInOrg(res, req.body?.programId, orgGuard.orgId))) return;
  if (!(await assertTemplateInOrg(res, req.body?.templateId, orgGuard.orgId))) return;
  const usage = await templateLearningService.recordUsage(req.body);
  res.status(201).json({ success: true, data: usage });
}));

/**
 * Record submission outcome.
 *
 * Side effect: triggers the Regulatory Intelligence feedback loop so the new
 * outcome is feature-extracted, ingested as a precedent, and used to retrain
 * the CRL/RTF risk model. The trigger is fire-and-forget — outcome creation
 * succeeds whether or not the loop completes — but failures are logged.
 */
router.post('/templates/outcomes', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // submission_outcomes rows are keyed by program_id (org chain: program ->
  // org). The programId must be supplied and owned by the authed org — the
  // service's fallback resolves "the latest program" across ALL tenants,
  // which is exactly the hole being closed.
  if (!(await assertProgramInOrg(res, req.body?.programId, orgGuard.orgId))) return;
  // recordOutcome's shorthand shape ({ outcome: ... }) ignores programId and
  // triggers that cross-tenant fallback, so translate it to the canonical
  // shape here with the verified programId (mirrors the service's own
  // mapping in recordOutcome()).
  const body = req.body || {};
  const payload =
    'outcome' in body
      ? {
          programId: body.programId,
          submissionId: body.submissionId,
          submissionType: body.submissionType || 'NDA',
          agency: body.agency || 'FDA',
          submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
          outcomeStatus: body.outcome,
          reviewDays: body.cycleTime,
          questionsReceived: body.agencyQuestions,
          feedbackSummary: body.feedbackSummary,
        }
      : body;
  const outcome = await templateLearningService.recordOutcome(payload);
  // Don't block the response on the loop; the closure runs asynchronously
  // and emits its own logs.
  void (async () => {
    try {
      const ri = await import('../services/intelligence/regulatory-intelligence');
      await ri.onOutcomeRecorded({});
    } catch (err) {
      logger.warn('Regulatory Intelligence loop failed after outcome:', err instanceof Error ? err.message : err);
    }
  })();
  res.status(201).json({ success: true, data: outcome });
}));

/**
 * Get template recommendations
 */
router.get('/templates/recommendations', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const recommendations = await templateLearningService.getRecommendations({
    submissionType: req.query.submissionType as string,
    modulePath: req.query.modulePath as string,
    therapeuticArea: req.query.therapeuticArea as string,
    orgId: String(orgGuard.orgId),
    limit: parseInt(req.query.limit as string) || 5
  });
  res.json({ success: true, data: recommendations });
}));

/**
 * Get template effectiveness report
 */
router.get('/templates/:templateId/effectiveness', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // learning_templates.org_id is the chain here (NULL = public template).
  if (!(await assertTemplateInOrg(res, String(req.params.templateId), orgGuard.orgId))) return;
  const report = await templateLearningService.getEffectivenessReport(String(req.params.templateId));
  if (!report) {
    return res.status(404).json({ success: false, error: 'Template not found' });
  }
  res.json({ success: true, data: report });
}));

/**
 * Get top performing templates
 */
router.get('/templates/top-performing', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const templates = await templateLearningService.getTopPerformingTemplates({
    submissionType: req.query.submissionType as string,
    limit: parseInt(req.query.limit as string) || 10
  });
  // The service ranks across ALL tenants' templates; keep only public
  // templates (orgId null) and the authed org's own.
  const visible = Array.isArray(templates)
    ? templates.filter((t: any) => t?.orgId == null || String(t.orgId) === String(orgGuard.orgId))
    : templates;
  res.json({ success: true, data: visible });
}));

// ============================================================================
// FEATURE 7: REGULATORY NEGOTIATION LOGBOOK
// ============================================================================

/**
 * Create negotiation thread
 */
router.post('/negotiations/threads', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // negotiation_threads carry no org column; the chain is
  // negotiation_threads.program_id -> program -> org.
  if (!(await assertProgramInOrg(res, req.body?.programId, orgGuard.orgId))) return;
  const thread = await negotiationService.createThread(req.body);
  res.status(201).json({ success: true, data: thread });
}));

/**
 * Get negotiation threads
 */
router.get('/negotiations/threads', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getThreads has no org filter of its own — without a programId it would
  // list every tenant's threads — so programId is mandatory here and must
  // belong to the authed org.
  if (!(await assertProgramInOrg(res, req.query.programId, orgGuard.orgId))) return;
  const threads = await negotiationService.getThreads({
    programId: req.query.programId as string,
    submissionId: req.query.submissionId as string,
    agency: req.query.agency as string,
    status: req.query.status as string,
    priority: req.query.priority as string,
    meetingType: req.query.meetingType as string,
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0
  });
  res.json({ success: true, data: threads });
}));

/**
 * Get thread
 */
router.get('/negotiations/threads/:threadId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Thread -> negotiation_threads.program_id -> program -> org.
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const thread = await negotiationService.getThread(String(req.params.threadId));
  if (!thread) {
    return res.status(404).json({ success: false, error: 'Thread not found' });
  }
  res.json({ success: true, data: thread });
}));

/**
 * Update thread
 */
router.patch('/negotiations/threads/:threadId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const thread = await negotiationService.updateThread(String(req.params.threadId), req.body);
  res.json({ success: true, data: thread });
}));

/**
 * Add entry to thread
 */
router.post('/negotiations/threads/:threadId/entries', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const entry = await negotiationService.addEntry({
    ...req.body,
    threadId: req.params.threadId
  });
  res.status(201).json({ success: true, data: entry });
}));

/**
 * Get thread entries
 */
router.get('/negotiations/threads/:threadId/entries', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const entries = await negotiationService.getEntries(String(req.params.threadId), {
    entryType: req.query.entryType as string,
    direction: req.query.direction as string,
    limit: parseInt(req.query.limit as string)
  });
  res.json({ success: true, data: entries });
}));

/**
 * Update entry
 */
router.patch('/negotiations/entries/:entryId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Entry -> negotiation_entries.thread_id -> thread.program_id -> program -> org.
  if (!(await assertChildInOrg(res, ENTRY_PROGRAM_SQL, String(req.params.entryId), orgGuard.orgId, 'Entry'))) return;
  const entry = await negotiationService.updateEntry(String(req.params.entryId), req.body);
  res.json({ success: true, data: entry });
}));

/**
 * Set position
 */
router.post('/negotiations/threads/:threadId/positions', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const position = await negotiationService.setPosition({
    ...req.body,
    threadId: req.params.threadId
  });
  res.status(201).json({ success: true, data: position });
}));

/**
 * Get positions
 */
router.get('/negotiations/threads/:threadId/positions', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const positions = await negotiationService.getPositions(
    String(req.params.threadId),
    req.query.status as string
  );
  res.json({ success: true, data: positions });
}));

/**
 * Get thread timeline
 */
router.get('/negotiations/threads/:threadId/timeline', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertChildInOrg(res, THREAD_PROGRAM_SQL, String(req.params.threadId), orgGuard.orgId, 'Thread'))) return;
  const timeline = await negotiationService.getTimeline(String(req.params.threadId));
  res.json({ success: true, data: timeline });
}));

/**
 * Search negotiations
 */
router.get('/negotiations/search', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // search() has no org filter of its own — without a programId it would
  // search every tenant's threads — so programId is mandatory here and must
  // belong to the authed org.
  if (!(await assertProgramInOrg(res, req.query.programId, orgGuard.orgId))) return;
  const results = await negotiationService.search({
    query: req.query.q as string,
    programId: req.query.programId as string,
    agency: req.query.agency as string,
    limit: parseInt(req.query.limit as string) || 20
  });
  res.json({ success: true, data: results });
}));

/**
 * Get negotiation statistics
 */
router.get('/negotiations/statistics/:programId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  if (!(await assertProgramInOrg(res, String(req.params.programId), orgGuard.orgId))) return;
  const stats = await negotiationService.getStatistics(String(req.params.programId));
  res.json({ success: true, data: stats });
}));

// ============================================================================
// FEATURE 8: COMPLIANCE GUARDRAILS SDK
// ============================================================================

/**
 * Create guardrail rule
 */
router.post('/guardrails/rules', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // createRule consumes orgId (with an organizationId fallback); override both.
  const rule = await guardrailsService.createRule({
    ...req.body,
    orgId: String(orgGuard.orgId),
    organizationId: String(orgGuard.orgId),
  });
  res.status(201).json({ success: true, data: rule });
}));

/**
 * Get guardrail rules
 */
router.get('/guardrails/rules', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const rules = await guardrailsService.getRules({
    orgId: String(orgGuard.orgId),
    category: req.query.category as string,
    severity: req.query.severity as string,
    submissionType: req.query.submissionType as string,
    modulePath: req.query.modulePath as string,
    activeOnly: req.query.activeOnly !== 'false'
  });
  res.json({ success: true, data: rules });
}));

/**
 * Get rule
 */
router.get('/guardrails/rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // guardrail_rules.org_id is the chain here (NULL = system rule).
  if (!(await assertRuleInOrg(res, String(req.params.ruleId), orgGuard.orgId))) return;
  const rule = await guardrailsService.getRule(String(req.params.ruleId));
  if (!rule) {
    return res.status(404).json({ success: false, error: 'Rule not found' });
  }
  res.json({ success: true, data: rule });
}));

/**
 * Create guardrail profile
 */
router.post('/guardrails/profiles', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // createProfile consumes orgId (with an organizationId fallback); override both.
  const profile = await guardrailsService.createProfile({
    ...req.body,
    orgId: String(orgGuard.orgId),
    organizationId: String(orgGuard.orgId),
  });
  res.status(201).json({ success: true, data: profile });
}));

/**
 * Get guardrail profiles
 */
router.get('/guardrails/profiles', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  const profiles = await guardrailsService.getProfiles({
    orgId: String(orgGuard.orgId),
    submissionType: req.query.submissionType as string,
    agency: req.query.agency as string
  });
  res.json({ success: true, data: profiles });
}));

/**
 * Run validation
 */
router.post('/guardrails/validate', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Validation runs are keyed by program_id (org chain: program -> org) and
  // can execute another tenant's profile, so both ids — when supplied — must
  // belong to (or be visible to) the authed org. programId is required: the
  // run row's program_id is NOT NULL and there is no other org anchor.
  if (!(await assertProgramInOrg(res, req.body?.programId, orgGuard.orgId))) return;
  if (req.body?.profileId != null) {
    if (!(await assertProfileInOrg(res, req.body.profileId, orgGuard.orgId))) return;
  }
  const startTime = Date.now();

  try {
    const result = await guardrailsService.validate({
      content: req.body.content,
      contentType: req.body.contentType || 'document',
      profileId: req.body.profileId,
      programId: req.body.programId,
      submissionId: req.body.submissionId,
      documentId: req.body.documentId,
      submissionType: req.body.submissionType,
      modulePath: req.body.modulePath,
      runType: req.body.runType || 'api',
      triggeredBy: req.body.triggeredBy || 'api',
      apiClientId: req.body.apiClientId
    });

    // Log API call
    await guardrailsService.logAPICall({
      clientId: req.body.apiClientId,
      endpoint: '/guardrails/validate',
      method: 'POST',
      requestBody: { contentType: req.body.contentType, profileId: req.body.profileId },
      responseStatus: 200,
      responseTime: Date.now() - startTime,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    await guardrailsService.logAPICall({
      clientId: req.body.apiClientId,
      endpoint: '/guardrails/validate',
      method: 'POST',
      requestBody: { contentType: req.body.contentType, profileId: req.body.profileId },
      responseStatus: 500,
      responseTime: Date.now() - startTime,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      errorMessage: error.message
    });
    throw error;
  }
}));

/**
 * Get validation run findings
 */
router.get('/guardrails/runs/:runId/findings', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Run -> guardrail_validation_runs.program_id -> program -> org.
  if (!(await assertChildInOrg(res, GUARDRAIL_RUN_PROGRAM_SQL, String(req.params.runId), orgGuard.orgId, 'Run'))) return;
  const findings = await guardrailsService.getRunFindings(String(req.params.runId));
  res.json({ success: true, data: findings });
}));

/**
 * Acknowledge finding
 */
router.post('/guardrails/findings/:findingId/acknowledge', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // Finding -> guardrail_findings.run_id -> run.program_id -> program -> org.
  if (!(await assertChildInOrg(res, GUARDRAIL_FINDING_PROGRAM_SQL, String(req.params.findingId), orgGuard.orgId, 'Finding'))) return;
  const finding = await guardrailsService.acknowledgeFinding(
    String(req.params.findingId),
    req.body.acknowledgedBy,
    req.body.reason
  );
  res.json({ success: true, data: finding });
}));

/**
 * Get validation history
 */
router.get('/guardrails/history', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getValidationHistory has no org filter of its own — without a programId
  // it would list every tenant's runs — so programId is mandatory here and
  // must belong to the authed org.
  if (!(await assertProgramInOrg(res, req.query.programId, orgGuard.orgId))) return;
  const history = await guardrailsService.getValidationHistory({
    programId: req.query.programId as string,
    submissionId: req.query.submissionId as string,
    documentId: req.query.documentId as string,
    limit: parseInt(req.query.limit as string) || 50
  });
  res.json({ success: true, data: history });
}));

/**
 * Get guardrails statistics
 */
router.get('/guardrails/statistics', asyncHandler(async (req: Request, res: Response) => {
  const orgGuard = requireAuthedOrgId(req, res);
  if (!orgGuard.ok) return;
  // getStatistics aggregates across all tenants unless scoped to a program;
  // programId is mandatory and must belong to the authed org.
  if (!(await assertProgramInOrg(res, req.query.programId, orgGuard.orgId))) return;
  const stats = await guardrailsService.getStatistics({
    programId: req.query.programId as string,
    dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
    dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined
  });
  res.json({ success: true, data: stats });
}));

// Error handler
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Error', { err: err instanceof Error ? err.message : String(err) });
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    code: err.code
  });
});

export default router;
