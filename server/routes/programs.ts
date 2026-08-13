/**
 * Program Workbench API Router
 *
 * Unified API for regulatory programs management.
 * Supports CER, 510(k), IND, NDA, BLA, PMA, De Novo programs.
 *
 * @version 1.0.0
 * @module server/routes/programs
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm';
import { db } from '../db';
import { setRequestQuery } from '../utils/expressQuery';
import { cerProjects } from '@shared/schema';

const router = Router();

// Shape of the untyped `metadata` JSON column on cerProjects that this router reads.
interface ProgramMetadata {
  phase?: string;
  priority?: string;
  progressPercent?: number;
  completedMilestones?: number;
  totalMilestones?: number;
  tags?: unknown[];
}

// `metadata` is an untyped JSON column; narrow it to the fields this router uses.
const readMetadata = (metadata: unknown): ProgramMetadata =>
  (metadata as ProgramMetadata | null) ?? {};

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const programTypeEnum = z.enum(['CER', '510K', 'IND', 'NDA', 'BLA', 'PMA', 'DE_NOVO']);
const productTypeEnum = z.enum(['drug', 'biologic', 'device', 'ivd', 'combination']);
const statusEnum = z.enum([
  'draft',
  'active',
  'in_review',
  'submitted',
  'approved',
  'rejected',
  'archived',
]);
const priorityEnum = z.enum(['critical', 'high', 'medium', 'low']);

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  description: z.string().optional(),
  programType: programTypeEnum,
  productType: productTypeEnum,
  deviceClass: z.enum(['I', 'II', 'III']).optional(),
  regulatoryPath: z.string().optional(),
  primaryAgency: z.string().min(1),
  targetAgencies: z.array(z.string()).optional(),
  productName: z.string().min(1),
  productCode: z.string().optional(),
  indication: z.string().optional(),
  intendedUse: z.string().optional(),
  predicateDevices: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kNumber: z.string().optional(),
        manufacturer: z.string().optional(),
      })
    )
    .optional(),
  equivalentDevices: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        manufacturer: z.string().optional(),
        ceMarkNumber: z.string().optional(),
      })
    )
    .optional(),
  targetSubmissionDate: z.string().datetime().optional(),
  priority: priorityEnum.optional(),
  teamMembers: z
    .array(
      z.object({
        userId: z.number(),
        name: z.string(),
        email: z.string().email(),
        role: z.string(),
        permissions: z.array(z.string()),
      })
    )
    .optional(),
  tags: z.array(z.string()).optional(),
});

const updateProgramSchema = createProgramSchema.partial();

const queryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: statusEnum.optional(),
  programType: programTypeEnum.optional(),
  productType: productTypeEnum.optional(),
  agency: z.string().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['createdAt', 'updatedAt', 'name', 'targetSubmissionDate', 'status'])
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
      // req.query is getter-only in Express 5 — see setRequestQuery.
      setRequestQuery(req, schema.parse(req.query));
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
// ROUTES: Programs CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs
 * List all programs with filtering and pagination
 */
