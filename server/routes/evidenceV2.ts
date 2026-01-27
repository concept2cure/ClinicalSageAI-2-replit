/**
 * Evidence API Routes - Enterprise Implementation
 *
 * Full CRUD operations for evidence objects with real database queries,
 * linking, verification, search, and audit logging.
 *
 * @version 2.0.0
 * @module server/routes/evidenceV2
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, asc, sql, like, or, count, isNull, ne } from 'drizzle-orm';
import { db } from '../db';
import {
  evidenceObjects,
  evidenceLinks,
  regulatoryPrograms,
  programActivityLog,
  insertEvidenceObjectSchema,
  insertEvidenceLinkSchema,
  EvidenceObject,
  EvidenceLink,
} from '../../shared/schema/programs';
import { requireTenant, TenantRequest } from '../middleware/tenantIsolation';
import { validateRequest } from '../middleware/apiValidation';
import { logEvidenceActivity, logDataChange } from '../services/audit/auditLoggerV2';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('evidence-api');
const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const listEvidenceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  programId: z.string().uuid().optional(),
  evidenceType: z
    .enum([
      'literature',
      'test_report',
      'clinical_data',
      'standard',
      'cer_section',
      'approval_letter',
      'guidance',
      'expert_opinion',
    ])
    .optional(),
  evidenceCategory: z
    .enum([
      'clinical',
      'nonclinical',
      'performance',
      'biocompatibility',
      'safety',
      'regulatory',
      'manufacturing',
    ])
    .optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'superseded']).optional(),
  isVerified: z.coerce.boolean().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['title', 'createdAt', 'qualityScore', 'relevanceScore', 'evidenceType'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createEvidenceSchema = z.object({
  title: z.string().min(3).max(500),
  code: z.string().max(100).optional(),
  description: z.string().optional(),
  programId: z.string().uuid().optional(),
  evidenceType: z.enum([
    'literature',
    'test_report',
    'clinical_data',
    'standard',
    'cer_section',
    'approval_letter',
    'guidance',
    'expert_opinion',
  ]),
  evidenceCategory: z.enum([
    'clinical',
    'nonclinical',
    'performance',
    'biocompatibility',
    'safety',
    'regulatory',
    'manufacturing',
  ]),
  evidenceLevel: z.enum(['I', 'II', 'III', 'IV', 'V']).optional(),
  sourceType: z.enum(['internal', 'external', 'literature', 'agency', 'standard_body']),
  sourceReference: z.string().optional(),
  sourceCitation: z.string().optional(),
  documentId: z.number().int().optional(),
  documentVersion: z.string().optional(),
  pageRange: z.string().optional(),
  excerpt: z.string().optional(),
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
});

const updateEvidenceSchema = createEvidenceSchema.partial().extend({
  status: z.enum(['pending', 'approved', 'rejected', 'superseded']).optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
});

const createLinkSchema = z.object({
  targetType: z.enum(['claim', 'section', 'requirement', 'standard', 'question']),
  targetId: z.string(),
  targetPath: z.string().optional(),
  linkType: z.enum(['supports', 'contradicts', 'references', 'supersedes']).default('supports'),
  strength: z.enum(['strong', 'moderate', 'weak']).default('moderate'),
  rationale: z.string().optional(),
});

const searchEvidenceSchema = z.object({
  query: z.string().min(1),
  programId: z.string().uuid().optional(),
  evidenceType: z.array(z.string()).optional(),
  evidenceCategory: z.array(z.string()).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log evidence activity to both audit log and program activity
 */
async function logActivity(
  evidenceId: string,
  organizationId: number,
  programId: string | null,
  activityType: string,
  title: string,
  userId: number | undefined,
  userName: string,
  details?: Record<string, unknown>
) {
  try {
    // Log to program activity if linked to program
    if (programId) {
      await db.insert(programActivityLog).values({
        programId,
        organizationId,
        activityType: `evidence_${activityType}`,
        entityType: 'evidence',
        entityId: evidenceId,
        title,
        description: title,
        details,
        userId,
        userName,
      });
    }

    // Log to audit trail
    await logEvidenceActivity(
      String(userId || 'system'),
      String(organizationId),
      evidenceId,
      title,
      activityType,
      details
    );
  } catch (error) {
    logger.error('Failed to log activity', { error, evidenceId, activityType });
  }
}

/**
 * Generate evidence code if not provided
 */
