/**
 * AnA Biostats — API Routes
 *
 * Exposes the full biostatistics operating function through REST endpoints.
 * All routes require authentication and resolve organization context.
 *
 * Route groups:
 * 1. /api/ana-biostats/workflow    — Full end-to-end workflows
 * 2. /api/ana-biostats/compute     — Quick deterministic computation
 * 3. /api/ana-biostats/compare     — Scenario comparison
 * 4. /api/ana-biostats/validate    — Input validation only
 * 5. /api/ana-biostats/document    — Document generation
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { anaBiostatsOrchestrator } from '../services/ana-biostats/orchestrator';
import { inputNormalizer } from '../services/ana-biostats/input-normalizer';
import { judgmentEngine } from '../services/ana-biostats/judgment-engine';
import { domainAdapter } from '../services/ana-biostats/domain-adapter';
import { regulatoryCustomizer } from '../services/ana-biostats/regulatory-customizer';
import { documentGenerator } from '../services/ana-biostats/document-generator';

import { createScopedLogger } from '../utils/logger.js';
import { clientError, orgRequired, serverError } from '../lib/api-response';

const logger = createScopedLogger('ana-biostats');

const router = Router();

/** Thrown by resolveOrganizationId, so the catch can answer 403 not 500. */
class OrganizationContextRequired extends Error {
  constructor() {
    super('Organization context required');
    this.name = 'OrganizationContextRequired';
  }
}

function resolveOrganizationId(req: Request): number {
  const orgId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantContext?.organizationId;
  if (!orgId) throw new OrganizationContextRequired();
  return orgId;
}

/**
 * The one place this router decides what a thrown error IS.
 *
 * Every handler here used to send every throw to `serverError`, so the two
 * states that are not server faults were reported as one:
 *
 *   • A `ComputationRefusal` — the engine declining to invent a figure it was
 *     not given the input for ("Diagnostic-accuracy sizing needs the expected
 *     sensitivity") — came back as **500 INTERNAL_ERROR, "Something went wrong
 *     while saving compute. The problem has been logged."** The engine's whole
 *     refusal contract (computation-engine.ts `ComputationRefusal`, 2026-10-05)
 *     was built so a caller could tell "I need one more input" from "the
 *     computation broke", and this router collapsed the distinction on every
 *     route. The AnA tool handlers had the same defect and were fixed on
 *     2026-10-11 (`AnaToolExecutor.biostatsRefusal`); the HTTP surface was not,
 *     so the browser could never show a refusal.
 *   • A missing tenant was a 500 rather than the 403 `orgRequired` exists for.
 *
 * A refusal answers **422** with the engine's own sentence as `error` (free
 * text, which `client/src/lib/queryClient.ts serverMessage` renders verbatim)
 * and the machine-readable parts under `details`, so a client can both show the
 * sentence and branch on the field.
 */
function biostatsError(res: Response, where: string, error: unknown): Response {
  const e = error as { name?: unknown; code?: unknown; field?: unknown; message?: unknown };
  if (e?.name === 'ComputationRefusal') {
    return clientError(res, 422, String(e.message), {
      refusal: true,
      code: typeof e.code === 'string' ? e.code : 'missing_input',
      ...(typeof e.field === 'string' ? { field: e.field } : {}),
    });
  }
  if (e?.name === 'OrganizationContextRequired') return orgRequired(res);
  return serverError(res, logger, where, error);
}

