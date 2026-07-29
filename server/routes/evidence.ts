/**
 * Evidence Objects API Router
 *
 * Unified API for evidence management - literature, test reports, clinical data.
 * Supports linking evidence to claims, sections, and requirements.
 *
 * @version 2.0.0
 * @module server/routes/evidence
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { eq, and, desc, asc, sql, count, or, ilike } from 'drizzle-orm';
import { evidenceObjects, evidenceLinks } from '../../shared/schema/programs';
import { getSecureOrgId } from '../utils/tenantContext';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('evidence');

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
  authors: z.array(z.string()).optional(),
  publicationDate: z.string().datetime().optional(),
  journal: z.string().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  abstract: z.string().optional(),
  testType: z.string().optional(),
  testLab: z.string().optional(),
  testDate: z.string().datetime().optional(),
  testResults: z.record(z.unknown()).optional(),
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

// Column map for sortBy -> actual drizzle column
const sortColumnMap: Record<string, any> = {
  createdAt: evidenceObjects.createdAt,
  updatedAt: evidenceObjects.updatedAt,
  title: evidenceObjects.title,
  qualityScore: evidenceObjects.qualityScore,
  relevanceScore: evidenceObjects.relevanceScore,
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
      // validateQuery(queryParamsSchema) has already parsed/validated req.query
      // against this schema; cast through unknown across the ParsedQs boundary.
    } = req.query as unknown as z.infer<typeof queryParamsSchema>;

    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const conditions = [eq(evidenceObjects.organizationId, orgIdNum)];
    if (programId) conditions.push(eq(evidenceObjects.programId, programId));
    if (evidenceType) conditions.push(eq(evidenceObjects.evidenceType, evidenceType));
    if (evidenceCategory) conditions.push(eq(evidenceObjects.evidenceCategory, evidenceCategory));
    if (status) conditions.push(eq(evidenceObjects.status, status));
    if (search) {
      conditions.push(
        or(
          ilike(evidenceObjects.title, `%${search}%`),
          ilike(evidenceObjects.description, `%${search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);
    const offset = (page - 1) * limit;

    const sortCol = sortColumnMap[sortBy] || evidenceObjects.createdAt;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const [evidence, totalResult] = await Promise.all([
      db
        .select()
        .from(evidenceObjects)
        .where(whereClause)
        .orderBy(orderFn(sortCol))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(evidenceObjects)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.total ?? 0;

    res.json({
      success: true,
      data: evidence,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('GET / error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch evidence' },
    });
  }
});

/**
 * GET /api/evidence/search
 * Search evidence with faceted filters
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, type, category, level, status, programId, verified } = req.query;

    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const conditions = [eq(evidenceObjects.organizationId, orgIdNum)];

    if (q && typeof q === 'string') {
      conditions.push(
        or(
          ilike(evidenceObjects.title, `%${q}%`),
          ilike(evidenceObjects.description, `%${q}%`)
        )!
      );
    }
    if (type && typeof type === 'string') conditions.push(eq(evidenceObjects.evidenceType, type));
    if (category && typeof category === 'string') conditions.push(eq(evidenceObjects.evidenceCategory, category));
    if (level && typeof level === 'string') conditions.push(eq(evidenceObjects.evidenceLevel, level));
    if (status && typeof status === 'string') conditions.push(eq(evidenceObjects.status, status));
    if (programId && typeof programId === 'string') conditions.push(eq(evidenceObjects.programId, programId));
    if (verified === 'true') conditions.push(eq(evidenceObjects.isVerified, true));
    if (verified === 'false') conditions.push(eq(evidenceObjects.isVerified, false));

    const whereClause = and(...conditions);
    const baseWhere = eq(evidenceObjects.organizationId, orgIdNum);

    const [items, totalResult, typeFacets, categoryFacets, levelFacets, statusFacets] =
      await Promise.all([
        db.select().from(evidenceObjects).where(whereClause).orderBy(desc(evidenceObjects.createdAt)).limit(50),
        db.select({ total: count() }).from(evidenceObjects).where(whereClause),
        db
          .select({ value: evidenceObjects.evidenceType, count: count() })
          .from(evidenceObjects)
          .where(baseWhere)
          .groupBy(evidenceObjects.evidenceType),
        db
          .select({ value: evidenceObjects.evidenceCategory, count: count() })
          .from(evidenceObjects)
          .where(baseWhere)
          .groupBy(evidenceObjects.evidenceCategory),
        db
          .select({ value: evidenceObjects.evidenceLevel, count: count() })
          .from(evidenceObjects)
          .where(and(baseWhere, sql`${evidenceObjects.evidenceLevel} IS NOT NULL`))
          .groupBy(evidenceObjects.evidenceLevel),
        db
          .select({ value: evidenceObjects.status, count: count() })
          .from(evidenceObjects)
          .where(baseWhere)
          .groupBy(evidenceObjects.status),
      ]);

    res.json({
      success: true,
      data: {
        items,
        facets: {
          type: typeFacets,
          category: categoryFacets,
          level: levelFacets,
          status: statusFacets,
        },
        total: totalResult[0]?.total ?? 0,
      },
    });
  } catch (error) {
    logger.error('GET /search error', { err: error instanceof Error ? error.message : String(error) });
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
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const conditions = [eq(evidenceObjects.organizationId, orgIdNum)];
    if (programId && typeof programId === 'string') {
      conditions.push(eq(evidenceObjects.programId, programId));
    }
    const whereClause = and(...conditions);

    const [
      totalResult,
      verifiedResult,
      statusCounts,
      typeCounts,
      categoryCounts,
      levelCounts,
      avgScores,
      linkedCountResult,
    ] = await Promise.all([
      db.select({ total: count() }).from(evidenceObjects).where(whereClause),
      db.select({ total: count() }).from(evidenceObjects).where(and(...conditions, eq(evidenceObjects.isVerified, true))),
      db.select({ value: evidenceObjects.status, count: count() }).from(evidenceObjects).where(whereClause).groupBy(evidenceObjects.status),
      db.select({ value: evidenceObjects.evidenceType, count: count() }).from(evidenceObjects).where(whereClause).groupBy(evidenceObjects.evidenceType),
      db.select({ value: evidenceObjects.evidenceCategory, count: count() }).from(evidenceObjects).where(whereClause).groupBy(evidenceObjects.evidenceCategory),
      db.select({ value: evidenceObjects.evidenceLevel, count: count() }).from(evidenceObjects)
        .where(and(...conditions, sql`${evidenceObjects.evidenceLevel} IS NOT NULL`))
        .groupBy(evidenceObjects.evidenceLevel),
      db.select({
        avgQuality: sql<string>`COALESCE(AVG(${evidenceObjects.qualityScore}::numeric), 0)`,
        avgRelevance: sql<string>`COALESCE(AVG(${evidenceObjects.relevanceScore}::numeric), 0)`,
      }).from(evidenceObjects).where(whereClause),
      db.select({ total: sql<number>`COUNT(DISTINCT ${evidenceLinks.evidenceId})` })
        .from(evidenceLinks)
        .where(eq(evidenceLinks.organizationId, orgIdNum)),
    ]);

    const total = totalResult[0]?.total ?? 0;
    const verified = verifiedResult[0]?.total ?? 0;
    const linkedEvidence = linkedCountResult[0]?.total ?? 0;

    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) statusMap[row.value] = row.count;

    const byType: Record<string, number> = {};
    for (const row of typeCounts) byType[row.value] = row.count;

    const byCategory: Record<string, number> = {};
    for (const row of categoryCounts) byCategory[row.value] = row.count;

    const byLevel: Record<string, number> = {};
    for (const row of levelCounts) if (row.value) byLevel[row.value] = row.count;

    res.json({
      success: true,
      data: {
        total,
        verified,
        pending: statusMap['pending'] ?? 0,
        rejected: statusMap['rejected'] ?? 0,
        byType,
        byCategory,
        byLevel,
        averageQualityScore: parseFloat(avgScores[0]?.avgQuality ?? '0'),
        averageRelevanceScore: parseFloat(avgScores[0]?.avgRelevance ?? '0'),
        linkedEvidence,
        unlinkedEvidence: Math.max(0, total - linkedEvidence),
      },
    });
  } catch (error) {
    logger.error('GET /stats error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch stats' },
    });
  }
});

/**
 * GET /api/evidence/:id
 * Get a single evidence object by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const [evidence] = await db
      .select()
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (!evidence) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${id} not found` },
      });
    }

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(and(eq(evidenceLinks.evidenceId, id), eq(evidenceLinks.organizationId, orgIdNum)));

    res.json({ success: true, data: { ...evidence, links } });
  } catch (error) {
    logger.error('GET /:id error', { err: error instanceof Error ? error.message : String(error) });
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
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);
    const userId = (req as any).user?.id ? String((req as any).user.id) : 'system';

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

    const [evidence] = await db
      .insert(evidenceObjects)
      .values({
        organizationId: orgIdNum,
        programId: data.programId || null,
        title: data.title,
        code,
        description: data.description || null,
        evidenceType: data.evidenceType,
        evidenceCategory: data.evidenceCategory,
        evidenceLevel: data.evidenceLevel || null,
        sourceType: data.sourceType,
        sourceReference: data.sourceReference || null,
        sourceCitation: data.sourceCitation || null,
        documentId: data.documentId || null,
        documentVersion: data.documentVersion || null,
        pageRange: data.pageRange || null,
        excerpt: data.excerpt || null,
        qualityScore: data.qualityScore != null ? String(data.qualityScore) : null,
        relevanceScore: data.relevanceScore != null ? String(data.relevanceScore) : null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        isVerified: false,
        authors: data.authors || null,
        publicationDate: data.publicationDate ? new Date(data.publicationDate) : null,
        journal: data.journal || null,
        doi: data.doi || null,
        pmid: data.pmid || null,
        abstract: data.abstract || null,
        testType: data.testType || null,
        testLab: data.testLab || null,
        testDate: data.testDate ? new Date(data.testDate) : null,
        testResults: data.testResults || null,
        status: 'pending',
        metadata: data.metadata || null,
        tags: data.tags || [],
        createdBy: userId,
        updatedBy: userId,
      } as any)
      .returning();

    res.status(201).json({ success: true, data: evidence });
  } catch (error) {
    logger.error('POST / error', { err: error instanceof Error ? error.message : String(error) });
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
    const id = String(req.params.id);
    const updates = req.body;
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);
    const userId = (req as any).user?.id ? String((req as any).user.id) : 'system';

    const existing = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${id} not found` },
      });
    }

    const updateValues: Record<string, any> = { updatedBy: userId, updatedAt: new Date() };

    if (updates.title !== undefined) updateValues.title = updates.title;
    if (updates.code !== undefined) updateValues.code = updates.code;
    if (updates.description !== undefined) updateValues.description = updates.description;
    if (updates.evidenceType !== undefined) updateValues.evidenceType = updates.evidenceType;
    if (updates.evidenceCategory !== undefined) updateValues.evidenceCategory = updates.evidenceCategory;
    if (updates.evidenceLevel !== undefined) updateValues.evidenceLevel = updates.evidenceLevel;
    if (updates.sourceType !== undefined) updateValues.sourceType = updates.sourceType;
    if (updates.sourceReference !== undefined) updateValues.sourceReference = updates.sourceReference;
    if (updates.sourceCitation !== undefined) updateValues.sourceCitation = updates.sourceCitation;
    if (updates.programId !== undefined) updateValues.programId = updates.programId;
    if (updates.documentId !== undefined) updateValues.documentId = updates.documentId;
    if (updates.documentVersion !== undefined) updateValues.documentVersion = updates.documentVersion;
    if (updates.pageRange !== undefined) updateValues.pageRange = updates.pageRange;
    if (updates.excerpt !== undefined) updateValues.excerpt = updates.excerpt;
    if (updates.qualityScore !== undefined) updateValues.qualityScore = updates.qualityScore != null ? String(updates.qualityScore) : null;
    if (updates.relevanceScore !== undefined) updateValues.relevanceScore = updates.relevanceScore != null ? String(updates.relevanceScore) : null;
    if (updates.validFrom !== undefined) updateValues.validFrom = updates.validFrom ? new Date(updates.validFrom) : null;
    if (updates.validUntil !== undefined) updateValues.validUntil = updates.validUntil ? new Date(updates.validUntil) : null;
    if (updates.authors !== undefined) updateValues.authors = updates.authors;
    if (updates.publicationDate !== undefined) updateValues.publicationDate = updates.publicationDate ? new Date(updates.publicationDate) : null;
    if (updates.journal !== undefined) updateValues.journal = updates.journal;
    if (updates.doi !== undefined) updateValues.doi = updates.doi;
    if (updates.pmid !== undefined) updateValues.pmid = updates.pmid;
    if (updates.abstract !== undefined) updateValues.abstract = updates.abstract;
    if (updates.testType !== undefined) updateValues.testType = updates.testType;
    if (updates.testLab !== undefined) updateValues.testLab = updates.testLab;
    if (updates.testDate !== undefined) updateValues.testDate = updates.testDate ? new Date(updates.testDate) : null;
    if (updates.testResults !== undefined) updateValues.testResults = updates.testResults;
    if (updates.tags !== undefined) updateValues.tags = updates.tags;
    if (updates.metadata !== undefined) updateValues.metadata = updates.metadata;

    const [evidence] = await db
      .update(evidenceObjects)
      .set(updateValues)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .returning();

    res.json({ success: true, data: evidence });
  } catch (error) {
    logger.error('PATCH /:id error', { err: error instanceof Error ? error.message : String(error) });
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
    const id = String(req.params.id);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const existing = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${id} not found` },
      });
    }

    await db
      .delete(evidenceLinks)
      .where(and(eq(evidenceLinks.evidenceId, id), eq(evidenceLinks.organizationId, orgIdNum)));

    await db
      .delete(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)));

    res.json({ success: true, message: 'Evidence deleted successfully' });
  } catch (error) {
    logger.error('DELETE /:id error', { err: error instanceof Error ? error.message : String(error) });
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
    const id = String(req.params.id);
    const { approved, comments } = req.body;
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);
    const userName = (req as any).user?.name || (req as any).user?.email || 'System';

    const existing = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${id} not found` },
      });
    }

    const now = new Date();
    const updateVals: Record<string, any> = {
      isVerified: !!approved,
      verifiedBy: userName,
      verifiedAt: now,
      status: approved ? 'approved' : 'rejected',
      updatedAt: now,
    };
    if (comments) {
      updateVals.metadata = sql`jsonb_set(COALESCE(${evidenceObjects.metadata}::jsonb, '{}'::jsonb), '{verificationComments}', ${JSON.stringify(comments)}::jsonb)`;
    }

    const [evidence] = await db
      .update(evidenceObjects)
      .set(updateVals)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, orgIdNum)))
      .returning();

    res.json({ success: true, data: evidence });
  } catch (error) {
    logger.error('POST /:id/verify error', { err: error instanceof Error ? error.message : String(error) });
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
    const id = String(req.params.id);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const links = await db
      .select()
      .from(evidenceLinks)
      .where(and(eq(evidenceLinks.evidenceId, id), eq(evidenceLinks.organizationId, orgIdNum)));

    res.json({ success: true, data: links });
  } catch (error) {
    logger.error('GET /:id/links error', { err: error instanceof Error ? error.message : String(error) });
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
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);
    const userId = (req as any).user?.id ? String((req as any).user.id) : 'system';

    const [evidenceExists] = await db
      .select({ id: evidenceObjects.id })
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, data.evidenceId), eq(evidenceObjects.organizationId, orgIdNum)))
      .limit(1);

    if (!evidenceExists) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence object ${data.evidenceId} not found` },
      });
    }

    const [link] = await db
      .insert(evidenceLinks)
      .values({
        organizationId: orgIdNum,
        evidenceId: data.evidenceId,
        targetType: data.targetType,
        targetId: data.targetId,
        targetPath: data.targetPath || null,
        linkType: data.linkType,
        strength: data.strength,
        rationale: data.rationale || null,
        isVerified: false,
        createdBy: userId,
      } as any)
      .returning();

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    logger.error('POST /links error', { err: error instanceof Error ? error.message : String(error) });
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
    const linkId = String(req.params.linkId);
    const orgId = getSecureOrgId(req);
    if (!orgId) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Tenant context required' } });
    }
    const orgIdNum = parseInt(orgId, 10);

    const existing = await db
      .select({ id: evidenceLinks.id })
      .from(evidenceLinks)
      .where(and(eq(evidenceLinks.id, linkId), eq(evidenceLinks.organizationId, orgIdNum)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Evidence link ${linkId} not found` },
      });
    }

    await db
      .delete(evidenceLinks)
      .where(and(eq(evidenceLinks.id, linkId), eq(evidenceLinks.organizationId, orgIdNum)));

    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (error) {
    logger.error('DELETE /links/:linkId error', { err: error instanceof Error ? error.message : String(error) });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete link' },
    });
  }
});

export default router;
