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
import { statisticalDefensibilityService } from '../services/statistical-defensibility-service';

const router = Router();

// ── Full Defensibility Assessment ────────────────────────────

/**
 * POST /api/statistical-defensibility/assess
 * Run a comprehensive 7-dimension defensibility assessment
 */
router.post('/assess', async (req: Request, res: Response) => {
  try {
    const {
      studyPhase, indication, studyDesign, primaryEndpoint,
      secondaryEndpoints, sampleSize, powerAssumptions,
      statisticalMethods, multiplicityMethod, missingDataMethod,
      interimAnalysis, adaptiveDesign, subgroupAnalyses, estimandStrategy,
    } = req.body;

    if (!studyPhase || !indication || !studyDesign || !primaryEndpoint) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: studyPhase, indication, studyDesign, primaryEndpoint',
      });
    }

    const report = await statisticalDefensibilityService.assessDefensibility({
      studyPhase,
      indication,
      studyDesign,
      primaryEndpoint,
      secondaryEndpoints: secondaryEndpoints || [],
      sampleSize: sampleSize || 0,
      powerAssumptions,
      statisticalMethods: statisticalMethods || [],
      multiplicityMethod,
      missingDataMethod,
      interimAnalysis,
      adaptiveDesign,
      subgroupAnalyses,
      estimandStrategy,
    });

    res.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Defensibility assessment error:', error);
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Reviewer Risk Annotations ────────────────────────────────

/**
 * POST /api/statistical-defensibility/reviewer-risks
 * Generate predicted reviewer questions/objections with suggested responses
 */
router.post('/reviewer-risks', async (req: Request, res: Response) => {
  try {
    const {
      phase, indication, design, endpoints, sampleSize,
      statisticalMethods, multiplicityApproach, missingDataApproach,
      hasInterimAnalysis, subgroupAnalyses,
    } = req.body;

    if (!phase || !indication || !design) {
      return res.status(400).json({
        success: false,
        error: 'Required fields: phase, indication, design',
      });
    }

    const annotations = await statisticalDefensibilityService.generateReviewerRiskAnnotations({
      phase,
      indication,
      design,
      endpoints: endpoints || [],
      sampleSize: sampleSize || 0,
      statisticalMethods: statisticalMethods || [],
      multiplicityApproach,
      missingDataApproach,
      hasInterimAnalysis: hasInterimAnalysis || false,
      subgroupAnalyses: subgroupAnalyses || [],
    });

    res.json({
      success: true,
      data: { annotations },
      count: annotations.length,
    });
  } catch (error: any) {
    console.error('Reviewer risk annotations error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
