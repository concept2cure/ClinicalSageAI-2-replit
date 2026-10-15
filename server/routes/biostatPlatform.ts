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

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { adaptiveTrialOperationsService } from '../services/adaptive-trial-operations-service';
import biostatKnowledgeGraphService from '../services/biostat-knowledge-graph-service';
import statisticalContinuumService from '../services/statistical-continuum-service';
import { SapInputRefusal } from '../services/sap-generator-service';
import { regulatoryOutcomeOptimizerService } from '../services/regulatory-outcome-optimizer-service';
import { estimandEngineService } from '../services/estimand-engine-service';
import { CollaborativeSapService } from '../services/collaborative-sap-service';
import { ExternalControlArmService, type SynthesisMethod } from '../services/external-control-arm-service';
import biostatDesignStatsRouter from './biostat-design-stats';
import {
  runJudgmentPipeline,
  runPipelineAndGenerateArtifact,
  runPipelineForRole,
} from '../services/biostatistics-judgment';
import type { StudyDesignInput, StakeholderRole, StatisticalArtifactType } from '../services/biostatistics-judgment';
import { clientError, serverError } from '../lib/api-response';
import {
  AdaptiveDecisionRefusal,
  signAdaptiveDecision,
  signerIpAddress,
} from '../services/adaptive-decision-signature';
import { createScopedLogger } from '../utils/logger';

const collaborativeSapService = new CollaborativeSapService();
const externalControlArmService = new ExternalControlArmService();
const SYNTHESIS_METHODS: readonly SynthesisMethod[] = ['propensity_score', 'ipw', 'bayesian_borrowing', 'naive_pooling'];

const router = Router();

const logger = createScopedLogger('biostat-platform');

/**
 * The signed-in user's id, or null. resolveUserId answered 0 for a request
 * with none until 2026-10-15, so what it created — a synthetic control, a SAP
 * version, a comment — was recorded as user 0's.
 */
