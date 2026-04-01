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
import crypto from 'crypto';
import { and, asc, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { evidenceSources, evidenceClaims, evidenceClaimLinks } from '@shared/schema';

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
  programId: z.coerce.number().int().positive(),
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
  evidenceId: z.coerce.number().int().positive(),
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
  programId: z.coerce.number().int().positive().optional(),
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
      search,
      sortBy,
      sortOrder,
    } = req.query as z.infer<typeof queryParamsSchema>;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const whereClauses = [eq(evidenceSources.organizationId, Number(tenantId))];
    if (programId) whereClauses.push(eq(evidenceSources.programId, programId));
    if (evidenceType) whereClauses.push(eq(evidenceSources.sourceType, evidenceType));
    if (search) whereClauses.push(ilike(evidenceSources.title, `%${search}%`));

    const sortColumn =
      sortBy === 'title'
        ? evidenceSources.title
        : sortBy === 'updatedAt'
          ? evidenceSources.updatedAt
          : evidenceSources.createdAt;
    const orderByExpr = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const offset = (page - 1) * limit;
    const rows = await db
      .select()
      .from(evidenceSources)
      .where(and(...whereClauses))
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(evidenceSources)
      .where(and(...whereClauses));

    const evidence = rows.map(row => {
      const metadata = (row.metadata ?? {}) as Record<string, any>;
      return {
        id: String(row.id),
        title: row.title,
        code: metadata.code ?? null,
        evidenceType: row.sourceType,
        evidenceCategory: metadata.evidenceCategory ?? null,
        evidenceLevel: metadata.evidenceLevel ?? null,
        sourceType: row.sourceType,
        qualityScore: metadata.qualityScore ?? null,
        relevanceScore: metadata.relevanceScore ?? null,
        status: metadata.status ?? 'pending',
        programId: row.programId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    res.json({
      success: true,
      data: evidence,
      meta: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.max(1, Math.ceil(Number(total) / limit)),
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
router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid evidence id' } });

    const [row] = await db
      .select()
      .from(evidenceSources)
      .where(and(eq(evidenceSources.id, id), eq(evidenceSources.organizationId, Number(tenantId))))
      .limit(1);
    if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidence not found' } });

    const metadata = (row.metadata ?? {}) as Record<string, any>;
    const evidence = {
      id: String(row.id),
      title: row.title,
      description: metadata.description ?? null,
      code: metadata.code ?? null,
      evidenceType: row.sourceType,
      evidenceCategory: metadata.evidenceCategory ?? null,
      evidenceLevel: metadata.evidenceLevel ?? null,
      sourceType: row.sourceType,
      sourceReference: row.fileUrl ?? metadata.sourceReference ?? null,
      sourceCitation: metadata.sourceCitation ?? null,
      programId: row.programId,
      metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
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
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const userId = Number((req as any).user?.id) || null;

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

    const contentHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          title: data.title,
          sourceReference: data.sourceReference,
          sourceCitation: data.sourceCitation,
          excerpt: data.excerpt,
        })
      )
      .digest('hex');

    const [created] = await db
      .insert(evidenceSources)
      .values({
        title: data.title,
        sourceType: data.evidenceType,
        organizationId: Number(tenantId),
        programId: data.programId,
        fileUrl: data.sourceReference,
        contentText: data.excerpt ?? data.abstract ?? data.description ?? null,
        contentHash,
        metadata: {
          code,
          evidenceCategory: data.evidenceCategory,
          evidenceLevel: data.evidenceLevel ?? null,
          sourceCitation: data.sourceCitation ?? null,
          qualityScore: data.qualityScore ?? null,
          relevanceScore: data.relevanceScore ?? null,
          description: data.description ?? null,
          authors: data.authors ?? [],
          tags: data.tags ?? [],
          status: 'pending',
        },
        ingestedBy: userId,
      })
      .returning();

    const evidence = {
      id: String(created.id),
      title: created.title,
      code,
      evidenceType: created.sourceType,
      evidenceCategory: data.evidenceCategory,
      sourceType: created.sourceType,
      status: 'pending',
      programId: created.programId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
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
router.patch('/:id(\\d+)', validateBody(updateEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid evidence id' } });
    const updates = req.body;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const [existing] = await db
      .select()
      .from(evidenceSources)
      .where(and(eq(evidenceSources.id, id), eq(evidenceSources.organizationId, Number(tenantId))))
      .limit(1);
    if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidence not found' } });

    const nextMetadata = {
      ...((existing.metadata as Record<string, unknown>) ?? {}),
      ...(updates.code ? { code: updates.code } : {}),
      ...(updates.description ? { description: updates.description } : {}),
      ...(updates.evidenceCategory ? { evidenceCategory: updates.evidenceCategory } : {}),
      ...(updates.evidenceLevel ? { evidenceLevel: updates.evidenceLevel } : {}),
      ...(updates.qualityScore !== undefined ? { qualityScore: updates.qualityScore } : {}),
      ...(updates.relevanceScore !== undefined ? { relevanceScore: updates.relevanceScore } : {}),
      ...(updates.tags ? { tags: updates.tags } : {}),
      ...(updates.metadata ? { extra: updates.metadata } : {}),
    };

    const [evidence] = await db
      .update(evidenceSources)
      .set({
        ...(updates.title ? { title: updates.title } : {}),
        ...(updates.evidenceType ? { sourceType: updates.evidenceType } : {}),
        ...(updates.sourceReference ? { fileUrl: updates.sourceReference } : {}),
        ...(updates.excerpt ? { contentText: updates.excerpt } : {}),
        ...(updates.programId ? { programId: updates.programId } : {}),
        metadata: nextMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(evidenceSources.id, id), eq(evidenceSources.organizationId, Number(tenantId))))
      .returning();

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
router.delete('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid evidence id' } });

    await db
      .delete(evidenceSources)
      .where(and(eq(evidenceSources.id, id), eq(evidenceSources.organizationId, Number(tenantId))));
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
router.post('/:id(\\d+)/verify', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { approved, comments } = req.body;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
    if (!Number.isFinite(id))
      return res
        .status(400)
        .json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid evidence id' } });

    const userName = (req as any).user?.name || 'System';
    const userId = Number((req as any).user?.id) || null;
    const [existing] = await db
      .select()
      .from(evidenceSources)
      .where(and(eq(evidenceSources.id, id), eq(evidenceSources.organizationId, Number(tenantId))))
      .limit(1);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    }

    const verifiedAt = new Date().toISOString();
    const nextMetadata = {
      ...((existing.metadata as Record<string, unknown>) ?? {}),
      status: approved ? 'approved' : 'rejected',
      isVerified: Boolean(approved),
      verifiedBy: userName,
      verifiedById: userId,
      verifiedAt,
      verificationComments: comments ?? null,
    };
    const [saved] = await db
      .update(evidenceSources)
      .set({
        metadata: nextMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(evidenceSources.id, id), eq(evidenceSources.organizationId, Number(tenantId))))
      .returning();

    const evidence = {
      id: String(id),
      isVerified: approved,
      verifiedBy: userName,
      verifiedAt,
      status: approved ? 'approved' : 'rejected',
      verificationComments: comments,
      updatedAt: saved.updatedAt,
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
router.get('/:id(\\d+)/links', async (req: Request, res: Response) => {
  try {
    const sourceId = Number(req.params.id);
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
    if (!Number.isFinite(sourceId))
      return res
        .status(400)
        .json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid evidence id' } });

    const claims = await db
      .select({ id: evidenceClaims.id })
      .from(evidenceClaims)
      .where(
        and(
          eq(evidenceClaims.sourceId, sourceId),
          eq(evidenceClaims.organizationId, Number(tenantId)),
          eq(evidenceClaims.isCurrent, true)
        )
      );

    if (claims.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const claimIds = claims.map(c => c.id);
    const linksRows = await db
      .select()
      .from(evidenceClaimLinks)
      .where(
        and(
          inArray(evidenceClaimLinks.claimId, claimIds),
          eq(evidenceClaimLinks.organizationId, Number(tenantId)),
          sql`${evidenceClaimLinks.deletedAt} IS NULL`
        )
      )
      .orderBy(desc(evidenceClaimLinks.createdAt));

    const links = linksRows.map(link => ({
      id: String(link.id),
      evidenceId: String(sourceId),
      targetType: link.sectionId ? 'section' : 'claim',
      targetId: String(link.documentId),
      targetPath: link.sectionId ?? null,
      linkType: link.linkType,
      strength: Number(link.strength),
      createdAt: link.createdAt,
    }));

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
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const userId = Number((req as any).user?.id) || null;
    const evidenceId = Number(data.evidenceId);
    const targetDocumentId = Number(data.targetId);
    if (!Number.isFinite(targetDocumentId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'targetId must be a numeric document id' },
      });
    }

    const [source] = await db
      .select()
      .from(evidenceSources)
      .where(
        and(
          eq(evidenceSources.id, evidenceId),
          eq(evidenceSources.organizationId, Number(tenantId))
        )
      )
      .limit(1);
    if (!source) {
      return res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: 'Evidence not found' } });
    }

    let claimId: number;
    const [existingClaim] = await db
      .select()
      .from(evidenceClaims)
      .where(
        and(
          eq(evidenceClaims.sourceId, evidenceId),
          eq(evidenceClaims.organizationId, Number(tenantId)),
          eq(evidenceClaims.isCurrent, true)
        )
      )
      .limit(1);

    if (existingClaim) {
      claimId = existingClaim.id;
    } else {
      const [createdClaim] = await db
        .insert(evidenceClaims)
        .values({
          sourceId: evidenceId,
          programId: source.programId,
          organizationId: Number(tenantId),
          claimText: source.contentText || source.title,
          claimType: 'manual_link',
          extractionMethod: 'manual',
          extractedBy: userId,
        })
        .returning();
      claimId = createdClaim.id;
    }

    const [savedLink] = await db
      .insert(evidenceClaimLinks)
      .values({
        claimId,
        documentId: targetDocumentId,
        sectionId: data.targetPath || null,
        programId: source.programId,
        organizationId: Number(tenantId),
        linkType: data.linkType,
        strength: data.strength === 'strong' ? '1.00' : data.strength === 'moderate' ? '0.66' : '0.33',
        createdBy: userId,
      })
      .returning();

    const link = {
      id: String(savedLink.id),
      evidenceId: String(evidenceId),
      targetType: data.targetType,
      targetId: String(savedLink.documentId),
      targetPath: savedLink.sectionId,
      linkType: savedLink.linkType,
      strength: Number(savedLink.strength),
      createdBy: userId,
      createdAt: savedLink.createdAt,
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
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
    const linkId = Number(req.params.linkId);
    if (!Number.isFinite(linkId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid link id' },
      });
    }
    const userId = Number((req as any).user?.id) || null;
    await db
      .update(evidenceClaimLinks)
      .set({ deletedAt: new Date(), deletedBy: userId })
      .where(
        and(
          eq(evidenceClaimLinks.id, linkId),
          eq(evidenceClaimLinks.organizationId, Number(tenantId))
        )
      );

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
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });
    const q = String(req.query.q || '').trim();
    const whereClauses = [eq(evidenceSources.organizationId, Number(tenantId))];
    if (q) whereClauses.push(ilike(evidenceSources.title, `%${q}%`));

    const items = await db
      .select()
      .from(evidenceSources)
      .where(and(...whereClauses))
      .orderBy(desc(evidenceSources.createdAt))
      .limit(50);

    const facetRows = await db
      .select({
        value: evidenceSources.sourceType,
        count: sql<number>`count(*)`,
      })
      .from(evidenceSources)
      .where(and(...whereClauses))
      .groupBy(evidenceSources.sourceType);

    const results = {
      items,
      facets: {
        type: facetRows.map(r => ({ value: r.value, count: Number(r.count) })),
      },
      total: items.length,
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
    const programId = req.query.programId ? Number(req.query.programId) : undefined;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const whereClauses = [eq(evidenceSources.organizationId, Number(tenantId))];
    if (programId && Number.isFinite(programId)) {
      whereClauses.push(eq(evidenceSources.programId, programId));
    }

    const [totals] = await db
      .select({
        total: sql<number>`count(*)`,
        totalPages: sql<number>`coalesce(sum(${evidenceSources.pageCount}), 0)`,
      })
      .from(evidenceSources)
      .where(and(...whereClauses));

    const byTypeRows = await db
      .select({
        value: evidenceSources.sourceType,
        count: sql<number>`count(*)`,
      })
      .from(evidenceSources)
      .where(and(...whereClauses))
      .groupBy(evidenceSources.sourceType);

    const byType = Object.fromEntries(byTypeRows.map(r => [r.value, Number(r.count)]));
    const stats = {
      total: Number(totals?.total ?? 0),
      totalPages: Number(totals?.totalPages ?? 0),
      byType,
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