function resolveUserId(req: Request): number {
  const user = (req as any).user;
  return Number(user?.userId || user?.id || user?.sub || 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. FULL END-TO-END WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/workflow
 *
 * Execute a full biostatistics workflow:
 * input → computation → judgment → domain → regulatory → document → actions
 */
router.post('/workflow', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);

    const { workflowType, input, generateDocument, documentType, autoAttachToDossier, reviewRequired, dossierSectionId } = req.body;

    if (!workflowType || !input) {
      return res.status(400).json({
        error: 'Missing required fields: workflowType, input',
      });
    }

    const result = await anaBiostatsOrchestrator.executeWorkflow({
      workflowType,
      input,
      userId,
      organizationId: orgId,
      generateDocument: generateDocument ?? true,
      documentType: documentType ?? getDefaultDocType(workflowType),
      autoAttachToDossier,
      reviewRequired,
      // The dossier section the attach step maps into. This was accepted by the
      // integrator (workflow-integrator.ts::executeWorkflowActions) but never
      // read from the request, so `autoAttachToDossier` could not attach
      // anything over HTTP. A non-positive or non-integer value is dropped and
      // the attach step reports it honestly rather than mapping into section 0.
      dossierSectionId:
        Number.isInteger(Number(dossierSectionId)) && Number(dossierSectionId) > 0
          ? Number(dossierSectionId)
          : undefined,
    });

    return res.json(result);
  } catch (error: any) {
    logger.error('Workflow error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'running the workflow', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. QUICK COMPUTE (no document generation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/compute
 *
 * Quick computation without document generation.
 * Returns: validation, computation, judgment, domain adaptation, interpretation.
 */
router.post('/compute', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = anaBiostatsOrchestrator.quickCompute(req.body);
    return res.json(result);
  } catch (error: any) {
    logger.error('Compute error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'computing the design', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SCENARIO COMPARISON
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/compare
 *
 * Compare two statistical scenarios side-by-side.
 */
router.post('/compare', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);

    const { scenarioA, scenarioB } = req.body;

    if (!scenarioA || !scenarioB) {
      return res.status(400).json({ error: 'Both scenarioA and scenarioB are required' });
    }

    const result = await anaBiostatsOrchestrator.compareScenarios(
      scenarioA,
      scenarioB,
      { userId, organizationId: orgId }
    );

    return res.json(result);
  } catch (error: any) {
    logger.error('Compare error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'comparing the scenarios', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. INPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/validate
 *
 * Validate and normalize input without running computation.
 */
router.post('/validate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = inputNormalizer.normalize(req.body);
    return res.json(result);
  } catch (error: any) {
    logger.error('Validation error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'validating', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DOCUMENT GENERATION (standalone)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/document
 *
 * Generate a governed statistical document from pre-computed results.
 */
router.post('/document', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);

    const { documentType, input, computation, judgment, domainAdaptation, regulatoryCustomization, projectId } = req.body;

    if (!documentType || !input || !computation || !judgment || !domainAdaptation) {
      return res.status(400).json({
        error: 'Missing required fields: documentType, input, computation, judgment, domainAdaptation',
      });
    }

    const document = documentGenerator.generate(
      documentType,
      input,
      computation,
      judgment,
      domainAdaptation,
      regulatoryCustomization,
      { projectId: projectId ?? 0, organizationId: orgId, userId }
    );

    return res.json(document);
  } catch (error: any) {
    logger.error('Document generation error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'generating the document', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. JUDGMENT ONLY (from existing computation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/judge
 *
 * Run judgment engine on pre-computed results.
 */
router.post('/judge', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { input, computation } = req.body;

    if (!input || !computation) {
      return res.status(400).json({ error: 'Both input and computation are required' });
    }

    const judgment = judgmentEngine.judge(input, computation);
    const domain = domainAdapter.adapt(input, computation, judgment);
    const regulatory = input.regulatoryBody
      ? regulatoryCustomizer.customize(input, computation, judgment, domain)
      : undefined;

    return res.json({ judgment, domainAdaptation: domain, regulatoryCustomization: regulatory });
  } catch (error: any) {
    logger.error('Judgment error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'judging the design', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ENHANCED COMPUTE (with multiplicity, crossover, missing data)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/compute-enhanced
 *
 * Enhanced computation including multiplicity, crossover, agreement/kappa,
 * AUC comparison, and missing data impact analysis.
 */
router.post('/compute-enhanced', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { computationEngine } = await import('../services/ana-biostats/computation-engine');
    const { inputNormalizer } = await import('../services/ana-biostats/input-normalizer');

    const validation = inputNormalizer.normalize(req.body);
    if (!validation.valid) {
      return res.status(400).json(validation);
    }

    const result = computationEngine.computeEnhanced(validation.normalizedInput);
    return res.json({ validation, computation: result });
  } catch (error: any) {
    logger.error('Enhanced compute error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'computing the design', error);
  }
});

/**
 * POST /api/ana-biostats/multiplicity
 *
 * Standalone multiplicity adjustment computation.
 */
router.post('/multiplicity', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { computationEngine } = await import('../services/ana-biostats/computation-engine');
    const { inputNormalizer } = await import('../services/ana-biostats/input-normalizer');

    const validation = inputNormalizer.normalize(req.body);
    const result = computationEngine.computeMultiplicity(validation.normalizedInput);
    return res.json(result);
  } catch (error: any) {
    logger.error('Multiplicity error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'computing the multiplicity adjustment', error);
  }
});

/**
 * POST /api/ana-biostats/missing-data-impact
 *
 * Compute missing data impact on power and sample size.
 */
router.post('/missing-data-impact', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { computationEngine } = await import('../services/ana-biostats/computation-engine');
    const { inputNormalizer } = await import('../services/ana-biostats/input-normalizer');

    const { input, computation } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

    const validation = inputNormalizer.normalize(input);
    const base = computation ?? computationEngine.compute(validation.normalizedInput);
    const impact = computationEngine.computeMissingDataImpact(validation.normalizedInput, base);
    return res.json(impact);
  } catch (error: any) {
    logger.error('Missing data impact error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'computing the missing-data impact', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SME SPECIALIST ROUTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ana-biostats/sme-route
 *
 * Route a request to the most appropriate biostatistics SME specialist.
 * Returns routing result with primary/secondary SME and confidence.
 */
router.post('/sme-route', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { smeRouter } = await import('../services/ana-biostats/sme-router');
    const { inputNormalizer } = await import('../services/ana-biostats/input-normalizer');

    const { workflowType, input, documentType } = req.body;
    const orgId = resolveOrganizationId(req);
    const userId = resolveUserId(req);

    const validation = inputNormalizer.normalize(input ?? {});

    const routing = smeRouter.route({
      workflowType: workflowType ?? 'sample_size_rationale',
      input: validation.normalizedInput,
      userId,
      organizationId: orgId,
      documentType,
    });

    return res.json(routing);
  } catch (error: any) {
    logger.error('SME routing error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'routing to a specialist', error);
  }
});

/**
 * GET /api/ana-biostats/sme-agents
 *
 * List all available SME specialist agents.
 */
router.get('/sme-agents', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { ALL_SME_AGENTS } = await import('../services/ana-biostats/sme-agents');

    const agents = ALL_SME_AGENTS.map(sme => ({
      id: sme.id,
      name: sme.name,
      title: sme.title,
      scope: sme.scope,
      primaryDocuments: sme.outputPreferences.primaryDocuments,
      clientTracks: sme.triggerConditions.clientTracks,
    }));

    return res.json({ agents });
  } catch (error: any) {
    logger.error('SME agents list error', { err: error instanceof Error ? error.message : String(error) });
    return biostatsError(res, 'loading sme agents', error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Helper
// ═══════════════════════════════════════════════════════════════════════════════

function getDefaultDocType(workflowType: string): string {
  switch (workflowType) {
    case 'sample_size_rationale': return 'sample_size_rationale';
    case 'statistical_risk_review': return 'statistical_risk_memo';
    case 'scenario_comparison': return 'scenario_comparison_brief';
    case 'track_aware_drafting': return 'sap_section_draft';
    default: return 'sample_size_rationale';
  }
}

export default router;