function signedInUserId(req: Request): number | null {
  const id = Number(req.user?.userId || req.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Every route here acts for a signed-in user; a request with none is answered 401. */
function requireSignedInUser(req: Request, res: Response, next: NextFunction): void {
  if (signedInUserId(req) == null) {
    clientError(res, 401, 'A signed-in user is required.');
    return;
  }
  next();
}

// All routes require authentication, and a user to act for
const authMiddleware = [authenticateToken, requireSignedInUser];

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
 * The signed-in user's ID. authMiddleware has already answered 401 for a
 * request without one; it is never 0.
 */
function resolveUserId(req: Request): number {
  const id = signedInUserId(req);
  if (id == null) throw new Error('No signed-in user on the request');
  return id;
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

    /* The sample size is the protocol's or absent. It was `sampleSize || 200`
       until 2026-10-15, so every thread opened without one carried 200 into
       the SAPs drafted from it; a SAP for such a thread is now refused by name. */
    const { sampleSize } = req.body ?? {};
    if (sampleSize != null && sampleSize !== '' && !(Number.isInteger(sampleSize) && sampleSize > 0)) {
      return clientError(res, 400, 'sampleSize must be a positive whole number of participants, or omitted.');
    }

    const result = await statisticalContinuumService.initializeThread(
      {
        title,
        indication,
        phase,
        primaryEndpoint: endpoints?.[0],
        sampleSize: Number.isInteger(sampleSize) ? sampleSize : undefined,
      },
      orgId,
      userId
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    return serverError(res, logger, 'initializing continuum', error);
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
    return serverError(res, logger, 'loading threads', error);
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
    return serverError(res, logger, 'loading continuum', error);
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
    // The thread's protocol lacks an input the SAP is built on: the caller's
    // answer, by name — not a 500, and not a SAP drafted around a default.
    if (error instanceof SapInputRefusal) {
      return clientError(res, 422, error.message, { fields: error.fields });
    }
    return serverError(res, logger, 'updating SAP', error);
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
    return serverError(res, logger, 'updating analysis specs', error);
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
    return serverError(res, logger, 'updating TLF shells', error);
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
    return serverError(res, logger, 'saving results', error);
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
    return serverError(res, logger, 'loading CSR sections', error);
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
    return serverError(res, logger, 'recommending design optimizer', error);
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
    return serverError(res, logger, 'loading regulatory precedents', error);
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
    return serverError(res, logger, 'saving sensitivity', error);
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
    const { population, treatment, endpoint, intercurrentEvents, summaryMeasure, strategy, threadId } = req.body;

    /* The summary measure and strategy are the sponsor's ICH E9(R1) choices. A
       missing one was filled with 'difference_in_means' / 'treatment_policy'
       until 2026-10-15 — before the engine's own completeness check, which
       then judged the estimand ichE9R1Compliant on attributes nobody chose.
       The endpoint is the variable (below), so it is required too. */
    const unstated = (['endpoint', 'summaryMeasure', 'strategy'] as const).filter(
      (k) => typeof req.body?.[k] !== 'string' || req.body[k].trim() === '',
    );
    if (unstated.length > 0) {
      return clientError(res, 400, `Required to define an estimand: ${unstated.join(', ')}.`, { fields: unstated });
    }
    /* The ICH E9(R1) variable IS the endpoint. `treatment` — the treatment
       condition, another attribute — was stored as the variable until
       2026-10-15. An estimand here has no treatment attribute to record it
       in, so a stated one is refused rather than stored as something else. */
    if (treatment != null && treatment !== '') {
      return clientError(res, 400, 'treatment is not recorded: this estimand has no treatment-condition attribute, and the variable is the endpoint.', { fields: ['treatment'] });
    }

    const result = await estimandEngineService.defineEstimand({
      threadId,
      endpointName: endpoint,
      population,
      variable: endpoint,
      summaryMeasure,
      intercurrentEvents: intercurrentEvents || [],
      strategy,
    }, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return serverError(res, logger, 'saving define', error);
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
    return serverError(res, logger, 'saving methods', error);
  }
});

/**
 * POST /api/biostat/multiplicity/design
 * Design a multiplicity adjustment strategy. Defaults (method 'graphical',
 * alpha 0.025) are visible in the response's `approach` and `overallAlpha`.
 * `alphaAllocation` is each hypothesis's initial level; for holm and hochberg
 * that is alpha/m, and their thresholds for the ordered p-values are in
 * `rankThresholds`, by rank, never by hypothesis. An input the engine refuses
 * (TypeError / RangeError naming it) is a 400, not a 500, and so is a top-level
 * `weights` or `familyStructure`, which the designer does not read — until
 * 2026-09-28 both were accepted and silently ignored.
 */
router.post('/multiplicity/design', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { hypotheses, method, alpha } = req.body;
    const unread = (['weights', 'familyStructure'] as const).filter((k) => req.body[k] !== undefined);
    if (unread.length) {
      return res.status(400).json({
        success: false,
        error: `${unread.join(' and ')} ${unread.length > 1 ? 'are' : 'is'} not read by the multiplicity designer; ` +
          `give a hypothesis's weight as hypotheses[i].weight (read by the fallback approach only)`,
      });
    }

    const result = await estimandEngineService.designMultiplicityStrategy({
      threadId: req.body.threadId,
      hypotheses,
      overallAlpha: alpha ?? 0.025,
      approach: method || 'graphical',
    }, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    return serverError(res, logger, 'saving design', error);
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
    return serverError(res, logger, 'loading regulatory examples', error);
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
    return serverError(res, logger, 'validating estimand', error);
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
    return serverError(res, logger, 'saving create', error);
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
    return serverError(res, logger, 'updating section', error);
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
    return serverError(res, logger, 'saving comment', error);
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
    return serverError(res, logger, 'resolving the SAP comment', error);
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
    return serverError(res, logger, 'saving amendment', error);
  }
});

/*
 * POST /api/biostat/sap/:sapVersionId/sign is not served. It stamped a SAP
 * version approved with a signature taken from the request body, verifying no
 * signer. Nothing called it. Removed 2026-10-08 (P-25 follow-up), with
 * CollaborativeSapService.signVersion; a signature goes through the platform's
 * one ceremony (services/part11/reverify-signer.ts).
 */

/**
 * POST /api/biostat/sap/:sapVersionId/lock
 * Lock a SAP version (finalize / make read-only).
 */
router.post('/sap/:sapVersionId/lock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);
    /* A non-numeric id used to reach the service as NaN and surface as a 500
       from Postgres (`id = NaN`). `userId` is resolved and not passed: the
       service records no locker, which is noted beside the route. */
    void userId;
    const sapVersionId = Number(req.params.sapVersionId);
    if (!Number.isInteger(sapVersionId) || sapVersionId <= 0) {
      return clientError(res, 400, 'A SAP version id must be a positive integer.');
    }

    const result = await collaborativeSapService.lockVersion(sapVersionId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return serverError(res, logger, 'locking SAP', error);
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
    return serverError(res, logger, 'loading audit trail', error);
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
    return serverError(res, logger, 'loading version', error);
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
    return serverError(res, logger, 'loading versions', error);
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
    return serverError(res, logger, 'searching external control', error);
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

    /* Each is the sponsor's to state. A missing method was built as
       'propensity_score', and a missing indication or endpoint stored as '',
       until 2026-10-15; an unknown method reached the service as a 500. */
    const stated = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
    const inputs: Array<[string, boolean]> = [
      ['method', SYNTHESIS_METHODS.some((m) => m === method)],
      ['indication', stated(req.body.indication)],
      ['endpoint', stated(req.body.endpoint)],
      ['sourceIds', Array.isArray(sourceIds) && sourceIds.length > 0],
    ];
    const unstated = inputs.filter(([, ok]) => !ok).map(([field]) => field);
    if (unstated.length > 0) {
      return clientError(res, 400, `Required to synthesize an external control: ${unstated.join(', ')} (method is one of ${SYNTHESIS_METHODS.join(', ')}).`, { fields: unstated });
    }
    /* matchingVariables is the request's name for the service's covariates.
       It was destructured and dropped until 2026-10-15. */
    if (matchingVariables != null && !(Array.isArray(matchingVariables) && matchingVariables.every(stated))) {
      return clientError(res, 400, 'matchingVariables must be a list of covariate names, or omitted.', { fields: ['matchingVariables'] });
    }

    const result = await externalControlArmService.synthesizeControl(
      {
        name: req.body.name || `${req.body.indication} Control`,
        indication: req.body.indication,
        endpoint: req.body.endpoint,
        method,
        sourceArmIds: sourceIds,
        covariates: matchingVariables ?? undefined,
      },
      orgId,
      userId
    );
    res.json({ success: true, data: result });
  } catch (error: any) {
    return serverError(res, logger, 'synthesising external control', error);
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
    return serverError(res, logger, 'validating external control', error);
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
    return serverError(res, logger, 'loading regulatory package', error);
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
    return serverError(res, logger, 'saving ingest arm', error);
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
    return serverError(res, logger, 'loading external control', error);
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
    return serverError(res, logger, 'planning adaptive', error);
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
    return serverError(res, logger, 'saving interim snapshot', error);
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
    return serverError(res, logger, 'evaluating adaptive', error);
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
    return serverError(res, logger, 'saving ssr', error);
  }
});

