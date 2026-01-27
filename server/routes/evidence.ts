/**
 * Evidence Objects API Router
 *
 * Unified API for evidence management - literature, test reports, clinical data.
 * Supports linking evidence to claims, sections, and requirements.
 *
 * @version 1.0.0
 * @module server/routes/evidence
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const evidenceTypeEnum = z.enum([
  'literature',
  'test_report',
  'clinical_data',
  'standard',
  'cer_section',
  'approval_letter',
  'guidance',
  'expert_opinion',
]);

const evidenceCategoryEnum = z.enum([
  'clinical',
  'nonclinical',
  'performance',
  'biocompatibility',
  'safety',
  'regulatory',
  'manufacturing',
]);

const sourceTypeEnum = z.enum(['internal', 'external', 'literature', 'agency', 'standard_body']);
const evidenceLevelEnum = z.enum(['I', 'II', 'III', 'IV', 'V']);
const statusEnum = z.enum(['pending', 'approved', 'rejected', 'superseded']);

const createEvidenceSchema = z.object({
  title: z.string().min(1).max(500),
  code: z.string().max(100).optional(),
  description: z.string().optional(),
  evidenceType: evidenceTypeEnum,
  evidenceCategory: evidenceCategoryEnum,
  evidenceLevel: evidenceLevelEnum.optional(),
  sourceType: sourceTypeEnum,
  sourceReference: z.string().optional(),
  sourceCitation: z.string().optional(),
  programId: z.string().uuid().optional(),
  documentId: z.number().optional(),
  documentVersion: z.string().optional(),
  pageRange: z.string().optional(),
  excerpt: z.string().optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  // Literature-specific
  authors: z.array(z.string()).optional(),
  publicationDate: z.string().datetime().optional(),
  journal: z.string().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  abstract: z.string().optional(),
  // Test report-specific
  testType: z.string().optional(),
  testLab: z.string().optional(),
  testDate: z.string().datetime().optional(),
  testResults: z.record(z.unknown()).optional(),
  // Metadata
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateEvidenceSchema = createEvidenceSchema.partial();

const createLinkSchema = z.object({
  evidenceId: z.string().uuid(),
  targetType: z.enum(['claim', 'section', 'requirement', 'standard', 'question']),
  targetId: z.string(),
  targetPath: z.string().optional(),
  linkType: z.enum(['supports', 'contradicts', 'references', 'supersedes']).default('supports'),
  strength: z.enum(['strong', 'moderate', 'weak']).default('moderate'),
  rationale: z.string().optional(),
});

const queryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  programId: z.string().uuid().optional(),
  evidenceType: evidenceTypeEnum.optional(),
  evidenceCategory: evidenceCategoryEnum.optional(),
  status: statusEnum.optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'title', 'qualityScore', 'relevanceScore'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const validateBody = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: error.errors },
      });
      return;
    }
    next(error);
  }
};

const validateQuery =
  (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        });
        return;
      }
      next(error);
    }
  };

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence
 * List all evidence objects with filtering and pagination
 */
router.get('/', validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      programId,
      evidenceType,
      evidenceCategory,
      status,
      search,
      sortBy,
      sortOrder,
    } = req.query as z.infer<typeof queryParamsSchema>;
    const tenantId = (req as any).tenantContext?.tenantId || 1;

    // Mock response - replace with actual DB query
    const evidence = [
      {
        id: '650e8400-e29b-41d4-a716-446655440001',
        title: 'Long-term outcomes of cardiac monitoring: A systematic review',
        code: 'LIT-2026-001',
        evidenceType: 'literature',
        evidenceCategory: 'clinical',
        evidenceLevel: 'I',
        sourceType: 'literature',
        authors: ['Smith J', 'Johnson M', 'Williams K'],
        journal: 'Journal of Cardiac Monitoring',
        publicationDate: '2025-06-15T00:00:00Z',
        doi: '10.1234/jcm.2025.12345',
        qualityScore: 0.92,
        relevanceScore: 0.88,
        status: 'approved',
        isVerified: true,
        verifiedBy: 'Dr. Sarah Chen',
        programId: '550e8400-e29b-41d4-a716-446655440001',
        createdAt: '2026-01-20T10:00:00Z',
        updatedAt: '2026-01-22T14:30:00Z',
      },
      {
        id: '650e8400-e29b-41d4-a716-446655440002',
        title: 'Biocompatibility Testing Report - CardioWatch X1',
        code: 'TEST-2026-001',
        evidenceType: 'test_report',
        evidenceCategory: 'biocompatibility',
        evidenceLevel: 'II',
        sourceType: 'internal',
        testType: 'ISO 10993-1 Biocompatibility',
        testLab: 'AccuTest Labs',
        testDate: '2025-11-10T00:00:00Z',
        qualityScore: 0.95,
        relevanceScore: 0.9,
        status: 'approved',
        isVerified: true,
        programId: '550e8400-e29b-41d4-a716-446655440001',
        createdAt: '2026-01-18T09:00:00Z',
        updatedAt: '2026-01-19T11:00:00Z',
      },
      {
        id: '650e8400-e29b-41d4-a716-446655440003',
        title: 'Clinical Performance Data Summary',
        code: 'CLIN-2026-001',
        evidenceType: 'clinical_data',
        evidenceCategory: 'clinical',
        evidenceLevel: 'II',
        sourceType: 'internal',
        qualityScore: 0.85,
        relevanceScore: 0.92,
        status: 'pending',
        isVerified: false,
        programId: '550e8400-e29b-41d4-a716-446655440001',
        createdAt: '2026-01-24T15:00:00Z',
        updatedAt: '2026-01-24T15:00:00Z',
      },
    ];

    res.json({
      success: true,
      data: evidence,
      meta: {
        page,
        limit,
        total: evidence.length,
        totalPages: Math.ceil(evidence.length / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch evidence' },
    });
  }
});