router.get('/', validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { page, limit, status, programType, productType, agency, search, sortBy, sortOrder } =
      req.query as unknown as z.infer<typeof queryParamsSchema>;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const whereClauses = [eq(cerProjects.organizationId, Number(tenantId))];
    if (status) whereClauses.push(eq(cerProjects.status, status));
    if (programType) whereClauses.push(eq(cerProjects.regulatoryContext, programType));
    if (productType) whereClauses.push(eq(cerProjects.deviceType, productType));
    if (agency) whereClauses.push(eq(cerProjects.regulatoryContext, agency));
    if (search) whereClauses.push(ilike(cerProjects.name, `%${search}%`));

    const sortColumn =
      sortBy === 'updatedAt'
        ? cerProjects.updatedAt
        : sortBy === 'name'
        ? cerProjects.name
        : sortBy === 'targetSubmissionDate'
        ? cerProjects.dueDate
        : cerProjects.createdAt;
    const orderByExpr = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(cerProjects)
      .where(and(...whereClauses))
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(cerProjects)
      .where(and(...whereClauses));

    const programs = rows.map(row => {
      const metadata = readMetadata(row.metadata);
      return {
        id: String(row.id),
        name: row.name,
        code: row.version || `PRG-${row.id}`,
        programType: row.regulatoryContext || 'CER',
        productType: row.deviceType || 'device',
        deviceClass: row.deviceClass,
        primaryAgency: row.regulatoryContext || 'FDA',
        productName: row.deviceName,
        status: row.status,
        phase: metadata.phase || 'planning',
        priority: metadata.priority || 'medium',
        progressPercent: metadata.progressPercent || 0,
        targetSubmissionDate: row.dueDate,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    res.json({
      success: true,
      data: programs,
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
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch programs' },
    });
  }
});

/**
 * GET /api/programs/:id
 * Get a single program by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const [row] = await db
      .select()
      .from(cerProjects)
      .where(and(eq(cerProjects.id, id), eq(cerProjects.organizationId, Number(tenantId))))
      .limit(1);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Program not found' },
      });
    }

    const metadata = readMetadata(row.metadata);
    const program = {
      id: String(row.id),
      name: row.name,
      code: row.version || `PRG-${row.id}`,
      description: row.description,
      programType: row.regulatoryContext || 'CER',
      productType: row.deviceType || 'device',
      deviceClass: row.deviceClass,
      regulatoryPath: row.regulatoryContext,
      primaryAgency: row.regulatoryContext || 'FDA',
      targetAgencies: [],
      productName: row.deviceName,
      productCode: null,
      indication: null,
      intendedUse: null,
      predicateDevices: [],
      equivalentDevices: [],
      status: row.status,
      phase: metadata.phase || 'planning',
      priority: metadata.priority || 'medium',
      targetSubmissionDate: row.dueDate,
      actualSubmissionDate: row.completionDate,
      approvalDate: row.reviewDate,
      progressPercent: metadata.progressPercent || 0,
      completedMilestones: metadata.completedMilestones || 0,
      totalMilestones: metadata.totalMilestones || 0,
      leadUserId: row.createdById,
      teamMembers: [],
      settings: row.settings ?? {},
      tags: metadata.tags ?? [],
      createdBy: row.createdById,
      updatedBy: row.assignedToId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    res.json({ success: true, data: program });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch program' },
    });
  }
});

/**
 * POST /api/programs
 * Create a new program
 */
router.post('/', validateBody(createProgramSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const userId = (req as any).user?.id || 'system';

    const [program] = await db
      .insert(cerProjects)
      .values({
        organizationId: Number(tenantId),
        name: data.name,
        deviceName: data.productName,
        deviceManufacturer: 'Unknown',
        deviceType: data.productType,
        deviceClass: data.deviceClass,
        regulatoryContext: data.programType,
        description: data.description,
        status: 'draft',
        version: data.code || '1.0.0',
        dueDate: data.targetSubmissionDate ? new Date(data.targetSubmissionDate) : null,
        createdById: Number(userId) || null,
        assignedToId: Number(userId) || null,
        settings: {},
        metadata: {
          phase: 'planning',
          progressPercent: 0,
          completedMilestones: 0,
          totalMilestones: 0,
          priority: data.priority || 'medium',
          tags: data.tags || [],
        },
      })
      .returning();

    res.status(201).json({ success: true, data: program });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create program' },
    });
  }
});

/**
 * PATCH /api/programs/:id
 * Update a program
 */
router.patch('/:id', validateBody(updateProgramSchema), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const updates = req.body;
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    const [existing] = await db
      .select()
      .from(cerProjects)
      .where(and(eq(cerProjects.id, id), eq(cerProjects.organizationId, Number(tenantId))))
      .limit(1);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: { code: 'NOT_FOUND', message: 'Program not found' } });
    }

    const [program] = await db
      .update(cerProjects)
      .set({
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.description ? { description: updates.description } : {}),
        ...(updates.productName ? { deviceName: updates.productName } : {}),
        ...(updates.productType ? { deviceType: updates.productType } : {}),
        ...(updates.deviceClass ? { deviceClass: updates.deviceClass } : {}),
        ...(updates.programType ? { regulatoryContext: updates.programType } : {}),
        ...(updates.targetSubmissionDate
          ? { dueDate: new Date(updates.targetSubmissionDate) }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(cerProjects.id, id), eq(cerProjects.organizationId, Number(tenantId))))
      .returning();

    res.json({ success: true, data: program });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update program' },
    });
  }
});

/**
 * DELETE /api/programs/:id
 * Delete (archive) a program
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }
    await db
      .update(cerProjects)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(cerProjects.id, id), eq(cerProjects.organizationId, Number(tenantId))));
    res.json({ success: true, message: 'Program archived successfully' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete program' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Program Milestones
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/:id/milestones
 * Get all milestones for a program
 */
