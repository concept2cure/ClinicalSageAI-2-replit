/**
 * Programs API Routes - Enterprise Implementation
 *
 * Full CRUD operations for regulatory programs with real database queries,
 * audit logging, and tenant isolation.
 *
 * @version 2.0.0
 * @module server/routes/programsV2
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, desc, asc, sql, like, or, count } from 'drizzle-orm';
import { db } from '../db';
import {
  regulatoryPrograms,
  evidenceObjects,
  programMilestones,
  programActivityLog,
  insertRegulatoryProgramSchema,
  insertProgramMilestoneSchema,
  insertProgramActivitySchema,
  RegulatoryProgram,
  ProgramMilestone,
  ProgramActivity,
} from '../../shared/schema/programs';
import { requireTenant, TenantRequest } from '../middleware/tenantIsolation';
import { validateRequest } from '../middleware/apiValidation';
import { logProgramActivity, logDataChange } from '../services/audit/auditLoggerV2';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('programs-api');
const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const listProgramsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['draft', 'active', 'in_review', 'submitted', 'approved', 'rejected', 'archived'])
    .optional(),
  programType: z.enum(['CER', '510K', 'IND', 'NDA', 'BLA', 'PMA', 'DE_NOVO']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['name', 'createdAt', 'targetSubmissionDate', 'status', 'priority'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const createProgramSchema = z.object({
  name: z.string().min(3).max(200),
  code: z.string().min(3).max(50),
  description: z.string().optional(),
  programType: z.enum(['CER', '510K', 'IND', 'NDA', 'BLA', 'PMA', 'DE_NOVO']),
  productType: z.enum(['drug', 'biologic', 'device', 'ivd', 'combination']),
  primaryAgency: z.string().min(2),
  productName: z.string().min(2),
  targetSubmissionDate: z.string().datetime().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  tags: z.array(z.string()).optional(),
});

const updateProgramSchema = createProgramSchema.partial().extend({
  status: z
    .enum(['draft', 'active', 'in_review', 'submitted', 'approved', 'rejected', 'archived'])
    .optional(),
  phase: z
    .enum(['planning', 'evidence_collection', 'authoring', 'review', 'submission', 'post_market'])
    .optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
});

const createMilestoneSchema = z.object({
  name: z.string().min(3).max(200),
  description: z.string().optional(),
  category: z.enum([
    'planning',
    'evidence',
    'authoring',
    'review',
    'submission',
    'agency_response',
  ]),
  targetDate: z.string().datetime().optional(),
  assigneeId: z.number().int().optional(),
  assigneeName: z.string().optional(),
});

const updateMilestoneSchema = createMilestoneSchema.partial().extend({
  status: z
    .enum(['pending', 'in_progress', 'completed', 'overdue', 'at_risk', 'cancelled'])
    .optional(),
  progress: z.number().int().min(0).max(100).optional(),
  actualDate: z.string().datetime().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log program activity to both audit log and activity table
 */
