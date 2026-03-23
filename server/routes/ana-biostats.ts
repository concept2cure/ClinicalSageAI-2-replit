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
import { computationEngine } from '../services/ana-biostats/computation-engine';
import { judgmentEngine } from '../services/ana-biostats/judgment-engine';
import { domainAdapter } from '../services/ana-biostats/domain-adapter';
import { regulatoryCustomizer } from '../services/ana-biostats/regulatory-customizer';
import { documentGenerator } from '../services/ana-biostats/document-generator';

const router = Router();

function resolveOrganizationId(req: Request): number {
  const orgId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantContext?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
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

    const { workflowType, input, generateDocument, documentType, autoAttachToDossier, reviewRequired } = req.body;

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
    });

    return res.json(result);
  } catch (error: any) {
    console.error('[AnA Biostats] Workflow error:', error);
    return res.status(500).json({ error: error.message || 'Workflow execution failed' });
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
    console.error('[AnA Biostats] Compute error:', error);
    return res.status(500).json({ error: error.message || 'Computation failed' });
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
    console.error('[AnA Biostats] Compare error:', error);
    return res.status(500).json({ error: error.message || 'Scenario comparison failed' });
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
    console.error('[AnA Biostats] Validation error:', error);
    return res.status(500).json({ error: error.message || 'Validation failed' });
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
    console.error('[AnA Biostats] Document generation error:', error);
    return res.status(500).json({ error: error.message || 'Document generation failed' });
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
    console.error('[AnA Biostats] Judgment error:', error);
    return res.status(500).json({ error: error.message || 'Judgment failed' });
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
    console.error('[AnA Biostats] Enhanced compute error:', error);
    return res.status(500).json({ error: error.message || 'Enhanced computation failed' });
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
    console.error('[AnA Biostats] Multiplicity error:', error);
    return res.status(500).json({ error: error.message || 'Multiplicity computation failed' });
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
    console.error('[AnA Biostats] Missing data impact error:', error);
    return res.status(500).json({ error: error.message || 'Missing data impact computation failed' });
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