/**
 * POST /api/biostat/adaptive/:planId/decision
 * Record an adaptation decision.
 */
/**
 * POST /api/biostat/adaptive/:planId/decision
 *
 * Sign an interim decision. A GOVERNED, SIGNED act since 2026-10-13: it runs
 * the platform's one ceremony (services/adaptive-decision-signature.ts →
 * part11/governed-signature-ceremony.ts), which re-authenticates the signer,
 * checks their signing authority and separation of duties, writes the decision
 * on its own transaction, and records the ledger pair and the
 * electronic_signatures manifest bound to the interim look's data.
 *
 * Until then it was a Drizzle insert that set `approved_by` from the session's
 * user id and `approved_at` from the wall clock, verifying nothing — the defect
 * POST /api/biostat/sap/:id/sign was removed for on 2026-10-08. An interim
 * decision stops a trial, resizes it, drops an arm or enriches a population,
 * on unblinded data; a regulator asks who decided and on what.
 *
 * Body: { snapshotId, adaptationType, decision, rationale, meaning,
 *         reauth: { password, totp? }, parameters? }
 */
router.post('/adaptive/:planId/decision', authMiddleware, async (req: Request, res: Response) => {
  const orgId = resolveOrganizationId(req);
  const userId = resolveUserId(req);
  const planId = Number(req.params.planId);
  if (!Number.isInteger(planId) || planId <= 0) {
    return clientError(res, 400, 'An adaptive plan id must be a positive integer.');
  }
  const snapshotId = Number(req.body?.snapshotId);
  if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
    return clientError(res, 400, 'A decision is taken on an interim look: snapshotId must be a positive integer.');
  }

  try {
    const signed = await signAdaptiveDecision({
      orgId,
      userId,
      /* The SNAPSHOT is the target: an IDMC approves a decision about a
         specific look, so that look's data is what the signature binds. */
      target: `interim-snapshot:${snapshotId}`,
      reason: typeof req.body?.rationale === 'string' ? req.body.rationale : '',
      meaning: req.body?.meaning,
      reauth: req.body?.reauth,
      ipAddress: signerIpAddress(req),
      // The role as the canonical ceremony call sites read it; the gate
      // itself re-reads it from the membership row, never from this.
      role: String((req as any).userRole ?? (req as any).user?.role ?? ''),
      write: (client) =>
        adaptiveTrialOperationsService.writeDecisionOnSignedTransaction(
          client,
          {
            planId,
            snapshotId,
            adaptationType: req.body?.adaptationType,
            decision: req.body?.decision,
            rationale: req.body?.rationale,
            parameters: req.body?.parameters,
          },
          orgId,
          userId,
        ),
    });
    return res.json({ success: true, data: signed });
  } catch (error: any) {
    /* The ceremony's refusals are the signer's own answer — "re-enter your
       password", "you cannot sign your own work", "your role may not sign" —
       and must reach them verbatim rather than as a 500. */
    if (error instanceof AdaptiveDecisionRefusal) {
      return clientError(res, error.status as 400, error.code, { message: error.message });
    }
    return serverError(res, logger, 'signing the interim decision', error);
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
    return serverError(res, logger, 'loading idmc report', error);
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
    return serverError(res, logger, 'loading adaptive', error);
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
    return serverError(res, logger, 'loading operating characteristics', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Design-statistics routes (extracted to biostat-design-stats.ts)
// ═══════════════════════════════════════════════════════════════════════════════
router.use(biostatDesignStatsRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// CAPABILITY 7: Biostatistics Knowledge Graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A knowledge-graph refusal is the caller's own answer, not a fault.
 *
 * `queryGraph` refuses an empty question with a `ComputationRefusal`, which
 * `serverError` would have logged and returned as a 500 — telling the sponsor
 * the server broke when the server declined. 422 carries the sentence and the
 * field, matching the mapper the AnA biostatistics routes use.
 */
function knowledgeError(res: Response, where: string, error: unknown): Response {
  const e = error as { name?: unknown; code?: unknown; field?: unknown; message?: unknown };
  if (e?.name === 'ComputationRefusal') {
    return clientError(res, 422, String(e.message), {
      refusal: true,
      code: typeof e.code === 'string' ? e.code : 'missing_input',
      ...(typeof e.field === 'string' ? { field: e.field } : {}),
    });
  }
  return serverError(res, logger, where, error);
}

/**
 * POST /api/biostat/knowledge/query
 * Query the biostatistics knowledge graph.
 */
router.post('/knowledge/query', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    /* `nodeTypes`, `maxDepth` and `limit` were destructured here and passed to
       nothing — queryGraph takes a question and an org. A request that set them
       was answered as though they had been honoured. They are not read now, so
       the route no longer advertises filters it drops (2026-10-13). */
    const { query } = req.body ?? {};

    const result = await biostatKnowledgeGraphService.queryGraph(String(query ?? ''), orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return knowledgeError(res, 'querying knowledge', error);
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
    /* `phase` and `agency` were destructured from the query string and passed
       to nothing: getMethodLandscape aggregates across both. A UI that offered
       either filter would silently not filter, so neither is read (2026-10-13).
       Adding them means adding them to the service first. */

    const result = await biostatKnowledgeGraphService.getMethodLandscape(indication, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return knowledgeError(res, 'loading method landscape', error);
  }
});

/**
 * GET /api/biostat/knowledge/endpoint-method-matrix
 * Get the endpoint-method compatibility matrix.
 */
router.get('/knowledge/endpoint-method-matrix', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const { indication, phase, agency } = req.query;

    /* `agency` is passed through from 2026-10-13. The service has filtered on
       it since it was written; this route read it off the query string and
       dropped it, so an agency-scoped matrix silently spanned every agency. */
    const filters = {
      indication: typeof indication === 'string' && indication.trim() ? indication.trim() : undefined,
      phase: typeof phase === 'string' && phase.trim() ? phase.trim() : undefined,
      agency: typeof agency === 'string' && agency.trim() ? agency.trim() : undefined,
    };
    const result = await biostatKnowledgeGraphService.getEndpointMethodMatrix(orgId, filters);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return knowledgeError(res, 'loading endpoint method matrix', error);
  }
});

/**
 * POST /api/biostat/knowledge/ingest-csr
 * Ingest a CSR to extract and enrich the knowledge graph.
 */
router.post('/knowledge/ingest-csr', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    /* `sections` and `metadata` were destructured and passed to nothing:
       ingestFromCSR reads the CSR and its details from the database, not from
       the request. A caller that sent either was answered as though it had
       been used. `userId` was resolved and unused (2026-10-13). */
    const csrId = Number((req.body ?? {}).csrId);
    if (!Number.isInteger(csrId) || csrId <= 0) {
      return clientError(res, 400, 'A CSR id must be a positive integer.');
    }

    const result = await biostatKnowledgeGraphService.ingestFromCSR(csrId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return knowledgeError(res, 'ingesting the CSR', error);
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
    /* `startYear`, `endYear` and `granularity` were destructured and passed to
       nothing: getMethodTrend aggregates every recorded year. Not read, so the
       route no longer advertises a window it ignores (2026-10-13). */

    const result = await biostatKnowledgeGraphService.getMethodTrend(concept, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    return knowledgeError(res, 'loading trend', error);
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
    return serverError(res, logger, 'analysing judgment', error);
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
    return serverError(res, logger, 'saving role interpretation', error);
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
    return serverError(res, logger, 'saving generate artifact', error);
  }
});

export default router;