async function logActivity(
  programId: string,
  organizationId: number,
  activityType: string,
  title: string,
  userId: number | undefined,
  userName: string,
  details?: Record<string, unknown>
) {
  try {
    // Log to activity table
    await db.insert(programActivityLog).values({
      programId,
      organizationId,
      activityType,
      title,
      description: title,
      details,
      userId,
      userName,
    });

    // Log to audit trail
    await logProgramActivity(
      String(userId || 'system'),
      String(organizationId),
      programId,
      title,
      activityType,
      details
    );
  } catch (error) {
    logger.error('Failed to log activity', { error, programId, activityType });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAMS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs
 * List all programs for the organization with filtering and pagination
 */
router.get(
  '/',
  requireTenant,
  validateRequest({ query: listProgramsQuerySchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { page, limit, status, programType, priority, search, sortBy, sortOrder } =
        req.query as z.infer<typeof listProgramsQuerySchema>;
      const organizationId = req.organizationId!;
      const offset = (page - 1) * limit;

      // Build conditions
      const conditions = [eq(regulatoryPrograms.organizationId, organizationId)];

      if (status) {
        conditions.push(eq(regulatoryPrograms.status, status));
      }
      if (programType) {
        conditions.push(eq(regulatoryPrograms.programType, programType));
      }
      if (priority) {
        conditions.push(eq(regulatoryPrograms.priority, priority));
      }
      if (search) {
        conditions.push(
          or(
            like(regulatoryPrograms.name, `%${search}%`),
            like(regulatoryPrograms.code, `%${search}%`),
            like(regulatoryPrograms.productName, `%${search}%`)
          )!
        );
      }

      // Get total count
      const [countResult] = await db
        .select({ count: count() })
        .from(regulatoryPrograms)
        .where(and(...conditions));
      const total = countResult?.count || 0;

      // Build sort
      const sortColumn =
        {
          name: regulatoryPrograms.name,
          createdAt: regulatoryPrograms.createdAt,
          targetSubmissionDate: regulatoryPrograms.targetSubmissionDate,
          status: regulatoryPrograms.status,
          priority: regulatoryPrograms.priority,
        }[sortBy] || regulatoryPrograms.createdAt;

      const orderFn = sortOrder === 'asc' ? asc : desc;

      // Get programs
      const programs = await db
        .select()
        .from(regulatoryPrograms)
        .where(and(...conditions))
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset);

      res.json({
        data: programs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: offset + programs.length < total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      logger.error('Failed to list programs', { error });
      next(error);
    }
  }
);

/**
 * POST /api/programs
 * Create a new regulatory program
 */
router.post(
  '/',
  requireTenant,
  validateRequest({ body: createProgramSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof createProgramSchema>;

      // Check for duplicate code
      const existing = await db
        .select({ id: regulatoryPrograms.id })
        .from(regulatoryPrograms)
        .where(
          and(
            eq(regulatoryPrograms.organizationId, organizationId),
            eq(regulatoryPrograms.code, data.code)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return res.status(409).json({
          error: 'Conflict',
          message: `A program with code "${data.code}" already exists`,
        });
      }

      // Create program
      const [program] = await db
        .insert(regulatoryPrograms)
        .values({
          organizationId,
          name: data.name,
          code: data.code,
          description: data.description,
          programType: data.programType,
          productType: data.productType,
          primaryAgency: data.primaryAgency,
          productName: data.productName,
          targetSubmissionDate: data.targetSubmissionDate
            ? new Date(data.targetSubmissionDate)
            : undefined,
          priority: data.priority,
          tags: data.tags,
          status: 'draft',
          phase: 'planning',
          progressPercent: 0,
          createdBy: String(userId),
        })
        .returning();

      // Log activity
      await logActivity(
        program.id,
        organizationId,
        'created',
        `Program "${program.name}" created`,
        userId,
        userName,
        { programType: program.programType, productName: program.productName }
      );

      logger.info('Program created', { programId: program.id, code: program.code });
      res.status(201).json({ data: program });
    } catch (error) {
      logger.error('Failed to create program', { error });
      next(error);
    }
  }
);

/**
 * GET /api/programs/:id
 * Get a single program by ID
 */
router.get('/:id', requireTenant, async (req: TenantRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const [program] = await db
      .select()
      .from(regulatoryPrograms)
      .where(
        and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
      )
      .limit(1);

    if (!program) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Program not found',
      });
    }

    // Get milestone counts
    const [milestoneStats] = await db
      .select({
        total: count(),
        completed: count(sql`CASE WHEN ${programMilestones.status} = 'completed' THEN 1 END`),
      })
      .from(programMilestones)
      .where(eq(programMilestones.programId, id));

    // Get evidence count
    const [evidenceStats] = await db
      .select({ count: count() })
      .from(evidenceObjects)
      .where(eq(evidenceObjects.programId, id));

    res.json({
      data: {
        ...program,
        _stats: {
          totalMilestones: milestoneStats?.total || 0,
          completedMilestones: milestoneStats?.completed || 0,
          evidenceCount: evidenceStats?.count || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get program', { error, id: req.params.id });
    next(error);
  }
});

/**
 * PATCH /api/programs/:id
 * Update a program
 */
router.patch(
  '/:id',
  requireTenant,
  validateRequest({ body: updateProgramSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof updateProgramSchema>;

      // Get existing program
      const [existing] = await db
        .select()
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      // Check for duplicate code if changing
      if (data.code && data.code !== existing.code) {
        const [duplicate] = await db
          .select({ id: regulatoryPrograms.id })
          .from(regulatoryPrograms)
          .where(
            and(
              eq(regulatoryPrograms.organizationId, organizationId),
              eq(regulatoryPrograms.code, data.code)
            )
          )
          .limit(1);

        if (duplicate) {
          return res.status(409).json({
            error: 'Conflict',
            message: `A program with code "${data.code}" already exists`,
          });
        }
      }

      // Prepare update data
      const updateData: Partial<RegulatoryProgram> = {
        updatedAt: new Date(),
        updatedBy: String(userId),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.code !== undefined) updateData.code = data.code;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.programType !== undefined) updateData.programType = data.programType;
      if (data.productType !== undefined) updateData.productType = data.productType;
      if (data.primaryAgency !== undefined) updateData.primaryAgency = data.primaryAgency;
      if (data.productName !== undefined) updateData.productName = data.productName;
      if (data.targetSubmissionDate !== undefined) {
        updateData.targetSubmissionDate = new Date(data.targetSubmissionDate);
      }
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.phase !== undefined) updateData.phase = data.phase;
      if (data.progressPercent !== undefined) updateData.progressPercent = data.progressPercent;
      if (data.tags !== undefined) updateData.tags = data.tags;

      // Update program
      const [updated] = await db
        .update(regulatoryPrograms)
        .set(updateData)
        .where(eq(regulatoryPrograms.id, id))
        .returning();

      // Log activity
      const changedFields = Object.keys(data);
      await logActivity(
        id,
        organizationId,
        'updated',
        `Program "${updated.name}" updated`,
        userId,
        userName,
        { changedFields }
      );

      // Log data change for audit
      await logDataChange(
        String(userId || 'system'),
        String(organizationId),
        'program',
        id,
        updated.name,
        'update',
        existing,
        updated
      );

      logger.info('Program updated', { programId: id, changedFields });
      res.json({ data: updated });
    } catch (error) {
      logger.error('Failed to update program', { error, id: req.params.id });
      next(error);
    }
  }
);

/**
 * DELETE /api/programs/:id
 * Delete a program (soft delete by archiving)
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

      // Get existing program
      const [existing] = await db
        .select()
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      // Soft delete - set status to archived
      const [archived] = await db
        .update(regulatoryPrograms)
        .set({
          status: 'archived',
          updatedAt: new Date(),
          updatedBy: String(userId),
        })
        .where(eq(regulatoryPrograms.id, id))
        .returning();

      // Log activity
      await logActivity(
        id,
        organizationId,
        'archived',
        `Program "${existing.name}" archived`,
        userId,
        userName
      );

      await logDataChange(
        String(userId || 'system'),
        String(organizationId),
        'program',
        id,
        existing.name,
        'delete',
        existing,
        archived
      );

      logger.info('Program archived', { programId: id });
      res.json({ data: archived, message: 'Program archived successfully' });
    } catch (error) {
      logger.error('Failed to delete program', { error, id: req.params.id });
      next(error);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONES ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/:id/milestones
 * List all milestones for a program
 */
router.get(
  '/:id/milestones',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;

      // Verify program exists and belongs to org
      const [program] = await db
        .select({ id: regulatoryPrograms.id })
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!program) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      const milestones = await db
        .select()
        .from(programMilestones)
        .where(eq(programMilestones.programId, id))
        .orderBy(asc(programMilestones.targetDate));

      res.json({ data: milestones });
    } catch (error) {
      logger.error('Failed to get milestones', { error, programId: req.params.id });
      next(error);
    }
  }
);

