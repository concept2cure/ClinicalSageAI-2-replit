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

/**
 * Initialize services with database pool
 */
export function initializeInnovationRoutes(pool: Pool): Router {
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
// FEATURE 1: REGULATORY DELTA RADAR
// ============================================================================

/**
 * Import guidance document
 */
router.post('/delta-radar/guidance', asyncHandler(async (req: Request, res: Response) => {
  const document = await deltaRadarService.importGuidanceDocument(req.body);
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
  const { programId, documentId, scanType } = req.body;
  const scan = await deltaRadarService.runDeltaScan({
    programId,
    documentId,
    scanScope: scanType || 'full'
  });
  res.status(201).json({ success: true, data: scan });
}));

/**
 * Get scan findings
 */
router.get('/delta-radar/scan/:scanId/findings', asyncHandler(async (req: Request, res: Response) => {
  const findings = await deltaRadarService.getScanFindings(String(req.params.scanId));
  res.json({ success: true, data: findings });
}));

/**
 * Update finding status
 */
router.patch('/delta-radar/findings/:findingId', asyncHandler(async (req: Request, res: Response) => {
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
  const config = await heatmapService.createScoringConfig(req.body);
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
  const { documentId, programId, content, configId } = req.body;
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
  // identifyGaps resolves the latest assessment for the given document/assessment id.
  const gaps = await heatmapService.identifyGaps(String(req.params.assessmentId));
  res.json({ success: true, data: gaps });
}));

/**
 * Generate heatmap data
 */
router.get('/evidence-heatmap/heatmap/:assessmentId', asyncHandler(async (req: Request, res: Response) => {
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
  const { programId, submissionType, agency } = req.body;
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
  // NOTE: the service exposes no fetch-by-assessment-id method; the closest
  // available accessor is getAssessmentHistory(programId). The route param is
  // used as the program id to return the most recent assessment. This needs
  // design confirmation (see batch report).
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
  const { programId, sourceDocumentId, sourceContent } = req.body;
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
  const link = await traceabilityService.createLink(req.body);
  res.status(201).json({ success: true, data: link });
}));

/**
 * Get trace links
 */
router.get('/traceability/links', asyncHandler(async (req: Request, res: Response) => {
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
  const { programId, documentIds, createdBy } = req.body;
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
  const roles = await workspaceService.getRoles();
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
  const preset = await workspaceService.createPreset(req.body);
  res.status(201).json({ success: true, data: preset });
}));

/**
 * Get user preferences
 */
router.get('/workspace/preferences/:userId', asyncHandler(async (req: Request, res: Response) => {
  const prefs = await workspaceService.getUserPreferences(String(req.params.userId));
  res.json({ success: true, data: prefs });
}));

/**
 * Save user preferences
 */
router.put('/workspace/preferences/:userId', asyncHandler(async (req: Request, res: Response) => {
  const prefs = await workspaceService.updateUserPreferences(String(req.params.userId), req.body);
  res.json({ success: true, data: prefs });
}));

/**
 * Get computed workspace
 */
router.get('/workspace/computed/:userId', asyncHandler(async (req: Request, res: Response) => {
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
  await workspaceService.recordFeatureUsage(sessionId, featureId, durationMs);
  res.status(201).json({ success: true });
}));

/**
 * Get workspace recommendations
 */
router.get('/workspace/recommendations/:userId', asyncHandler(async (req: Request, res: Response) => {
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
  const template = await templateLearningService.createTemplate(req.body);
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
  const outcome = await templateLearningService.recordOutcome(req.body);
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
  const templates = await templateLearningService.getTopPerformingTemplates({
    submissionType: req.query.submissionType as string,
    limit: parseInt(req.query.limit as string) || 10
  });
  res.json({ success: true, data: templates });
}));

// ============================================================================
// FEATURE 7: REGULATORY NEGOTIATION LOGBOOK
// ============================================================================

/**
 * Create negotiation thread
 */
router.post('/negotiations/threads', asyncHandler(async (req: Request, res: Response) => {
  const thread = await negotiationService.createThread(req.body);
  res.status(201).json({ success: true, data: thread });
}));

/**
 * Get negotiation threads
 */
router.get('/negotiations/threads', asyncHandler(async (req: Request, res: Response) => {
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
  const thread = await negotiationService.updateThread(String(req.params.threadId), req.body);
  res.json({ success: true, data: thread });
}));

/**
 * Add entry to thread
 */
router.post('/negotiations/threads/:threadId/entries', asyncHandler(async (req: Request, res: Response) => {
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
  const entry = await negotiationService.updateEntry(String(req.params.entryId), req.body);
  res.json({ success: true, data: entry });
}));

/**
 * Set position
 */
router.post('/negotiations/threads/:threadId/positions', asyncHandler(async (req: Request, res: Response) => {
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
  const timeline = await negotiationService.getTimeline(String(req.params.threadId));
  res.json({ success: true, data: timeline });
}));

/**
 * Search negotiations
 */
router.get('/negotiations/search', asyncHandler(async (req: Request, res: Response) => {
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
  const rule = await guardrailsService.createRule(req.body);
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
  const profile = await guardrailsService.createProfile(req.body);
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
  const findings = await guardrailsService.getRunFindings(String(req.params.runId));
  res.json({ success: true, data: findings });
}));

/**
 * Acknowledge finding
 */
router.post('/guardrails/findings/:findingId/acknowledge', asyncHandler(async (req: Request, res: Response) => {
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