function generateEvidenceCode(evidenceType: string): string {
  const prefix =
    {
      literature: 'LIT',
      test_report: 'TEST',
      clinical_data: 'CLIN',
      standard: 'STD',
      cer_section: 'CER',
      approval_letter: 'APR',
      guidance: 'GUID',
      expert_opinion: 'EXP',
    }[evidenceType] || 'EVD';

  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${timestamp}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence
 * List all evidence objects for the organization
 */
router.get(
  '/',
  requireTenant,
  validateRequest({ query: listEvidenceQuerySchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const {
        page,
        limit,
        programId,
        evidenceType,
        evidenceCategory,
        status,
        isVerified,
        search,
        sortBy,
        sortOrder,
      } = req.query as z.infer<typeof listEvidenceQuerySchema>;
      const organizationId = req.organizationId!;
      const offset = (page - 1) * limit;

      // Build conditions
      const conditions = [eq(evidenceObjects.organizationId, organizationId)];

      if (programId) {
        conditions.push(eq(evidenceObjects.programId, programId));
      }
      if (evidenceType) {
        conditions.push(eq(evidenceObjects.evidenceType, evidenceType));
      }
      if (evidenceCategory) {
        conditions.push(eq(evidenceObjects.evidenceCategory, evidenceCategory));
      }
      if (status) {
        conditions.push(eq(evidenceObjects.status, status));
      }
      if (isVerified !== undefined) {
        conditions.push(eq(evidenceObjects.isVerified, isVerified));
      }
      if (search) {
        conditions.push(
          or(
            like(evidenceObjects.title, `%${search}%`),
            like(evidenceObjects.code, `%${search}%`),
            like(evidenceObjects.sourceCitation, `%${search}%`),
            like(evidenceObjects.excerpt, `%${search}%`)
          )!
        );
      }

      // Get total count
      const [countResult] = await db
        .select({ count: count() })
        .from(evidenceObjects)
        .where(and(...conditions));
      const total = countResult?.count || 0;

      // Build sort
      const sortColumn =
        {
          title: evidenceObjects.title,
          createdAt: evidenceObjects.createdAt,
          qualityScore: evidenceObjects.qualityScore,
          relevanceScore: evidenceObjects.relevanceScore,
          evidenceType: evidenceObjects.evidenceType,
        }[sortBy] || evidenceObjects.createdAt;

      const orderFn = sortOrder === 'asc' ? asc : desc;

      // Get evidence
      const evidence = await db
        .select()
        .from(evidenceObjects)
        .where(and(...conditions))
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      res.json({
        data: evidence,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + evidence.length < total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      logger.error('Failed to list evidence', { error });
      next(error);
    }
  }
);

/**
 * POST /api/evidence
 * Create a new evidence object
 */
router.post(
  '/',
  requireTenant,
  validateRequest({ body: createEvidenceSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof createEvidenceSchema>;

      // Verify program if provided
      if (data.programId) {
        const [program] = await db
          .select({ id: regulatoryPrograms.id })
          .from(regulatoryPrograms)
          .where(
            and(
              eq(regulatoryPrograms.id, data.programId),
              eq(regulatoryPrograms.organizationId, organizationId)
            )
          )
          .limit(1);

        if (!program) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Program not found',
          });
        }
      }

      // Generate code if not provided
      const code = data.code || generateEvidenceCode(data.evidenceType);

      // Create evidence
      const [evidence] = await db
        .insert(evidenceObjects)
        .values({
          organizationId,
          programId: data.programId,
          title: data.title,
          code,
          description: data.description,
          evidenceType: data.evidenceType,
          evidenceCategory: data.evidenceCategory,
          evidenceLevel: data.evidenceLevel,
          sourceType: data.sourceType,
          sourceReference: data.sourceReference,
          sourceCitation: data.sourceCitation,
          documentId: data.documentId,
          documentVersion: data.documentVersion,
          pageRange: data.pageRange,
          excerpt: data.excerpt,
          authors: data.authors,
          publicationDate: data.publicationDate ? new Date(data.publicationDate) : undefined,
          journal: data.journal,
          doi: data.doi,
          pmid: data.pmid,
          abstract: data.abstract,
          testType: data.testType,
          testLab: data.testLab,
          testDate: data.testDate ? new Date(data.testDate) : undefined,
          testResults: data.testResults,
          tags: data.tags,
          status: 'pending',
          createdBy: String(userId),
        })
        .returning();

      // Log activity
      await logActivity(
        evidence.id,
        organizationId,
        data.programId || null,
        'created',
        `Evidence "${evidence.title}" created`,
        userId,
        userName,
        { evidenceType: evidence.evidenceType, evidenceCategory: evidence.evidenceCategory }
      );

      logger.info('Evidence created', { evidenceId: evidence.id, code: evidence.code });
      res.status(201).json({ data: evidence });
    } catch (error) {
      logger.error('Failed to create evidence', { error });
      next(error);
    }
  }
);