/**
 * POST /api/programs/:id/milestones
 * Create a new milestone
 */
router.post(
  '/:id/milestones',
  requireTenant,
  validateRequest({ body: createMilestoneSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof createMilestoneSchema>;

      // Verify program exists
      const [program] = await db
        .select({ id: regulatoryPrograms.id, name: regulatoryPrograms.name })
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!program) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      // Create milestone
      const [milestone] = await db
        .insert(programMilestones)
        .values({
          programId: id,
          name: data.name,
          description: data.description,
          category: data.category,
          targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
          assigneeId: data.assigneeId,
          assigneeName: data.assigneeName,
          status: 'pending',
          progress: 0,
          createdBy: String(userId),
        })
        .returning();

      // Update program milestone count
      const [stats] = await db
        .select({ total: count() })
        .from(programMilestones)
        .where(eq(programMilestones.programId, id));

      await db
        .update(regulatoryPrograms)
        .set({ totalMilestones: stats?.total || 0, updatedAt: new Date() })
        .where(eq(regulatoryPrograms.id, id));

      // Log activity
      await logActivity(
        id,
        organizationId,
        'milestone_added',
        `Milestone "${milestone.name}" added to program`,
        userId,
        userName,
        { milestoneId: milestone.id, category: milestone.category }
      );

      logger.info('Milestone created', { milestoneId: milestone.id, programId: id });
      res.status(201).json({ data: milestone });
    } catch (error) {
      logger.error('Failed to create milestone', { error, programId: req.params.id });
      next(error);
    }
  }
);

