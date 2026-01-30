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

const PredicateAnalyzeSchema = z.object({
  subjectDevice: z.object({
    productName: z.string().optional(),
    intendedUse: z.string().optional(),
    productCode: z.string().optional(),
    regulationNumber: z.string().optional(),
    technology: z.string().optional(),
  }).passthrough(),
  predicateDevice: z.object({
    deviceName: z.string().optional(),
    intendedUse: z.string().optional(),
    productCode: z.string().optional(),
    regulationNumber: z.string().optional(),
    technologicalCharacteristics: z.array(z.string()).optional(),
    performanceData: z.array(z.string()).optional(),
  }).passthrough(),
});

const PredicateRecommendSchema = z.object({
  deviceProfile: z.object({
    productName: z.string().optional(),
    productCode: z.string().optional(),
    regulationNumber: z.string().optional(),
    intendedUse: z.string().optional(),
  }).passthrough(),
});

const SubmissionUpdateSchema = z.object({
  status: z.string().optional(),
  targetDate: z.string().optional(),
  deviceName: z.string().optional(),
  manufacturer: z.string().optional(),
  productCode: z.string().optional(),
  regulationNumber: z.string().optional(),
  predicateIds: z.array(z.string()).optional(),
  indications: z.string().optional(),
  technologyCharacteristics: z.record(z.string(), z.any()).optional(),
}).passthrough();

const computeSimilarityScore = (a?: string, b?: string): number => {
  if (!a || !b) return 0.5;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower === bLower) return 1;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8;
  return 0.6;
};

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

/**
 * POST /api/medical-device/predicates/analyze
 * Analyze substantial equivalence between subject and predicate
 */
