/**
 * Biostatistics Platform API Routes
 *
 * Comprehensive route file for all 7 biostatistics capabilities:
 *   1. Statistical Continuum
 *   2. Regulatory Design Optimizer
 *   3. Estimand & Multiplicity Engine
 *   4. Collaborative SAP
 *   5. External Control Arms
 *   6. Adaptive Trial Operations
 *   7. Biostatistics Knowledge Graph
 *
 * Each route uses authentication middleware, resolves the organization ID,
 * delegates to the appropriate service, and returns JSON with error handling.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { adaptiveTrialOperationsService } from '../services/adaptive-trial-operations-service';
import biostatKnowledgeGraphService from '../services/biostat-knowledge-graph-service';
import statisticalContinuumService from '../services/statistical-continuum-service';
import { regulatoryOutcomeOptimizerService } from '../services/regulatory-outcome-optimizer-service';
import { estimandEngineService } from '../services/estimand-engine-service';
import { CollaborativeSapService } from '../services/collaborative-sap-service';
import { ExternalControlArmService } from '../services/external-control-arm-service';

const collaborativeSapService = new CollaborativeSapService();
const externalControlArmService = new ExternalControlArmService();

const router = Router();

// All routes require authentication
const authMiddleware = authenticateToken;

/**
 * Helper to resolve the organization ID from the authenticated request.
 */
function resolveOrganizationId(req: Request): number {
  return (
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantContext?.organizationId ||
    1
  );
}

/**
 * Helper to resolve the authenticated user's ID.
 */
