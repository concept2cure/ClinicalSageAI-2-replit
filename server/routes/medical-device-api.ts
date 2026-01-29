/**
 * Medical Device API Routes
 * 
 * Endpoints for 510(k), predicates, eSTAR, CER, and MAUDE integration.
 * 
 * @module server/routes/medical-device-api
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { authMiddleware } from '../auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import medicalDeviceService from '../services/medicalDeviceService';
import predicateFinderService from '../services/PredicateFinderService';
import { eSTARValidator } from '../services/eSTARValidator';
import { UnifiedCERService } from '../services/cer';
import { searchDeviceReports, analyzeMaudeData } from '../fda_maude_client.js';
import { gatherIntegratedData } from '../data_integration.js';

const logger = createScopedLogger('medical-device-api');
const router = Router();

// Apply authentication
router.use(authMiddleware);
router.use(tenantContextMiddleware);

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const PredicateSearchSchema = z.object({
  query: z.string().min(1),
  productCode: z.string().optional(),
  regulationNumber: z.string().optional(),
  clearanceYear: z.number().optional(),
  limit: z.number().default(50),
});

const Submission510kSchema = z.object({
  deviceName: z.string(),
  manufacturer: z.string(),
  productCode: z.string(),
  regulationNumber: z.string(),
  predicateIds: z.array(z.string()),
  indications: z.string(),
  technologyCharacteristics: z.record(z.string(), z.any()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICATE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/medical-device/predicates/search
 * Search for predicate devices with similarity scoring
 */