router.post('/predicates/analyze', async (req: Request, res: Response) => {
  try {
    const validated = PredicateAnalyzeSchema.parse(req.body);
    const { subjectDevice, predicateDevice } = validated;

    const intendedUseScore = computeSimilarityScore(
      subjectDevice.intendedUse,
      predicateDevice.intendedUse
    );
    const technologyScore = computeSimilarityScore(
      subjectDevice.technology,
      predicateDevice.technologicalCharacteristics?.join(' ')
    );
    const performanceScore = 0.7;

    const overallScore = Number(
      ((intendedUseScore + technologyScore + performanceScore) / 3).toFixed(2)
    );

    res.json({
      success: true,
      data: {
        subjectDevice,
        predicateDevice,
        equivalenceAnalysis: {
          intendedUse: {
            equivalent: intendedUseScore >= 0.75,
            notes: 'Intended use comparison generated from submitted profiles.',
          },
          technologicalCharacteristics: {
            equivalent: technologyScore >= 0.7,
            notes: 'Technology comparison based on submitted characteristics.',
            differences: ['Validate software level of concern and architecture impacts.'],
          },
          performance: {
            equivalent: performanceScore >= 0.7,
            notes: 'Performance equivalence requires bench testing confirmation.',
            testingRequired: ['Bench performance testing', 'Software verification & validation'],
          },
        },
        overallScore,
        recommendation:
          overallScore >= 0.85 ? 'STRONG_MATCH' : overallScore >= 0.7 ? 'ACCEPTABLE' : 'WEAK_MATCH',
        justificationDraft:
          'Predicate comparison drafted. Confirm intended use, technology, and performance equivalence with supporting evidence.',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    logger.error('Predicate analysis failed', { error });
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

/**
 * POST /api/medical-device/predicates/recommend
 * Recommend predicates based on device profile
 */
router.post('/predicates/recommend', async (req: Request, res: Response) => {
  try {
    const validated = PredicateRecommendSchema.parse(req.body);
    const { deviceProfile } = validated;

    const recommendations = await predicateFinderService.findPredicates({
      deviceName: deviceProfile.productName,
      productCode: deviceProfile.productCode,
      intendedUse: deviceProfile.intendedUse,
      keywords: [deviceProfile.productName, deviceProfile.intendedUse].filter(Boolean) as string[],
      limit: 10,
    });

    res.json({
      success: true,
      recommendations,
      data: recommendations,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    logger.error('Predicate recommendation failed', { error });
    res.status(500).json({ success: false, error: 'Recommendation failed' });
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

/**
 * PATCH /api/medical-device/submissions/:id
 * Update submission details
 */
router.patch('/submissions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = SubmissionUpdateSchema.parse(req.body);
    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).organizationId);
    const userId = (req as any).user?.id || 'system';

    logger.info('Updating submission', { submissionId: id, userId });

    const updated = await medicalDeviceService.update510kSubmission(
      organizationId,
      id,
      validated,
      userId
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    logger.error('Failed to update submission', { error });
    res.status(500).json({ success: false, error: 'Failed to update submission' });
  }
});

/**
 * GET /api/medical-device/submissions/:id/estar
 * Fetch eSTAR section status
 */
router.get('/submissions/:id/estar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    res.json({
      success: true,
      data: {
        submissionId: id,
        sections: {},
        meta: {
          note: 'eSTAR section tracking not yet implemented for 510(k) submissions.',
        },
      },
    });
  } catch (error) {
    logger.error('Failed to fetch eSTAR sections', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch eSTAR sections' });
  }
});

/**
 * PATCH /api/medical-device/submissions/:id/estar/:sectionId
 * Update eSTAR section status
 */
router.patch('/submissions/:id/estar/:sectionId', async (req: Request, res: Response) => {
  try {
    const { id, sectionId } = req.params;

    res.json({
      success: true,
      data: {
        submissionId: id,
        sectionId,
        section: req.body,
        meta: {
          note: 'eSTAR section updates are not yet persisted.',
        },
      },
    });
  } catch (error) {
    logger.error('Failed to update eSTAR section', { error });
    res.status(500).json({ success: false, error: 'Failed to update eSTAR section' });
  }
});

/**
 * POST /api/medical-device/submissions/:id/estar/:sectionId/generate
 * Generate eSTAR section content
 */
router.post('/submissions/:id/estar/:sectionId/generate', async (req: Request, res: Response) => {
  try {
    const { id, sectionId } = req.params;

    res.json({
      success: true,
      data: {
        submissionId: id,
        sectionId,
        content: '',
        meta: {
          note: 'eSTAR section generation requires content assembly service integration.',
        },
      },
    });
  } catch (error) {
    logger.error('Failed to generate eSTAR content', { error });
    res.status(500).json({ success: false, error: 'Failed to generate eSTAR content' });
  }
});

/**
 * POST /api/medical-device/submissions/:id/estar/validate
 * Validate eSTAR package for a submission
 */
router.post('/submissions/:id/estar/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { strictMode = false } = req.body || {};

    logger.info('Validating eSTAR package (submission)', { submissionId: id });

    const validation = await eSTARValidator.validatePackage(id, Boolean(strictMode));

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    logger.error('eSTAR validation failed', { error });
    res.status(500).json({ success: false, error: 'Validation failed' });
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
// MAUDE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/medical-device/maude/search
 * Search MAUDE database for device reports
 */
router.get('/maude/search', async (req: Request, res: Response) => {
  try {
    const { productCode, deviceName, manufacturer, dateFrom, dateTo, limit = '50' } = req.query;

    const results = await searchDeviceReports({
      productCode: (productCode as string) || '',
      deviceName: (deviceName as string) || '',
      manufacturer: (manufacturer as string) || '',
      dateFrom: (dateFrom as string) || '',
      dateTo: (dateTo as string) || '',
      limit: parseInt(limit as string, 10) || 50,
    });

    res.json({
      success: true,
      data: results,
      total: results.length,
      analysis: analyzeMaudeData(results),
    });
  } catch (error) {
    logger.error('MAUDE search failed', { error });
    res.status(500).json({ success: false, error: 'MAUDE search failed' });
  }
});

/**
 * GET /api/medical-device/maude/hazard/:productCode
 * Get hazard analysis for a product code
 */
router.get('/maude/hazard/:productCode', async (req: Request, res: Response) => {
  try {
    const { productCode } = req.params;

    const results = await searchDeviceReports({
      productCode,
      limit: 200,
    });

    const analysis = analyzeMaudeData(results);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error('MAUDE hazard analysis failed', { error });
    res.status(500).json({ success: false, error: 'MAUDE hazard analysis failed' });
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

/**
 * POST /api/medical-device/cer
 * Create a CER report
 */
router.post('/cer', async (req: Request, res: Response) => {
  try {
    const { deviceId, deviceName, manufacturer, templateVersion } = req.body;
    const organizationId = Number((req as any).tenantContext?.organizationId || (req as any).organizationId || 0);

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
    logger.error('CER create failed', { error });
    res.status(500).json({ success: false, error: 'CER create failed' });
  }
});

/**
 * GET /api/medical-device/cer/:id
 * Fetch CER report
 */
router.get('/cer/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    res.json({
      success: true,
      data: {
        id,
        status: 'pending',
        sections: [],
        meta: {
          note: 'CER persistence not yet implemented. Use /cer/generate to generate a report.',
        },
      },
    });
  } catch (error) {
    logger.error('CER fetch failed', { error });
    res.status(500).json({ success: false, error: 'CER fetch failed' });
  }
});

/**
 * PATCH /api/medical-device/cer/:id/sections/:sectionName
 * Update CER section content
 */
router.patch('/cer/:id/sections/:sectionName', async (req: Request, res: Response) => {
  try {
    const { id, sectionName } = req.params;

    res.json({
      success: true,
      data: {
        reportId: id,
        sectionName,
        content: req.body?.content || '',
        meta: {
          note: 'CER section updates are not yet persisted.',
        },
      },
    });
  } catch (error) {
    logger.error('CER section update failed', { error });
    res.status(500).json({ success: false, error: 'CER section update failed' });
  }
});

/**
 * POST /api/medical-device/cer/:id/sections/:sectionName/generate
 * Generate CER section content
 */
router.post('/cer/:id/sections/:sectionName/generate', async (req: Request, res: Response) => {
  try {
    const { id, sectionName } = req.params;

    res.json({
      success: true,
      data: {
        reportId: id,
        sectionName,
        content: '',
        meta: {
          note: 'CER section generation requires content assembly service integration.',
        },
      },
    });
  } catch (error) {
    logger.error('CER section generation failed', { error });
    res.status(500).json({ success: false, error: 'CER section generation failed' });
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
