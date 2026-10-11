/**
 * Statistical Defensibility Service — API Routes
 *
 * RESTful endpoints for evaluating clinical study statistical rigor:
 * - Full defensibility assessment (7-dimension scoring)
 * - Protocol/SAP/CSR consistency checking
 * - Endpoint quality assessment
 * - Sample size evaluation
 * - Multiplicity control assessment
 * - Reviewer risk annotation generation
 */

import { Router, Request, Response } from 'express';
import {
  statisticalDefensibilityService,
  type DefensibilityAssessment,
} from '../services/statistical-defensibility-service';
import { OperatingSystemIntegration } from '../services/operating-system-integration';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('statistical-defensibility');

/** The 422 for a design the engine could not judge: the missing inputs, by name. */
function needsParameters(res: Response, assessment: DefensibilityAssessment) {
  const fields =
    assessment.status === 'needs_parameters'
      ? (assessment.errors as Array<{ field?: string }>).map((e) => e?.field).filter(Boolean)
      : [];
  const message =
    assessment.status === 'needs_parameters' ? assessment.message : 'The design could not be assessed.';
  return res.status(422).json({
    success: false,
    code: 'NEEDS_PARAMETERS',
    error: fields.length > 0 ? `${message} Missing or invalid: ${fields.join(', ')}.` : message,
    data: assessment,
  });
}

// ── Full Defensibility Assessment ────────────────────────────

/**
 * POST /api/statistical-defensibility/assess
 * Defensibility of a study design, judged by the deterministic engine. The
 * body is the engine's input (endpointType, effectSize, alpha, powerTarget,
 * attritionRate, …), read as AnA's biostatistics tools read theirs. A design
 * the engine cannot assess answers 422 with the missing inputs, never a
 * verdict (CLAUDE.md Rule 2; until 2026-10-05 a model scored it).
 */
router.post('/assess', async (req: Request, res: Response) => {
  try {
    const assessment = await statisticalDefensibilityService.assessDefensibility(req.body ?? {});
    if (assessment.status !== 'assessed') return needsParameters(res, assessment);

    let decisionRecord;
    const orgId = (req as any).organizationId ?? (req as any).user?.organizationId;
    const projectId = req.body.projectId;
    if (orgId && projectId) {
      const dims = assessment.judgment.dimensions;
      try {
        decisionRecord = await OperatingSystemIntegration.getInstance().captureFromDefensibilityAssessment({
          organizationId: orgId,
          projectId,
          overallVerdict: assessment.judgment.overallVerdict,
          overallRisk: assessment.judgment.overallRisk,
          actionRecommendation: assessment.judgment.actionRecommendation,
          inadequateDimensions: dims.filter((d) => d.verdict === 'inadequate').map((d) => d.name),
          marginalDimensions: dims.filter((d) => d.verdict === 'marginal').map((d) => d.name),
          escalationReasons: assessment.judgment.escalationReasons,
          relatedArtifactId: req.body.relatedArtifactId,
          regulatorBody: req.body.regulatorBody,
          jurisdiction: req.body.jurisdiction,
          createdById: (req as any).user?.id,
        });
      } catch (err) {
        console.warn('Operating system decision capture failed (non-fatal):', err);
      }
    }

    res.json({ success: true, data: assessment, decisionRecord });
  } catch (error: any) {
    console.error('Defensibility assessment error:', error);
    return serverError(res, logger, 'assessing', error);
  }
});

// ── Consistency Check ────────────────────────────────────────

/**
 * POST /api/statistical-defensibility/consistency
 * Check consistency between Protocol, SAP, and optionally CSR
 */
router.post('/consistency', async (req: Request, res: Response) => {
  try {
    const { protocolData, sapData, csrData } = req.body;

    if (!protocolData || !sapData) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: protocolData, sapData',
      });
    }

    const report = await statisticalDefensibilityService.checkConsistency(
      protocolData,
      sapData,
      csrData || undefined,
    );

    res.json({
      success: true,
      data: report,
      discrepancyCount: report.discrepancies.length,
    });
  } catch (error: any) {
    console.error('Consistency check error:', error);
    return serverError(res, logger, 'saving consistency', error);
  }
});

// ── Endpoint Quality ─────────────────────────────────────────

/**
 * POST /api/statistical-defensibility/endpoint-quality
 * Assess the quality and regulatory defensibility of study endpoints
 */
router.post('/endpoint-quality', async (req: Request, res: Response) => {
  try {
    const { endpoints } = req.body;

    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Required field: endpoints (non-empty array)',
      });
    }

    const result = await statisticalDefensibilityService.assessEndpointQuality(endpoints);

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Endpoint quality error:', error);
    return serverError(res, logger, 'saving endpoint quality', error);
  }
});

// ── Sample Size Evaluation ───────────────────────────────────

/**
 * POST /api/statistical-defensibility/sample-size
 * Evaluate sample size justification
 */
router.post('/sample-size', async (req: Request, res: Response) => {
  try {
    const {
      indication, phase, endpointType, plannedSampleSize,
      effectSize, alpha, power, dropoutRate,
    } = req.body;

    if (!indication || !phase || !plannedSampleSize) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: indication, phase, plannedSampleSize',
      });
    }

    const result = await statisticalDefensibilityService.evaluateSampleSize({
      indication,
      phase,
      endpointType: endpointType || 'continuous',
      plannedSampleSize,
      effectSize: effectSize || 0.5,
      alpha: alpha || 0.05,
      power: power || 0.8,
      dropoutRate: dropoutRate || 0.15,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Sample size evaluation error:', error);
    return serverError(res, logger, 'saving sample size', error);
  }
});

// ── Multiplicity Control ─────────────────────────────────────

/**
 * POST /api/statistical-defensibility/multiplicity
 * Assess multiplicity control for study endpoints
 */
router.post('/multiplicity', async (req: Request, res: Response) => {
  try {
    const { endpoints, multiplicityMethod } = req.body;

    if (!Array.isArray(endpoints)) {
      return res.status(400).json({
        success: false,
        error: 'Required field: endpoints (array)',
      });
    }

    const result = await statisticalDefensibilityService.assessMultiplicityControl(
      endpoints,
      multiplicityMethod || null,
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Multiplicity assessment error:', error);
    return serverError(res, logger, 'saving multiplicity', error);
  }
});

// ── Reviewer Risk Annotations ────────────────────────────────

/**
 * POST /api/statistical-defensibility/reviewer-risks
 * The points a statistical reviewer is likely to raise, derived from the
 * deterministic judgment of the design (same body as /assess). Until
 * 2026-10-05 a model predicted them and assigned their severity.
 */
router.post('/reviewer-risks', async (req: Request, res: Response) => {
  try {
    const { assessment, annotations } = await statisticalDefensibilityService.generateReviewerRiskAnnotations(
      req.body ?? {},
    );
    if (assessment.status !== 'assessed') return needsParameters(res, assessment);
    res.json({ success: true, data: { annotations, judgment: assessment.judgment }, count: annotations.length });
  } catch (error: any) {
    console.error('Reviewer risk annotations error:', error);
    return serverError(res, logger, 'saving reviewer risks', error);
  }
});

export default router;