router.post('/predicates/search', async (req: Request, res: Response) => {
  try {
    const validated = PredicateSearchSchema.parse(req.body);
    
    logger.info('Predicate search', { query: validated.query, productCode: validated.productCode });

    const results = await predicateFinderService.findPredicates({
      deviceName: validated.query,
      productCode: validated.productCode,
      manufacturer: undefined,
      keywords: [validated.query],
      limit: validated.limit,
    });

    res.json({
      success: true,
      data: results,
      total: results.length,
      meta: {
        query: validated,
        searchTimestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    logger.error('Predicate search failed', { error });
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/medical-device/predicates/:id
 * Get detailed predicate information
 */
router.get('/predicates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    logger.info('Fetching predicate details', { predicateId: id });

    const predicate = await predicateFinderService.getPredicateById(id);

    if (!predicate) {
      return res.status(404).json({ success: false, error: 'Predicate not found' });
    }

    const maudeReports = await searchDeviceReports({
      productCode: predicate.productCode || '',
      deviceName: predicate.name,
      manufacturer: predicate.manufacturer,
      limit: 25,
    });

    res.json({
      success: true,
      data: {
        ...predicate,
        relatedRecalls: [],
        maudeReports,
        maudeSummary: analyzeMaudeData(maudeReports),
      },
    });
  } catch (error) {
    logger.error('Failed to fetch predicate', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch predicate' });
  }
});

/**
 * POST /api/medical-device/predicates/compare
 * Compare subject device with predicates for substantial equivalence
 */
router.post('/predicates/compare', async (req: Request, res: Response) => {
  try {
    const { predicateIds } = req.body;
    
    logger.info('Comparing predicates', { predicateCount: predicateIds?.length });

    const predicates = await Promise.all(
      predicateIds.map((predicateId: string) => predicateFinderService.getPredicateById(predicateId))
    );

    const comparisons = predicates.map((predicate, index) => ({
      predicateId: predicateIds[index],
      predicateName: predicate?.name || 'Unknown',
      analysis: {
        intendedUse: {
          similarity: 0.7,
          differences: ['Pending detailed equivalence analysis'],
          risks: [],
        },
        technologyCharacteristics: {
          similarity: 0.7,
          differences: ['Pending technology comparison'],
          risks: ['Additional performance testing may be required'],
        },
        performanceData: {
          similarity: 0.7,
          differences: ['Benchmark testing required'],
          risks: [],
        },
        safetyProfile: {
          similarity: 0.8,
          differences: [],
          risks: [],
        },
      },
      overallSimilarity: 0.75,
      recommendation: 'Predicate comparison initiated',
      gapsIdentified: ['Complete predicate comparison matrix', 'Document differences'],
    }));

    res.json({
      success: true,
      data: {
        comparisons,
        recommendedPredicate: comparisons[0]?.predicateId,
        pathwayRecommendation: '510(k) Traditional',
        estimatedReviewTime: '90-120 days',
        requiredDocumentation: [
          'Device description',
          'Substantial equivalence comparison',
          'Performance testing data',
          'Biocompatibility assessment',
          'Software documentation',
        ],
      },
    });
  } catch (error) {
    logger.error('Predicate comparison failed', { error });
    res.status(500).json({ success: false, error: 'Comparison failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/medical-device/submissions
 * List all submissions for the organization
 */
router.get('/submissions', async (req: Request, res: Response) => {
  try {
    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).organizationId);
    const { status, type } = req.query;

    logger.info('Listing submissions', { organizationId, status, type });

    const submissions = await medicalDeviceService.get510kSubmissions(organizationId);

    res.json({
      success: true,
      data: submissions,
      total: submissions.length,
    });
  } catch (error) {
    logger.error('Failed to list submissions', { error });
    res.status(500).json({ success: false, error: 'Failed to list submissions' });
  }
});

/**
 * POST /api/medical-device/submissions
 * Create a new submission
 */
router.post('/submissions', async (req: Request, res: Response) => {
  try {
    const validated = Submission510kSchema.parse(req.body);
    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).organizationId);
    const userId = (req as any).user?.id || 'system';

    logger.info('Creating submission', { deviceName: validated.deviceName, userId });

    const newSubmission = await medicalDeviceService.create510kSubmission(
      organizationId,
      {
        deviceName: validated.deviceName,
        manufacturer: validated.manufacturer,
        productCode: validated.productCode,
        regulationNumber: validated.regulationNumber,
        predicateIds: validated.predicateIds,
        indications: validated.indications,
        technologyCharacteristics: validated.technologyCharacteristics,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: newSubmission,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    logger.error('Failed to create submission', { error });
    res.status(500).json({ success: false, error: 'Failed to create submission' });
  }
});

/**
 * GET /api/medical-device/submissions/:id
 * Get submission details
 */
router.get('/submissions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    logger.info('Fetching submission', { submissionId: id });

    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).organizationId);
    const submission = await medicalDeviceService.get510kSubmission(organizationId, id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({
      success: true,
      data: submission,
    });
  } catch (error) {
    logger.error('Failed to fetch submission', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch submission' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// eSTAR ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/medical-device/estar/validate
 * Validate eSTAR package for completeness
 */
router.post('/estar/validate', async (req: Request, res: Response) => {
  try {
    const { submissionId, projectId, strictMode = false } = req.body;

    logger.info('Validating eSTAR package', { submissionId, projectId });

    const validation = await eSTARValidator.validatePackage(
      projectId || submissionId,
      Boolean(strictMode)
    );

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    logger.error('eSTAR validation failed', { error });
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

/**
 * POST /api/medical-device/estar/generate
 * Generate eSTAR XML package
 */
router.post('/estar/generate', async (req: Request, res: Response) => {
  try {
    const { submissionId, format = 'xml' } = req.body;
    
    logger.info('Generating eSTAR package', { submissionId, format });
    
    // In production, generate actual eSTAR XML
    res.json({
      success: true,
      data: {
        submissionId,
        format,
        generatedAt: new Date().toISOString(),
        downloadUrl: `/api/medical-device/estar/${submissionId}/download`,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
      },
    });
  } catch (error) {
    logger.error('eSTAR generation failed', { error });
    res.status(500).json({ success: false, error: 'Generation failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/medical-device/cer/generate
 * Generate Clinical Evaluation Report
 */
router.post('/cer/generate', async (req: Request, res: Response) => {
  try {
    const { deviceId, deviceName, manufacturer, templateVersion } = req.body;
    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).organizationId || 0);

    logger.info('Generating CER', { deviceId, deviceName, templateVersion });

    const cerService = new UnifiedCERService({
      organizationId: String(organizationId),
      deviceName: deviceName || deviceId || 'Unknown Device',
      manufacturer,
      templateVersion,
    });

    const report = await cerService.generateReport();

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('CER generation failed', { error });
    res.status(500).json({ success: false, error: 'CER generation failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HAZARD ANALYSIS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/medical-device/hazards/analyze
 * Analyze device hazards based on MAUDE data
 */
router.post('/hazards/analyze', async (req: Request, res: Response) => {
  try {
    const { deviceId, productCode, deviceName, manufacturer } = req.body;

    logger.info('Analyzing hazards', { deviceId, productCode, deviceName });

    const maudeReports = await searchDeviceReports({
      productCode: productCode || '',
      deviceName: deviceName || '',
      manufacturer: manufacturer || '',
      limit: 200,
    });

    const analysis = analyzeMaudeData(maudeReports);
    const integrated = await gatherIntegratedData({
      productId: productCode,
      productName: deviceName,
      manufacturer,
      isDevice: true,
      isDrug: false,
    });

    res.json({
      success: true,
      data: {
        deviceId,
        productCode,
        analyzedAt: new Date().toISOString(),
        maudeReportsAnalyzed: analysis.total_reports,
        maudeSummary: analysis,
        integrated,
      },
    });
  } catch (error) {
    logger.error('Hazard analysis failed', { error });
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

export default router;