function resolveUserId(req: Request): number {
  const user = (req as any).user;
  return Number(user?.userId || user?.id || user?.sub || 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 1: Statistical Continuum
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/continuum/initialize
 * Initialize a new statistical continuum thread.
 */
router.post('/continuum/initialize', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { title, indication, phase, designType, endpoints, regulatoryContext } = req.body;

    const result = await statisticalContinuumService.initializeThread(
      { title, indication, phase, primary_endpoint: endpoints?.[0], sample_size: req.body.sampleSize || 200 },
      orgId,
      userId
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/continuum/threads
 * List all statistical continuum threads for the organization.
 */
router.get('/continuum/threads', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { status, phase, limit, offset } = req.query;

    const threads = await statisticalContinuumService.listThreads(orgId);
    res.json({ success: true, data: threads });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/continuum/:threadId
 * Get a specific statistical continuum thread with full context.
 */
router.get('/continuum/:threadId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const threadId = Number(req.params.threadId);

    const result = await statisticalContinuumService.getThread(threadId, orgId);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Thread not found' });
    }
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/biostat/continuum/:threadId/sap
 * Update the SAP section of a continuum thread.
 */
router.put('/continuum/:threadId/sap', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const threadId = Number(req.params.threadId);
    const { sapContent, sections } = req.body;

    const result = await statisticalContinuumService.generateSAP(threadId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/biostat/continuum/:threadId/analysis-specs
 * Update analysis specifications for a continuum thread.
 */
router.put('/continuum/:threadId/analysis-specs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const threadId = Number(req.params.threadId);
    const { analysisSpecs } = req.body;

    const result = await statisticalContinuumService.generateAnalysisSpecs(threadId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/biostat/continuum/:threadId/tlf-shells
 * Update TLF (Tables, Listings, Figures) shells for a continuum thread.
 */
router.put('/continuum/:threadId/tlf-shells', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const threadId = Number(req.params.threadId);
    const { tlfShells } = req.body;

    const result = await statisticalContinuumService.generateTLFShells(threadId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/continuum/:threadId/results
 * Submit results for a continuum thread.
 */
router.post('/continuum/:threadId/results', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const threadId = Number(req.params.threadId);
    const { results, analysisOutputs } = req.body;

    const result = await statisticalContinuumService.ingestResults(threadId, req.body, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/continuum/:threadId/csr-sections
 * Get auto-generated CSR sections from the continuum thread.
 */
router.get('/continuum/:threadId/csr-sections', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const threadId = Number(req.params.threadId);

    const result = await statisticalContinuumService.generateCSRSections(threadId, orgId);
    res.json({ success: true, data: result });
    };

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 2: Regulatory Design Optimizer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/design-optimizer/recommend
 * Get regulatory-optimal design recommendations for an indication and endpoints.
 */
router.post('/design-optimizer/recommend', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { indication, phase, endpoints, constraints, regulatoryAgencies } = req.body;

    const result = await regulatoryOutcomeOptimizerService.recommendDesign(
      { indication, phase, endpoints, constraints },
      orgId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/design-optimizer/regulatory-precedents/:indication
 * Get regulatory precedents for a specific indication.
 */
router.get('/design-optimizer/regulatory-precedents/:indication', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const indication = req.params.indication;
    const { agency, phase, year } = req.query;

    const result = await regulatoryOutcomeOptimizerService.getRegulatoryPrecedents(indication, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/design-optimizer/sensitivity
 * Run sensitivity analysis on design parameters.
 */
router.post('/design-optimizer/sensitivity', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { designId, parameters, ranges } = req.body;

    const result = await regulatoryOutcomeOptimizerService.runSensitivityAnalysis(req.body, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 3: Estimand & Multiplicity Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/estimand/define
 * Define an estimand following ICH E9(R1) framework.
 */
router.post('/estimand/define', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { population, treatment, endpoint, intercurrentEvents, summaryMeasure, threadId } = req.body;

    const result = await estimandEngineService.defineEstimand({
      threadId,
      endpointName: endpoint,
      population,
      variable: treatment || endpoint,
      summaryMeasure: summaryMeasure || 'difference_in_means',
      intercurrentEvents: intercurrentEvents || [],
      strategy: req.body.strategy || 'treatment_policy',
    }, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/estimand/:estimandId/methods
 * Get recommended statistical methods for an estimand.
 */
router.post('/estimand/:estimandId/methods', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const estimandId = Number(req.params.estimandId);
    const { constraints, preferences } = req.body;

    const result = await estimandEngineService.recommendMethods(estimandId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/multiplicity/design
 * Design a multiplicity adjustment strategy.
 */
router.post('/multiplicity/design', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { hypotheses, familyStructure, method, alpha, weights } = req.body;

    const result = await estimandEngineService.designMultiplicityStrategy({
      threadId: req.body.threadId,
      hypotheses: hypotheses || [],
      overallAlpha: alpha ?? 0.025,
      approach: method || 'graphical',
    }, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/estimand/regulatory-examples/:indication
 * Get regulatory examples of estimand frameworks for an indication.
 */
router.get('/estimand/regulatory-examples/:indication', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const indication = req.params.indication;
    const { agency, phase } = req.query;

    const strategy = req.query.strategy as string | undefined;
    const result = await estimandEngineService.getRegulatoryExamples(indication, strategy, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/estimand/:estimandId/validate
 * Validate an estimand definition against regulatory guidelines.
 */
router.post('/estimand/:estimandId/validate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const estimandId = Number(req.params.estimandId);
    const { regulatoryFramework } = req.body;

    const result = await estimandEngineService.validateEstimand(estimandId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 4: Collaborative SAP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/sap/create
 * Create a new collaborative SAP version.
 */
router.post('/sap/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { threadId, title, sections, templateId } = req.body;

    const result = await collaborativeSapService.createSapVersion(
      threadId, sections || {}, orgId, userId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/biostat/sap/:sapVersionId/section/:sectionId
 * Update a specific section of a SAP version.
 */
router.put('/sap/:sapVersionId/section/:sectionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const sapVersionId = Number(req.params.sapVersionId);
    const sectionId = req.params.sectionId;
    const { content, trackChanges } = req.body;

    const result = await collaborativeSapService.updateSection(
      sapVersionId, sectionId, content, orgId, userId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/sap/:sapVersionId/comment
 * Add a comment to a SAP version.
 */
router.post('/sap/:sapVersionId/comment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const sapVersionId = Number(req.params.sapVersionId);
    const { sectionId, content, parentCommentId } = req.body;

    const result = await collaborativeSapService.addComment(
      sapVersionId, sectionId, content, orgId, userId, parentCommentId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/sap/:sapVersionId/resolve-comment/:commentId
 * Resolve a comment on a SAP version.
 */
router.post('/sap/:sapVersionId/resolve-comment/:commentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const sapVersionId = Number(req.params.sapVersionId);
    const commentId = Number(req.params.commentId);
    const { resolution } = req.body;

    const result = await collaborativeSapService.resolveComment(commentId, orgId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/sap/amendment
 * Create a SAP amendment (new version from an existing SAP).
 */
router.post('/sap/amendment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { previousVersionId, reason, changes } = req.body;

    const result = await collaborativeSapService.createAmendment(
      req.body.threadId, reason, changes, req.body.sectionsAffected || [], orgId, userId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/sap/:sapVersionId/sign
 * Sign / approve a SAP version.
 */
router.post('/sap/:sapVersionId/sign', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const sapVersionId = Number(req.params.sapVersionId);
    const { role, signatureType } = req.body;

    const result = await collaborativeSapService.signVersion(sapVersionId, req.body, orgId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/sap/:sapVersionId/lock
 * Lock a SAP version (finalize / make read-only).
 */
router.post('/sap/:sapVersionId/lock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const sapVersionId = Number(req.params.sapVersionId);

    const result = await collaborativeSapService.lockVersion(sapVersionId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/sap/:threadId/audit-trail
 * Get the full audit trail for a SAP thread.
 */
router.get('/sap/:threadId/audit-trail', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const threadId = Number(req.params.threadId);

    const result = await collaborativeSapService.getAuditTrail(threadId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/sap/version/:sapVersionId
 * Get a specific SAP version.
 */
router.get('/sap/version/:sapVersionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const sapVersionId = Number(req.params.sapVersionId);

    const result = await collaborativeSapService.getSapVersion(sapVersionId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/sap/:threadId/versions
 * List all SAP versions for a thread.
 */
router.get('/sap/:threadId/versions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const threadId = Number(req.params.threadId);

    const result = await collaborativeSapService.listVersions(threadId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 5: External Control Arms
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/external-control/search
 * Search for external control arm data sources.
 */
router.post('/external-control/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { indication, endpoints, population, dataSources } = req.body;

    const result = await externalControlArmService.searchHistoricalArms(
      { indication, endpoint: endpoints?.[0], phase: req.body.phase, armType: req.body.armType },
      orgId
    );
    res.json({ success: true, data: { arms: result } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/external-control/synthesize
 * Synthesize an external control arm from selected data sources.
 */
router.post('/external-control/synthesize', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { sourceIds, method, matchingVariables, threadId } = req.body;

    const result = await externalControlArmService.synthesizeControl(
      {
        name: req.body.name || `${req.body.indication || 'External'} Control`,
        indication: req.body.indication || '',
        endpoint: req.body.endpoint || '',
        method: method || 'propensity_score',
        sourceArmIds: sourceIds || [],
      },
      orgId,
      userId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/external-control/:controlId/validate
 * Validate an external control arm (balance diagnostics, sensitivity).
 */
router.post('/external-control/:controlId/validate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const controlId = Number(req.params.controlId);
    const { validationMethods } = req.body;

    const result = await externalControlArmService.validateControl(controlId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/external-control/:controlId/regulatory-package
 * Get the regulatory submission package for an external control arm.
 */
router.get('/external-control/:controlId/regulatory-package', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const controlId = Number(req.params.controlId);

    const result = await externalControlArmService.generateRegulatoryPackage(controlId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/external-control/ingest-arm
 * Ingest patient-level or summary-level external arm data.
 */
router.post('/external-control/ingest-arm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { dataFormat, source, data, metadata } = req.body;

    const result = await externalControlArmService.ingestArmData(req.body, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/external-control/:controlId
 * Get details of an external control arm.
 */
router.get('/external-control/:controlId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const controlId = Number(req.params.controlId);

    const result = await externalControlArmService.getControl(controlId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 6: Adaptive Trial Operations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/adaptive/plan
 * Create a new adaptive trial plan.
 */
router.post('/adaptive/plan', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { threadId, title, designType, adaptations, interimLooks, stoppingRules, spendingFunction, maxSampleSize } = req.body;

    const result = await adaptiveTrialOperationsService.createPlan(
      { threadId, title, designType, adaptations, interimLooks, stoppingRules, spendingFunction, maxSampleSize },
      orgId,
      userId
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/adaptive/:planId/interim-snapshot
 * Ingest interim data snapshot for an adaptive trial.
 */
router.post('/adaptive/:planId/interim-snapshot', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const planId = Number(req.params.planId);
    const { lookNumber, informationFraction, enrolledCount, isBlinded, summaryStatistics } = req.body;

    const result = await adaptiveTrialOperationsService.ingestInterimSnapshot(
      planId,
      { lookNumber, informationFraction, enrolledCount, isBlinded, summaryStatistics },
      orgId
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/adaptive/:planId/evaluate/:snapshotId
 * Evaluate stopping rules for a given interim snapshot.
 */
router.post('/adaptive/:planId/evaluate/:snapshotId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const planId = Number(req.params.planId);
    const snapshotId = Number(req.params.snapshotId);

    const result = await adaptiveTrialOperationsService.evaluateStoppingRules(planId, snapshotId, orgId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/adaptive/:planId/ssr/:snapshotId
 * Perform blinded sample size re-estimation.
 */
router.post('/adaptive/:planId/ssr/:snapshotId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const planId = Number(req.params.planId);
    const snapshotId = Number(req.params.snapshotId);

    const result = await adaptiveTrialOperationsService.performSSR(planId, snapshotId, orgId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/adaptive/:planId/decision
 * Record an adaptation decision.
 */
router.post('/adaptive/:planId/decision', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const planId = Number(req.params.planId);
    const { snapshotId, adaptationType, decision, rationale, parameters } = req.body;

    const result = await adaptiveTrialOperationsService.recordDecision(
      { planId, snapshotId, adaptationType, decision, rationale, parameters },
      orgId,
      userId
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/adaptive/:planId/idmc-report/:lookNumber
 * Generate IDMC report for a specific look number.
 */
router.get('/adaptive/:planId/idmc-report/:lookNumber', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const planId = Number(req.params.planId);
    const lookNumber = Number(req.params.lookNumber);

    const result = await adaptiveTrialOperationsService.generateIDMCReport(planId, lookNumber, orgId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/adaptive/:planId
 * Get full adaptive trial plan with snapshots, decisions, and reports.
 */
router.get('/adaptive/:planId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const planId = Number(req.params.planId);

    const result = await adaptiveTrialOperationsService.getPlan(planId, orgId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/adaptive/:planId/operating-characteristics
 * Compute operating characteristics via Monte Carlo simulation.
 */
router.get('/adaptive/:planId/operating-characteristics', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const planId = Number(req.params.planId);

    const result = await adaptiveTrialOperationsService.getOperatingCharacteristics(planId, orgId);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 7: Biostatistics Knowledge Graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/knowledge/query
 * Query the biostatistics knowledge graph.
 */
router.post('/knowledge/query', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { query, nodeTypes, maxDepth, limit } = req.body;

    const result = await biostatKnowledgeGraphService.queryGraph(query, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/knowledge/method-landscape/:indication
 * Get the method landscape for a specific indication.
 */
router.get('/knowledge/method-landscape/:indication', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const indication = req.params.indication;
    const { phase, agency } = req.query;

    const result = await biostatKnowledgeGraphService.getMethodLandscape(indication, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/knowledge/endpoint-method-matrix
 * Get the endpoint-method compatibility matrix.
 */
router.get('/knowledge/endpoint-method-matrix', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { indication, phase } = req.query;

    const filters = {
      indication: indication as string | undefined,
      phase: phase as string | undefined,
    };
    const result = await biostatKnowledgeGraphService.getEndpointMethodMatrix(orgId, filters);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/knowledge/ingest-csr
 * Ingest a CSR to extract and enrich the knowledge graph.
 */
router.post('/knowledge/ingest-csr', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    const { csrId, sections, metadata } = req.body;

    const result = await biostatKnowledgeGraphService.ingestFromCSR(csrId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/knowledge/trend/:concept
 * Get trend analysis for a concept in the knowledge graph over time.
 */
router.get('/knowledge/trend/:concept', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const concept = req.params.concept;
    const { startYear, endYear, granularity } = req.query;

    const result = await biostatKnowledgeGraphService.getMethodTrend(concept, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