/**
 * PATCH /api/programs/:id/milestones/:milestoneId
 * Update a milestone
 */
router.patch(
  '/:id/milestones/:milestoneId',
  requireTenant,
  validateRequest({ body: updateMilestoneSchema }),
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id, milestoneId } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';
      const data = req.body as z.infer<typeof updateMilestoneSchema>;

      // Verify program and milestone exist
      const [program] = await db
        .select({ id: regulatoryPrograms.id })
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!program) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      const [existingMilestone] = await db
        .select()
        .from(programMilestones)
        .where(and(eq(programMilestones.id, milestoneId), eq(programMilestones.programId, id)))
        .limit(1);

      if (!existingMilestone) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Milestone not found',
        });
      }

      // Prepare update
      const updateData: Partial<ProgramMilestone> = {
        updatedAt: new Date(),
        updatedBy: String(userId),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.category !== undefined) updateData.category = data.category;
      if (data.targetDate !== undefined) updateData.targetDate = new Date(data.targetDate);
      if (data.actualDate !== undefined) updateData.actualDate = new Date(data.actualDate);
      if (data.status !== undefined) updateData.status = data.status;
      if (data.progress !== undefined) updateData.progress = data.progress;
      if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
      if (data.assigneeName !== undefined) updateData.assigneeName = data.assigneeName;

      // Update milestone
      const [updated] = await db
        .update(programMilestones)
        .set(updateData)
        .where(eq(programMilestones.id, milestoneId))
        .returning();

      // Update program completed milestone count if status changed
      if (data.status) {
        const [stats] = await db
          .select({
            total: count(),
            completed: count(sql`CASE WHEN ${programMilestones.status} = 'completed' THEN 1 END`),
          })
          .from(programMilestones)
          .where(eq(programMilestones.programId, id));

        await db
          .update(regulatoryPrograms)
          .set({
            totalMilestones: stats?.total || 0,
            completedMilestones: stats?.completed || 0,
            updatedAt: new Date(),
          })
          .where(eq(regulatoryPrograms.id, id));

        // Log milestone completion
        if (data.status === 'completed') {
          await logActivity(
            id,
            organizationId,
            'milestone_completed',
            `Milestone "${updated.name}" completed`,
            userId,
            userName,
            { milestoneId: updated.id }
          );
        }
      }

      logger.info('Milestone updated', { milestoneId, programId: id });
      res.json({ data: updated });
    } catch (error) {
      logger.error('Failed to update milestone', { error, milestoneId: req.params.milestoneId });
      next(error);
    }
  }
);

/**
 * DELETE /api/programs/:id/milestones/:milestoneId
 * Delete a milestone
 */
