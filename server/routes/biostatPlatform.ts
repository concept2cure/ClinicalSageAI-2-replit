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
import {
  solveSpendingBoundaries,
  operatingCharacteristics,
  assurance as computeAssurance,
  discretizeNormalPrior,
  type GroupSequentialBoundaries,
  type SpendingFunction,
} from '../services/stats/group-sequential-oc';
import {
  assuranceTwoSampleMeans,
  assuranceMonteCarloTwoSampleMeans,
} from '../services/stats/assurance';
import {
  testMultiplicity,
  type MultiplicityProcedure,
} from '../services/stats/multiplicity';
import {
  sizeSingleProportion,
  sizeCoPrimarySensSpec,
} from '../services/stats/diagnostic-design';
import {
  covariateBalance,
  powerPriorBorrow,
  commensurateBorrow,
  treatmentEffect,
  tippingPointBias,
  renderExternalControlMemo,
  type CovariateInput,
} from '../services/stats/external-control';
import {
  evaluateRegionRules,
  listRegionRules,
  type Agency,
  type RegionDesignInput,
} from '../services/region-design-rules';
import {
  runJudgmentPipeline,
  runPipelineAndGenerateArtifact,
  runPipelineForRole,
} from '../services/biostatistics-judgment';
import type { StudyDesignInput, StakeholderRole, StatisticalArtifactType } from '../services/biostatistics-judgment';

const collaborativeSapService = new CollaborativeSapService();
const externalControlArmService = new ExternalControlArmService();

const router = Router();

// All routes require authentication
const authMiddleware = authenticateToken;

/**
 * Helper to resolve the organization ID from the authenticated request.
 */