/**
 * GET /api/evidence/:id
 * Get a single evidence object by ID
 */
router.get('/:id', requireTenant, async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const [evidence] = await db
      .select()
      .from(evidenceObjects)
      .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
      .limit(1);

    if (!evidence) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Evidence not found',
      });
    }

    // Get link count
    const [linkStats] = await db
      .select({ count: count() })
      .from(evidenceLinks)
      .where(eq(evidenceLinks.evidenceId, id));

    res.json({
      data: {
        ...evidence,
        _stats: {
          linkCount: linkStats?.count || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get evidence', { error, id: req.params.id });
    next(error);
  }
});

/**
 * PATCH /api/evidence/:id
 * Update an evidence object
 */
router.patch(
  '/:id',
  requireTenant,
  validateRequest({ body: updateEvidenceSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof updateEvidenceSchema>;

      // Get existing evidence
      const [existing] = await db
        .select()
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      // Build update data
      const updateData: Partial<EvidenceObject> = {
        updatedAt: new Date(),
        updatedBy: String(userId),
      };

      // Copy all updateable fields
      const fields = [
        'title',
        'code',
        'description',
        'programId',
        'evidenceType',
        'evidenceCategory',
        'evidenceLevel',
        'sourceType',
        'sourceReference',
        'sourceCitation',
        'documentId',
        'documentVersion',
        'pageRange',
        'excerpt',
        'authors',
        'journal',
        'doi',
        'pmid',
        'abstract',
        'testType',
        'testLab',
        'testResults',
        'tags',
        'status',
        'qualityScore',
        'relevanceScore',
      ];

      for (const field of fields) {
        if ((data as any)[field] !== undefined) {
          (updateData as any)[field] = (data as any)[field];
        }
      }

      // Handle date fields
      if (data.publicationDate !== undefined) {
        updateData.publicationDate = new Date(data.publicationDate);
      }
      if (data.testDate !== undefined) {
        updateData.testDate = new Date(data.testDate);
      }

      // Update evidence
      const [updated] = await db
        .update(evidenceObjects)
        .set(updateData)
        .where(eq(evidenceObjects.id, id))
        .returning();

      // Log activity
      const changedFields = Object.keys(data);
      await logActivity(
        id,
        organizationId,
        updated.programId || null,
        'updated',
        `Evidence "${updated.title}" updated`,
        userId,
        userName,
        { changedFields }
      );

      // Log data change for audit
      await logDataChange(
        String(userId || 'system'),
        String(organizationId),
        'evidence',
        id,
        updated.title,
        'update',
        existing,
        updated
      );

      logger.info('Evidence updated', { evidenceId: id, changedFields });
      res.json({ data: updated });
    } catch (error) {
      logger.error('Failed to update evidence', { error, id: req.params.id });
      next(error);
    }
  }
);

/**
 * DELETE /api/evidence/:id
 * Delete an evidence object
 */
router.delete(
  '/:id',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      // Get existing evidence
      const [existing] = await db
        .select()
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      // Delete evidence (will cascade delete links due to foreign key)
      await db.delete(evidenceObjects).where(eq(evidenceObjects.id, id));

      // Log activity
      await logActivity(
        id,
        organizationId,
        existing.programId || null,
        'deleted',
        `Evidence "${existing.title}" deleted`,
        userId,
        userName
      );

      await logDataChange(
        String(userId || 'system'),
        String(organizationId),
        'evidence',
        id,
        existing.title,
        'delete',
        existing,
        null
      );

      logger.info('Evidence deleted', { evidenceId: id });
      res.json({ message: 'Evidence deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete evidence', { error, id: req.params.id });
      next(error);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/evidence/:id/verify
 * Verify an evidence object
 */
router.post(
  '/:id/verify',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      // Get existing evidence
      const [existing] = await db
        .select()
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      // Update verification status
      const [updated] = await db
        .update(evidenceObjects)
        .set({
          isVerified: true,
          verifiedBy: userName,
          verifiedAt: new Date(),
          status: 'approved',
          updatedAt: new Date(),
          updatedBy: String(userId),
        })
        .where(eq(evidenceObjects.id, id))
        .returning();

      // Log activity
      await logActivity(
        id,
        organizationId,
        updated.programId || null,
        'verified',
        `Evidence "${updated.title}" verified by ${userName}`,
        userId,
        userName
      );

      logger.info('Evidence verified', { evidenceId: id, verifiedBy: userName });
      res.json({ data: updated });
    } catch (error) {
      logger.error('Failed to verify evidence', { error, id: req.params.id });
      next(error);
    }
  }
);

/**
 * POST /api/evidence/:id/reject
 * Reject an evidence object
 */
router.post(
  '/:id/reject',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      // Get existing evidence
      const [existing] = await db
        .select()
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      // Update to rejected
      const [updated] = await db
        .update(evidenceObjects)
        .set({
          status: 'rejected',
          updatedAt: new Date(),
          updatedBy: String(userId),
          metadata: {
            ...((existing.metadata as object) || {}),
            rejectionReason: reason,
            rejectedBy: userName,
          },
        })
        .where(eq(evidenceObjects.id, id))
        .returning();

      // Log activity
      await logActivity(
        id,
        organizationId,
        updated.programId || null,
        'rejected',
        `Evidence "${updated.title}" rejected by ${userName}`,
        userId,
        userName,
        { reason }
      );

      logger.info('Evidence rejected', { evidenceId: id, rejectedBy: userName, reason });
      res.json({ data: updated });
    } catch (error) {
      logger.error('Failed to reject evidence', { error, id: req.params.id });
      next(error);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// LINKS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/evidence/:id/links
 * Get all links for an evidence object
 */
router.get(
  '/:id/links',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      // Verify evidence exists
      const [evidence] = await db
        .select({ id: evidenceObjects.id })
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!evidence) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      const links = await db
        .select()
        .from(evidenceLinks)
        .where(eq(evidenceLinks.evidenceId, id))
        .orderBy(desc(evidenceLinks.createdAt));

      res.json({ data: links });
    } catch (error) {
      logger.error('Failed to get links', { error, evidenceId: req.params.id });
      next(error);
    }
  }
);