router.delete(
  '/:id/milestones/:milestoneId',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id, milestoneId } = req.params;
      const organizationId = req.organizationId!;
      const userId = req.user?.id;
      const userName = req.user?.name || 'Unknown';

      // Verify program exists
      const [program] = await db
        .select({ id: regulatoryPrograms.id })
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!program) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      // Get and delete milestone
      const [deleted] = await db
        .delete(programMilestones)
        .where(and(eq(programMilestones.id, milestoneId), eq(programMilestones.programId, id)))
        .returning();

      if (!deleted) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Milestone not found',
        });
      }

      // Update program counts
      const [stats] = await db
        .select({
          total: count(),
          completed: count(sql`CASE WHEN ${programMilestones.status} = 'completed' THEN 1 END`),
        })
        .from(programMilestones)
        .where(eq(programMilestones.programId, id));

      await db
        .update(regulatoryPrograms)
        .set({
          totalMilestones: stats?.total || 0,
          completedMilestones: stats?.completed || 0,
          updatedAt: new Date(),
        })
        .where(eq(regulatoryPrograms.id, id));

      // Log activity
      await logActivity(
        id,
        organizationId,
        'milestone_deleted',
        `Milestone "${deleted.name}" deleted`,
        userId,
        userName,
        { milestoneId: deleted.id }
      );

      logger.info('Milestone deleted', { milestoneId, programId: id });
      res.json({ message: 'Milestone deleted successfully' });
    } catch (error) {
      logger.error('Failed to delete milestone', { error, milestoneId: req.params.milestoneId });
      next(error);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/:id/activity
 * Get activity log for a program
 */
router.get(
  '/:id/activity',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const organizationId = req.organizationId!;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

      // Verify program exists
      const [program] = await db
        .select({ id: regulatoryPrograms.id })
        .from(regulatoryPrograms)
        .where(
          and(eq(regulatoryPrograms.id, id), eq(regulatoryPrograms.organizationId, organizationId))
        )
        .limit(1);

      if (!program) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Program not found',
        });
      }

      const activities = await db
        .select()
        .from(programActivityLog)
        .where(eq(programActivityLog.programId, id))
        .orderBy(desc(programActivityLog.timestamp))
        .limit(limit);

      res.json({ data: activities });
    } catch (error) {
      logger.error('Failed to get activity', { error, programId: req.params.id });
      next(error);
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// STATS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/stats/overview
 * Get program statistics for the organization
 */
router.get(
  '/stats/overview',
  requireTenant,
  async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organizationId!;

      // Get counts by status
      const statusCounts = await db
        .select({
          status: regulatoryPrograms.status,
          count: count(),
        })
        .from(regulatoryPrograms)
        .where(eq(regulatoryPrograms.organizationId, organizationId))
        .groupBy(regulatoryPrograms.status);

      // Get counts by type
      const typeCounts = await db
        .select({
          programType: regulatoryPrograms.programType,
          count: count(),
        })
        .from(regulatoryPrograms)
        .where(eq(regulatoryPrograms.organizationId, organizationId))
        .groupBy(regulatoryPrograms.programType);

      // Get counts by priority
      const priorityCounts = await db
        .select({
          priority: regulatoryPrograms.priority,
          count: count(),
        })
        .from(regulatoryPrograms)
        .where(eq(regulatoryPrograms.organizationId, organizationId))
        .groupBy(regulatoryPrograms.priority);

      // Calculate totals
      const total = statusCounts.reduce((sum, s) => sum + Number(s.count), 0);
      const active = statusCounts.find(s => s.status === 'active')?.count || 0;
      const inReview = statusCounts.find(s => s.status === 'in_review')?.count || 0;
      const submitted = statusCounts.find(s => s.status === 'submitted')?.count || 0;

      res.json({
        data: {
          total,
          active: Number(active),
          inReview: Number(inReview),
          submitted: Number(submitted),
          byStatus: Object.fromEntries(statusCounts.map(s => [s.status, Number(s.count)])),
          byType: Object.fromEntries(typeCounts.map(t => [t.programType, Number(t.count)])),
          byPriority: Object.fromEntries(priorityCounts.map(p => [p.priority, Number(p.count)])),
        },
      });
    } catch (error) {
      logger.error('Failed to get stats', { error });
      next(error);
    }
  }
);

export default router;