function resolveOrganizationId(req: Request): number {
  const orgId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantContext?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
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
      { title, indication, phase, primaryEndpoint: endpoints?.[0], sampleSize: req.body.sampleSize || 200 },
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
      { indication, phase, endpoint: endpoints?.[0] },
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
    const indication = String(req.params.indication);
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
    const indication = String(req.params.indication);
    const { agency, phase } = req.query;

    const VALID_STRATEGIES = [
      'treatment_policy',
      'hypothetical',
      'composite',
      'principal_stratum',
      'while_on_treatment',
    ] as const;
    const rawStrategy = req.query.strategy;
    const strategy =
      typeof rawStrategy === 'string' &&
      (VALID_STRATEGIES as readonly string[]).includes(rawStrategy)
        ? (rawStrategy as (typeof VALID_STRATEGIES)[number])
        : undefined;
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
    const sectionId = String(req.params.sectionId);
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

/**
 * POST /api/biostat/adaptive/oc-exact
 * Compute exact group-sequential operating characteristics by recursive
 * numerical integration (deterministic; no Monte Carlo). Either supply explicit
 * z-scale boundaries, or supply { alpha, spendingFunction } and the efficacy
 * boundaries are solved exactly from the alpha-spending function. Returns the OC
 * table over the requested drift grid, the type I error, optional assurance over
 * a normal prior on the drift, and a provenance record.
 *
 * Body: {
 *   informationFractions: number[],          // strictly increasing, last = 1
 *   efficacyBoundaries?: number[],            // optional explicit z-boundaries
 *   futilityBoundaries?: (number|null)[],     // optional, binding
 *   alpha?: number,                           // one-sided, default 0.025
 *   spendingFunction?: 'obrien-fleming'|'pocock'|'linear',
 *   driftGrid?: number[],                     // default [0,1,2,3,4]
 *   prior?: { mean: number, sd: number, nNodes?: number },
 *   grid?: { step?: number, halfWidth?: number }
 * }
 */
router.post('/adaptive/oc-exact', authMiddleware, async (req: Request, res: Response) => {
  // Authenticated + tenant-scoped like its siblings, though the computation is
  // pure math and does not read tenant data.
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }

  try {
    const body = req.body ?? {};
    const informationFractions = body.informationFractions;
    if (!Array.isArray(informationFractions) || informationFractions.length === 0 ||
        !informationFractions.every((x: unknown) => typeof x === 'number' && Number.isFinite(x))) {
      return res.status(400).json({
        success: false,
        error: 'informationFractions must be a non-empty array of numbers (strictly increasing, last = 1).',
      });
    }

    const spendingFunction: SpendingFunction = ['obrien-fleming', 'pocock', 'linear'].includes(body.spendingFunction)
      ? body.spendingFunction
      : 'obrien-fleming';
    const alpha = typeof body.alpha === 'number' ? body.alpha : 0.025;

    const grid =
      body.grid && typeof body.grid === 'object'
        ? { step: body.grid.step, halfWidth: body.grid.halfWidth }
        : {};

    // Boundaries: explicit if supplied, otherwise solved from the spending function.
    let boundaries: GroupSequentialBoundaries;
    let solved: ReturnType<typeof solveSpendingBoundaries> | null = null;
    if (Array.isArray(body.efficacyBoundaries)) {
      boundaries = {
        informationFractions,
        efficacyBoundaries: body.efficacyBoundaries,
        futilityBoundaries: body.futilityBoundaries,
      };
    } else {
      solved = solveSpendingBoundaries(informationFractions, alpha, spendingFunction, grid);
      boundaries = {
        informationFractions,
        efficacyBoundaries: solved.efficacyBoundaries,
        futilityBoundaries: body.futilityBoundaries,
      };
    }

    const driftGrid: number[] =
      Array.isArray(body.driftGrid) && body.driftGrid.length > 0 &&
      body.driftGrid.every((x: unknown) => typeof x === 'number' && Number.isFinite(x))
        ? body.driftGrid
        : [0, 1, 2, 3, 4];

    const table = operatingCharacteristics(boundaries, driftGrid, grid);

    let assuranceResult = null;
    if (body.prior && typeof body.prior === 'object' &&
        typeof body.prior.mean === 'number' && typeof body.prior.sd === 'number') {
      const priorNodes = discretizeNormalPrior(
        body.prior.mean,
        body.prior.sd,
        typeof body.prior.nNodes === 'number' ? body.prior.nNodes : 25,
      );
      assuranceResult = computeAssurance(boundaries, priorNodes, grid);
    }

    res.json({
      success: true,
      data: {
        boundaries,
        spending: solved
          ? { spendingFunction, alpha, cumulativeAlpha: solved.cumulativeAlpha, incrementalAlpha: solved.incrementalAlpha }
          : null,
        characteristics: table.characteristics,
        typeIError: table.typeIError,
        assurance: assuranceResult,
        provenance: table.provenance,
      },
    });
  } catch (error: any) {
    // Engine validation errors (bad information fractions, etc.) are client errors.
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/assurance
 * Bayesian assurance (probability of success) for a two-sample means design:
 * the power averaged over a normal prior on the standardized effect. Optionally
 * cross-checks the deterministic quadrature against a seeded Monte Carlo run.
 *
 * Body: { priorMean, priorSd, nPerArm, alpha?, oneSided?, nNodes?,
 *         monteCarlo?: { nSim?, seed? } }
 */
router.post('/assurance', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (typeof b.priorMean !== 'number' || typeof b.priorSd !== 'number' || typeof b.nPerArm !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'priorMean, priorSd and nPerArm are required numbers.',
      });
    }
    const args = {
      priorMean: b.priorMean,
      priorSd: b.priorSd,
      nPerArm: b.nPerArm,
      alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
      oneSided: typeof b.oneSided === 'boolean' ? b.oneSided : undefined,
      nNodes: typeof b.nNodes === 'number' ? b.nNodes : undefined,
    };
    const result = assuranceTwoSampleMeans(args);

    let monteCarlo = null;
    if (b.monteCarlo) {
      monteCarlo = assuranceMonteCarloTwoSampleMeans({
        ...args,
        nSim: typeof b.monteCarlo.nSim === 'number' ? b.monteCarlo.nSim : undefined,
        seed: typeof b.monteCarlo.seed === 'number' ? b.monteCarlo.seed : undefined,
      });
    }

    res.json({ success: true, data: { ...result, monteCarlo } });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/multiplicity/test
 * Apply a multiple-testing procedure to observed p-values and return which
 * hypotheses are rejected while controlling the family-wise error rate. This is
 * the decision layer complementing /multiplicity/design (which allocates alpha).
 *
 * Body: { pValues: number[], alpha: number, procedure, ids?, weights?,
 *         transitionMatrix? }
 */
router.post('/multiplicity/test', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const validProcedures: MultiplicityProcedure[] = [
      'bonferroni', 'weighted-bonferroni', 'holm', 'hochberg', 'fixed-sequence', 'graphical',
    ];
    if (!Array.isArray(b.pValues) || typeof b.alpha !== 'number' ||
        !validProcedures.includes(b.procedure)) {
      return res.status(400).json({
        success: false,
        error: `pValues (array), alpha (number) and procedure (one of ${validProcedures.join(', ')}) are required.`,
      });
    }
    const result = testMultiplicity({
      pValues: b.pValues,
      alpha: b.alpha,
      procedure: b.procedure,
      ids: Array.isArray(b.ids) ? b.ids : undefined,
      weights: Array.isArray(b.weights) ? b.weights : undefined,
      transitionMatrix: Array.isArray(b.transitionMatrix) ? b.transitionMatrix : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/diagnostic/sizing
 * Sample-size for a diagnostic / IVD performance study. Either a single
 * performance goal (sensitivity OR specificity vs a goal), or co-primary
 * sensitivity AND specificity translated through prevalence into total
 * enrollment. Returns both the normal-approximation and exact binomial sizes.
 *
 * Body (single):    { mode: 'single', goal, expected, alpha?, power? }
 * Body (co-primary):{ mode: 'co-primary', sensitivityGoal, sensitivityExpected,
 *                     specificityGoal, specificityExpected, prevalence,
 *                     alpha?, power?, jointPowerTarget? }
 */
router.post('/diagnostic/sizing', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (b.mode === 'co-primary') {
      const required = [
        'sensitivityGoal', 'sensitivityExpected',
        'specificityGoal', 'specificityExpected', 'prevalence',
      ];
      if (required.some(k => typeof b[k] !== 'number')) {
        return res.status(400).json({
          success: false,
          error: `co-primary mode requires numbers: ${required.join(', ')}.`,
        });
      }
      const result = sizeCoPrimarySensSpec({
        sensitivityGoal: b.sensitivityGoal,
        sensitivityExpected: b.sensitivityExpected,
        specificityGoal: b.specificityGoal,
        specificityExpected: b.specificityExpected,
        prevalence: b.prevalence,
        alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
        power: typeof b.power === 'number' ? b.power : undefined,
        jointPowerTarget: typeof b.jointPowerTarget === 'number' ? b.jointPowerTarget : undefined,
      });
      return res.json({ success: true, data: result });
    }

    if (typeof b.goal !== 'number' || typeof b.expected !== 'number') {
      return res.status(400).json({
        success: false,
        error: "single mode requires numeric 'goal' and 'expected'.",
      });
    }
    const result = sizeSingleProportion({
      goal: b.goal,
      expected: b.expected,
      alpha: typeof b.alpha === 'number' ? b.alpha : undefined,
      power: typeof b.power === 'number' ? b.power : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/external-control/sensitivity
 * External-control rigor: borrow a historical control (power prior or
 * commensurate prior), estimate the treatment effect, run a bias tipping-point
 * sensitivity, optionally assess covariate balance, and render a regulatory
 * memo. Deterministic and reproducible.
 *
 * Body: { endpoint, meanT, seT, meanC, seC, nC, meanH, seH, nH,
 *         method: 'power-prior' | 'commensurate', a0?, tau2?, alpha?,
 *         covariates?: CovariateInput[] }
 */
router.post('/external-control/sensitivity', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    const numeric = ['meanT', 'seT', 'meanC', 'seC', 'nC', 'meanH', 'seH', 'nH'];
    if (numeric.some(k => typeof b[k] !== 'number') || typeof b.endpoint !== 'string') {
      return res.status(400).json({
        success: false,
        error: `endpoint (string) and numbers ${numeric.join(', ')} are required.`,
      });
    }
    const method = b.method === 'commensurate' ? 'commensurate' : 'power-prior';
    const alpha = typeof b.alpha === 'number' ? b.alpha : 0.05;
    const summary = { meanC: b.meanC, seC: b.seC, nC: b.nC, meanH: b.meanH, seH: b.seH, nH: b.nH };

    const a0 = typeof b.a0 === 'number' ? b.a0 : 1;
    const tau2 = typeof b.tau2 === 'number' ? b.tau2 : 0;
    const control = method === 'commensurate'
      ? commensurateBorrow({ ...summary, tau2 })
      : powerPriorBorrow({ ...summary, a0 });

    const effect = treatmentEffect(b.meanT, b.seT, control, alpha);
    // The bias tipping-point uses the power-prior path with the active a0.
    const tipping = tippingPointBias({ ...summary, meanT: b.meanT, seT: b.seT, a0, alpha });
    const balance = Array.isArray(b.covariates) && b.covariates.length > 0
      ? covariateBalance(b.covariates as CovariateInput[])
      : undefined;

    const memo = renderExternalControlMemo({
      endpoint: b.endpoint,
      borrowingMethod: method,
      borrowingParam: method === 'commensurate' ? tau2 : a0,
      control,
      effect,
      balance,
      tipping,
    });

    res.json({ success: true, data: { control, effect, tipping, balance, memo } });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/region-rules/evaluate
 * Evaluate a study design against region-specific design rules for the targeted
 * agencies (PMDA / MHRA / NMPA / Swissmedic / ANVISA / FDA / EMA): bridging and
 * ethnic sensitivity (ICH E5), MRCT consistency (ICH E17), local-subject data,
 * QT in the regional population, post-Brexit UK separation, Project Orbis
 * eligibility, FDA diversity plan. Returns structured findings + recommendations.
 *
 * Body: a RegionDesignInput (targetAgencies required).
 */
router.post('/region-rules/evaluate', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const b = req.body ?? {};
    if (!Array.isArray(b.targetAgencies) || b.targetAgencies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'targetAgencies (non-empty array) is required.',
      });
    }
    const result = evaluateRegionRules(b as RegionDesignInput);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/biostat/region-rules/catalog?agency=PMDA
 * Retrieve the region design-rule catalog with guidance citations, optionally
 * filtered to one agency.
 */
router.get('/region-rules/catalog', authMiddleware, async (req: Request, res: Response) => {
  try {
    resolveOrganizationId(req);
  } catch (error: any) {
    return res.status(401).json({ success: false, error: error.message });
  }
  try {
    const agency = req.query.agency as Agency | undefined;
    res.json({ success: true, data: listRegionRules(agency) });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
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
    const indication = String(req.params.indication);
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
    const concept = String(req.params.concept);
    const { startYear, endYear, granularity } = req.query;

    const result = await biostatKnowledgeGraphService.getMethodTrend(concept, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 8: Biostatistics Judgment Layer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/biostat/judgment/analyze
 * Run the full biostatistics judgment pipeline on a study design.
 *
 * Returns: power adequacy, assumption fragility, endpoint-method defensibility,
 * risk classification, tradeoff analysis, and role-aware interpretations.
 */
router.post('/judgment/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const input = req.body as StudyDesignInput;

    if (!input.projectId || !input.studyType || !input.endpointType || !input.statisticalMethod) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, studyType, endpointType, statisticalMethod',
      });
    }

    const report = runJudgmentPipeline(input);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/judgment/role-interpretation
 * Run the judgment pipeline and return interpretation for a specific role.
 *
 * Body: { ...StudyDesignInput, role: StakeholderRole }
 */
router.post('/judgment/role-interpretation', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, ...input } = req.body;
    const validRoles: StakeholderRole[] = ['ceo', 'ra_lead', 'clinical_lead', 'medical_writer', 'biostatistician'];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      });
    }

    const result = runPipelineForRole(input as StudyDesignInput, role as StakeholderRole);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/biostat/judgment/generate-artifact
 * Run the judgment pipeline and generate a governed statistical artifact.
 *
 * Body: { ...StudyDesignInput, artifactType: StatisticalArtifactType }
 */
router.post('/judgment/generate-artifact', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { artifactType, ...input } = req.body;
    const validTypes: StatisticalArtifactType[] = [
      'statistical_risk_memo',
      'design_assumption_note',
      'sample_size_rationale',
      'sap_section_draft',
      'scenario_comparison_brief',
    ];

    if (!validTypes.includes(artifactType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid artifactType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const userId = resolveUserId(req);
    const result = runPipelineAndGenerateArtifact(
      input as StudyDesignInput,
      artifactType as StatisticalArtifactType,
      `ana_biostatistics_user_${userId}`,
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