/**
 * POST /api/evidence/:id/links
 * Create a new link for an evidence object
 */
router.post(
  '/:id/links',
  requireTenant,
  validateRequest({ body: createLinkSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof createLinkSchema>;

      // Verify evidence exists
      const [evidence] = await db
        .select({
          id: evidenceObjects.id,
          title: evidenceObjects.title,
          programId: evidenceObjects.programId,
        })
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!evidence) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      // Check for duplicate link
      const [existingLink] = await db
        .select({ id: evidenceLinks.id })
        .from(evidenceLinks)
        .where(
          and(
            eq(evidenceLinks.evidenceId, id),
            eq(evidenceLinks.targetType, data.targetType),
            eq(evidenceLinks.targetId, data.targetId)
          )
        )
        .limit(1);

      if (existingLink) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'This evidence is already linked to the target',
        });
      }

      // Create link
      const [link] = await db
        .insert(evidenceLinks)
        .values({
          organizationId,
          evidenceId: id,
          targetType: data.targetType,
          targetId: data.targetId,
          targetPath: data.targetPath,
          linkType: data.linkType,
          strength: data.strength,
          rationale: data.rationale,
          createdBy: String(userId),
        })
        .returning();

      // Log activity
      await logActivity(
        id,
        organizationId,
        evidence.programId || null,
        'linked',
        `Evidence "${evidence.title}" linked to ${data.targetType} ${data.targetId}`,
        userId,
        userName,
        { linkId: link.id, targetType: data.targetType, linkType: data.linkType }
      );

      logger.info('Evidence link created', { linkId: link.id, evidenceId: id });
      res.status(201).json({ data: link });
    } catch (error) {
      logger.error('Failed to create link', { error, evidenceId: req.params.id });
      next(error);
    }
  }
);

/**
 * DELETE /api/evidence/:id/links/:linkId
 * Delete a link
 */