/**
 * GET /api/evidence/:id
 * Get a single evidence object by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Mock response - replace with actual DB query
    const evidence = {
      id,
      title: 'Long-term outcomes of cardiac monitoring: A systematic review',
      code: 'LIT-2026-001',
      description:
        'Systematic review and meta-analysis of long-term patient outcomes with continuous cardiac monitoring devices.',
      evidenceType: 'literature',
      evidenceCategory: 'clinical',
      evidenceLevel: 'I',
      sourceType: 'literature',
      sourceReference: 'https://doi.org/10.1234/jcm.2025.12345',
      sourceCitation:
        'Smith J, Johnson M, Williams K. Long-term outcomes of cardiac monitoring: A systematic review. J Cardiac Monit. 2025;15(3):234-248.',
      authors: ['Smith J', 'Johnson M', 'Williams K'],
      journal: 'Journal of Cardiac Monitoring',
      publicationDate: '2025-06-15T00:00:00Z',
      doi: '10.1234/jcm.2025.12345',
      pmid: '39876543',
      abstract:
        'Background: Continuous cardiac monitoring has become increasingly important... Methods: We conducted a systematic review... Results: Our analysis included 45 studies... Conclusions: Long-term cardiac monitoring demonstrates significant benefits...',
      qualityScore: 0.92,
      relevanceScore: 0.88,
      validFrom: '2025-06-15T00:00:00Z',
      validUntil: null,
      isVerified: true,
      verifiedBy: 'Dr. Sarah Chen',
      verifiedAt: '2026-01-22T14:30:00Z',
      status: 'approved',
      programId: '550e8400-e29b-41d4-a716-446655440001',
      tags: ['systematic-review', 'cardiac', 'long-term', 'outcomes'],
      links: [
        {
          id: 'link-001',
          targetType: 'claim',
          targetId: 'claim-001',
          linkType: 'supports',
          strength: 'strong',
          rationale: 'Directly supports clinical efficacy claim with Level I evidence',
        },
      ],
      createdBy: 'john.smith@example.com',
      updatedBy: 'sarah.chen@example.com',
      createdAt: '2026-01-20T10:00:00Z',
      updatedAt: '2026-01-22T14:30:00Z',
    };

    res.json({ success: true, data: evidence });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch evidence' },
    });
  }
});

/**
 * POST /api/evidence
 * Create a new evidence object
 */