router.get('/:id/milestones', (_req: Request, res: Response) => {
  // NOT IMPLEMENTED — and it must say so rather than answer.
  //
  // This handler used to return a hardcoded three-milestone plan ("Literature
  // Review Complete", "CER Draft Complete") with invented target/actual dates
  // and progress percentages, echoed back under the caller's programId so it
  // read as that program's real schedule. A programme manager cannot tell that
  // from a plan the platform actually tracks, and a submission timeline built
  // on invented dates is the worst kind of wrong.
  //
  // There is no milestone store keyed to this router's programs: `:id` here is
  // a `cer_projects` integer id, while `program_milestones.program_id` is a
  // `regulatory_programs` UUID — a different program entity. The canonical,
  // DB-backed milestone read lives at GET /api/regulatory-programs/:id/milestones
  // (server/routes/regulatory-programs.ts). Send callers there.
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Milestones are not tracked for this program type. Use GET /api/regulatory-programs/:id/milestones, which reads the governed milestone store.',
    },
  });
});

/**
 * POST /api/programs/:id/milestones
 * Create a new milestone
 */
router.post('/:id/milestones', (_req: Request, res: Response) => {
  // NOT IMPLEMENTED — and it must say so rather than pretend.
  //
  // This handler used to answer 201 Created with a freshly minted UUID and the
  // caller's own body echoed back, having written NOTHING. The client saw a
  // successful create, showed the milestone, and lost it on the next reload —
  // a write that reports success without durability is indistinguishable from
  // data loss. There is no milestone store keyed to this router's programs
  // (see the GET above), so refuse the write instead of faking it.
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Creating milestones is not supported for this program type; nothing would be persisted.',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Program Activity Timeline
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/:id/activity
 * Get activity timeline for a program
 */
router.get('/:id/activity', (_req: Request, res: Response) => {
  // NOT IMPLEMENTED — and it must say so rather than answer.
  //
  // This handler used to return a hardcoded activity feed attributing actions
  // to invented people ("Dr. Sarah Chen", lead; "John Smith", author) at
  // invented timestamps, stamped with the caller's programId. That is a
  // fabricated attribution record on a regulated program — the exact artefact
  // an auditor would read as evidence of who did what and when.
  //
  // The real feed is `program_activity_log` / `audit_logs`, neither of which is
  // reachable from this router's `cer_projects` integer id. The canonical read
  // is GET /api/regulatory-programs/:id/activity
  // (server/routes/regulatory-programs.ts).
  return res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message:
        'Activity history is not tracked for this program type. Use GET /api/regulatory-programs/:id/activity, which reads the audit log.',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Program Dashboard Stats
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/stats/overview
 * Get dashboard overview statistics
 */
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantContext?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const [totals] = await db
      .select({
        totalPrograms: sql<number>`count(*)`,
        activePrograms: sql<number>`count(*) filter (where ${cerProjects.status} = 'active')`,
        submittedPrograms: sql<number>`count(*) filter (where ${cerProjects.status} = 'submitted')`,
        approvedPrograms: sql<number>`count(*) filter (where ${cerProjects.status} = 'approved')`,
      })
      .from(cerProjects)
      .where(eq(cerProjects.organizationId, Number(tenantId)));

    const byTypeRows = await db
      .select({
        value: cerProjects.regulatoryContext,
        count: sql<number>`count(*)`,
      })
      .from(cerProjects)
      .where(eq(cerProjects.organizationId, Number(tenantId)))
      .groupBy(cerProjects.regulatoryContext);

    const byStatusRows = await db
      .select({
        value: cerProjects.status,
        count: sql<number>`count(*)`,
      })
      .from(cerProjects)
      .where(eq(cerProjects.organizationId, Number(tenantId)))
      .groupBy(cerProjects.status);

    const upcoming = await db
      .select({
        id: cerProjects.id,
        name: cerProjects.name,
        deadline: cerProjects.dueDate,
      })
      .from(cerProjects)
      .where(
        and(
          eq(cerProjects.organizationId, Number(tenantId)),
          sql`${cerProjects.dueDate} IS NOT NULL`,
          sql`${cerProjects.dueDate} >= now()`
        )
      )
      .orderBy(asc(cerProjects.dueDate))
      .limit(5);

    const byType = Object.fromEntries(
      byTypeRows.map(row => [row.value || 'unknown', Number(row.count)])
    );
    const byStatus = Object.fromEntries(byStatusRows.map(row => [row.value, Number(row.count)]));

    const upcomingDeadlines = upcoming.map(item => {
      const daysRemaining = item.deadline
        ? Math.max(0, Math.ceil((item.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null;
      return {
        programId: String(item.id),
        programName: item.name,
        deadline: item.deadline,
        daysRemaining,
      };
    });

    const stats = {
      totalPrograms: Number(totals?.totalPrograms ?? 0),
      activePrograms: Number(totals?.activePrograms ?? 0),
      submittedPrograms: Number(totals?.submittedPrograms ?? 0),
      approvedPrograms: Number(totals?.approvedPrograms ?? 0),
      byType,
      byStatus,
      upcomingDeadlines,
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