router.delete(
  '/:id/links/:linkId',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id, linkId } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      // Verify evidence exists
      const [evidence] = await db
        .select({
          id: evidenceObjects.id,
          title: evidenceObjects.title,
          programId: evidenceObjects.programId,
        })
        .from(evidenceObjects)
        .where(and(eq(evidenceObjects.id, id), eq(evidenceObjects.organizationId, organizationId)))
        .limit(1);

      if (!evidence) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Evidence not found',
        });
      }

      // Delete link
      const [deleted] = await db
        .delete(evidenceLinks)
        .where(and(eq(evidenceLinks.id, linkId), eq(evidenceLinks.evidenceId, id)))
        .returning();

      if (!deleted) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Link not found',
        });
      }

      // Log activity
      await logActivity(
        id,
        organizationId,
        evidence.programId || null,
        'unlinked',
        `Evidence "${evidence.title}" unlinked from ${deleted.targetType} ${deleted.targetId}`,
        userId,
        userName,
        { linkId: deleted.id, targetType: deleted.targetType }
      );

      logger.info('Evidence link deleted', { linkId, evidenceId: id });
      res.json({ message: 'Link deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete link', { error, linkId: req.params.linkId });
      next(error);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH & STATS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/evidence/search
 * Search evidence objects
 */
router.post(
  '/search',
  requireTenant,
  validateRequest({ body: searchEvidenceSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const { query, programId, evidenceType, evidenceCategory, limit } = req.body as z.infer<
        typeof searchEvidenceSchema
      >;

      // Build conditions
      const conditions = [eq(evidenceObjects.organizationId, organizationId)];

      // Text search across multiple fields
      conditions.push(
        or(
          like(evidenceObjects.title, `%${query}%`),
          like(evidenceObjects.description, `%${query}%`),
          like(evidenceObjects.sourceCitation, `%${query}%`),
          like(evidenceObjects.excerpt, `%${query}%`),
          like(evidenceObjects.abstract, `%${query}%`)
        )!
      );

      if (programId) {
        conditions.push(eq(evidenceObjects.programId, programId));
      }
      if (evidenceType && evidenceType.length > 0) {
        conditions.push(sql`${evidenceObjects.evidenceType} = ANY(${evidenceType})`);
      }
      if (evidenceCategory && evidenceCategory.length > 0) {
        conditions.push(sql`${evidenceObjects.evidenceCategory} = ANY(${evidenceCategory})`);
      }

      const results = await db
        .select()
        .from(evidenceObjects)
        .where(and(...conditions))
        .orderBy(desc(evidenceObjects.relevanceScore), desc(evidenceObjects.createdAt))
        .limit(limit);

      res.json({ data: results });
    } catch (error) {
      logger.error('Failed to search evidence', { error });
      next(error);
    }
  }
);

/**
 * GET /api/evidence/stats
 * Get evidence statistics for the organization
 */
router.get(
  '/stats',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;

      // Get counts by type
      const typeCounts = await db
        .select({
          evidenceType: evidenceObjects.evidenceType,
          count: count(),
        })
        .from(evidenceObjects)
        .where(eq(evidenceObjects.organizationId, organizationId))
        .groupBy(evidenceObjects.evidenceType);

      // Get counts by category
      const categoryCounts = await db
        .select({
          evidenceCategory: evidenceObjects.evidenceCategory,
          count: count(),
        })
        .from(evidenceObjects)
        .where(eq(evidenceObjects.organizationId, organizationId))
        .groupBy(evidenceObjects.evidenceCategory);

      // Get counts by status
      const statusCounts = await db
        .select({
          status: evidenceObjects.status,
          count: count(),
        })
        .from(evidenceObjects)
        .where(eq(evidenceObjects.organizationId, organizationId))
        .groupBy(evidenceObjects.status);

      // Get verified count
      const [verifiedStats] = await db
        .select({
          total: count(),
          verified: count(sql`CASE WHEN ${evidenceObjects.isVerified} = true THEN 1 END`),
        })
        .from(evidenceObjects)
        .where(eq(evidenceObjects.organizationId, organizationId));

      // Calculate totals
      const total = typeCounts.reduce((sum, t) => sum + Number(t.count), 0);

      res.json({
        data: {
          total,
          verified: Number(verifiedStats?.verified || 0),
          pending: Number(statusCounts.find(s => s.status === 'pending')?.count || 0),
          approved: Number(statusCounts.find(s => s.status === 'approved')?.count || 0),
          byType: Object.fromEntries(typeCounts.map(t => [t.evidenceType, Number(t.count)])),
          byCategory: Object.fromEntries(
            categoryCounts.map(c => [c.evidenceCategory, Number(c.count)])
          ),
          byStatus: Object.fromEntries(statusCounts.map(s => [s.status, Number(s.count)])),
        },
      });
    } catch (error) {
      logger.error('Failed to get stats', { error });
      next(error);
    }
  }
);

export default router;