router.post('/', validateBody(createEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const tenantId = (req as any).tenantContext?.tenantId || 1;
    const userId = (req as any).user?.id || 'system';

    // Generate code if not provided
    const typePrefix =
      data.evidenceType === 'literature'
        ? 'LIT'
        : data.evidenceType === 'test_report'
          ? 'TEST'
          : data.evidenceType === 'clinical_data'
            ? 'CLIN'
            : 'EV';
    const code =
      data.code ||
      `${typePrefix}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

    // Mock response - replace with actual DB insert
    const evidence = {
      id: crypto.randomUUID(),
      ...data,
      code,
      organizationId: tenantId,
      status: 'pending',
      isVerified: false,
      createdBy: userId,
      updatedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.status(201).json({ success: true, data: evidence });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create evidence' },
    });
  }
});

/**
 * PATCH /api/evidence/:id
 * Update an evidence object
 */
router.patch('/:id', validateBody(updateEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.id || 'system';

    // Mock response - replace with actual DB update
    const evidence = {
      id,
      ...updates,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: evidence });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update evidence' },
    });
  }
});

/**
 * DELETE /api/evidence/:id
 * Delete an evidence object
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check for existing links before deletion
    res.json({ success: true, message: 'Evidence deleted successfully' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete evidence' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence Verification
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/evidence/:id/verify
 * Verify an evidence object
 */
router.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved, comments } = req.body;
    const userId = (req as any).user?.id || 'system';
    const userName = (req as any).user?.name || 'System';

    const evidence = {
      id,
      isVerified: approved,
      verifiedBy: userName,
      verifiedAt: new Date().toISOString(),
      status: approved ? 'approved' : 'rejected',
      verificationComments: comments,
      updatedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: evidence });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to verify evidence' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence Links
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence/:id/links
 * Get all links for an evidence object
 */
router.get('/:id/links', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Mock response
    const links = [
      {
        id: 'link-001',
        evidenceId: id,
        targetType: 'claim',
        targetId: 'claim-001',
        targetPath: 'claims.clinical_efficacy',
        linkType: 'supports',
        strength: 'strong',
        rationale: 'Directly supports clinical efficacy claim with Level I evidence',
        isVerified: true,
        verifiedBy: 'Dr. Sarah Chen',
        createdAt: '2026-01-22T14:30:00Z',
      },
      {
        id: 'link-002',
        evidenceId: id,
        targetType: 'section',
        targetId: 'section-002',
        targetPath: 'm2/27/clinical_evaluation',
        linkType: 'supports',
        strength: 'moderate',
        rationale: 'Provides supporting clinical context',
        isVerified: false,
        createdAt: '2026-01-23T10:00:00Z',
      },
    ];

    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch links' },
    });
  }
});

/**
 * POST /api/evidence/links
 * Create a new evidence link
 */
router.post('/links', validateBody(createLinkSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const tenantId = (req as any).tenantContext?.tenantId || 1;
    const userId = (req as any).user?.id || 'system';

    const link = {
      id: crypto.randomUUID(),
      ...data,
      organizationId: tenantId,
      isVerified: false,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create link' },
    });
  }
});

/**
 * DELETE /api/evidence/links/:linkId
 * Delete an evidence link
 */
router.delete('/links/:linkId', async (req: Request, res: Response) => {
  try {
    const { linkId } = req.params;

    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete link' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Evidence Search & Stats
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence/search
 * Search evidence with faceted filters
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type, category, level, status, programId, verified } = req.query;

    // Mock response with facets
    const results = {
      items: [],
      facets: {
        type: [
          { value: 'literature', count: 45 },
          { value: 'test_report', count: 32 },
          { value: 'clinical_data', count: 28 },
          { value: 'standard', count: 15 },
        ],
        category: [
          { value: 'clinical', count: 52 },
          { value: 'performance', count: 38 },
          { value: 'safety', count: 25 },
          { value: 'biocompatibility', count: 18 },
        ],
        level: [
          { value: 'I', count: 12 },
          { value: 'II', count: 35 },
          { value: 'III', count: 28 },
          { value: 'IV', count: 15 },
        ],
        status: [
          { value: 'approved', count: 85 },
          { value: 'pending', count: 25 },
          { value: 'rejected', count: 10 },
        ],
      },
      total: 120,
    };

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Search failed' },
    });
  }
});

/**
 * GET /api/evidence/stats
 * Get evidence statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { programId } = req.query;
    const tenantId = (req as any).tenantContext?.tenantId || 1;

    const stats = {
      total: 156,
      verified: 128,
      pending: 25,
      rejected: 3,
      byType: {
        literature: 45,
        test_report: 32,
        clinical_data: 28,
        standard: 15,
        guidance: 12,
        expert_opinion: 8,
        cer_section: 10,
        approval_letter: 6,
      },
      byCategory: {
        clinical: 52,
        performance: 38,
        safety: 25,
        biocompatibility: 18,
        nonclinical: 12,
        regulatory: 8,
        manufacturing: 3,
      },
      byLevel: {
        I: 12,
        II: 35,
        III: 28,
        IV: 15,
        V: 10,
      },
      averageQualityScore: 0.87,
      averageRelevanceScore: 0.84,
      linkedEvidence: 142,
      unlinkedEvidence: 14,
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' },
    });
  }
});

export default router;
