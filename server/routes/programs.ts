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

const router = Router();

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
// ROUTES: Programs CRUD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs
 * List all programs with filtering and pagination
 */
router.get('/', validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { page, limit, status, programType, productType, agency, search, sortBy, sortOrder } =
      req.query as z.infer<typeof queryParamsSchema>;
    const tenantId = (req as any).tenantContext?.tenantId || 1;

    // Mock response - replace with actual DB query
    const programs = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Cardiac Monitor CER 2026',
        code: 'CER-2026-001',
        programType: 'CER',
        productType: 'device',
        deviceClass: 'II',
        primaryAgency: 'FDA',
        productName: 'CardioWatch X1',
        status: 'active',
        phase: 'evidence_collection',
        priority: 'high',
        progressPercent: 45,
        targetSubmissionDate: '2026-06-30T00:00:00Z',
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-01-25T14:30:00Z',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Glucose Monitor 510(k)',
        code: '510K-2026-001',
        programType: '510K',
        productType: 'device',
        deviceClass: 'II',
        primaryAgency: 'FDA',
        productName: 'GlucoSense Pro',
        status: 'draft',
        phase: 'planning',
        priority: 'medium',
        progressPercent: 10,
        targetSubmissionDate: '2026-09-15T00:00:00Z',
        createdAt: '2026-01-20T09:00:00Z',
        updatedAt: '2026-01-24T11:00:00Z',
      },
    ];

    res.json({
      success: true,
      data: programs,
      meta: {
        page,
        limit,
        total: programs.length,
        totalPages: Math.ceil(programs.length / limit),
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
    const { id } = req.params;
    const tenantId = (req as any).tenantContext?.tenantId || 1;

    // Mock response - replace with actual DB query
    const program = {
      id,
      name: 'Cardiac Monitor CER 2026',
      code: 'CER-2026-001',
      description: 'Clinical Evaluation Report for CardioWatch X1 cardiac monitoring device',
      programType: 'CER',
      productType: 'device',
      deviceClass: 'II',
      regulatoryPath: '510k',
      primaryAgency: 'FDA',
      targetAgencies: ['FDA', 'EMA'],
      productName: 'CardioWatch X1',
      productCode: 'DQA',
      indication: 'Continuous cardiac rhythm monitoring',
      intendedUse: 'For continuous monitoring and recording of cardiac rhythm in adult patients',
      predicateDevices: [
        { id: '1', name: 'HeartMonitor Pro', kNumber: 'K201234', manufacturer: 'MedTech Inc' },
      ],
      equivalentDevices: [],
      status: 'active',
      phase: 'evidence_collection',
      priority: 'high',
      targetSubmissionDate: '2026-06-30T00:00:00Z',
      actualSubmissionDate: null,
      approvalDate: null,
      progressPercent: 45,
      completedMilestones: 3,
      totalMilestones: 8,
      leadUserId: 101,
      teamMembers: [
        {
          userId: 101,
          name: 'Dr. Sarah Chen',
          email: 'sarah.chen@example.com',
          role: 'lead',
          permissions: ['*'],
        },
        {
          userId: 102,
          name: 'John Smith',
          email: 'john.smith@example.com',
          role: 'author',
          permissions: ['read', 'write'],
        },
      ],
      settings: {
        autoAssignReviewers: true,
        requireDualApproval: true,
        notifyOnMilestone: true,
      },
      tags: ['cardiac', 'class-ii', 'priority'],
      createdBy: 'admin',
      updatedBy: 'sarah.chen@example.com',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-25T14:30:00Z',
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
    const tenantId = (req as any).tenantContext?.tenantId || 1;
    const userId = (req as any).user?.id || 'system';

    // Generate program code if not provided
    const code =
      data.code ||
      `${data.programType}-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

    // Mock response - replace with actual DB insert
    const program = {
      id: crypto.randomUUID(),
      ...data,
      code,
      organizationId: tenantId,
      status: 'draft',
      phase: 'planning',
      progressPercent: 0,
      completedMilestones: 0,
      totalMilestones: 0,
      createdBy: userId,
      updatedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

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
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.id || 'system';

    // Mock response - replace with actual DB update
    const program = {
      id,
      ...updates,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };

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
    const { id } = req.params;

    // Soft delete - set status to archived
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
router.get('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Mock response
    const milestones = [
      {
        id: 'ms-001',
        programId: id,
        name: 'Literature Review Complete',
        description: 'Complete systematic literature review for clinical evidence',
        category: 'evidence',
        targetDate: '2026-02-15T00:00:00Z',
        actualDate: '2026-02-10T00:00:00Z',
        status: 'completed',
        progress: 100,
      },
      {
        id: 'ms-002',
        programId: id,
        name: 'Performance Testing Complete',
        description: 'Complete all bench testing and performance validation',
        category: 'evidence',
        targetDate: '2026-03-01T00:00:00Z',
        status: 'in_progress',
        progress: 65,
      },
      {
        id: 'ms-003',
        programId: id,
        name: 'CER Draft Complete',
        description: 'Complete first draft of Clinical Evaluation Report',
        category: 'authoring',
        targetDate: '2026-04-15T00:00:00Z',
        status: 'pending',
        progress: 0,
        dependsOn: ['ms-001', 'ms-002'],
      },
    ];

    res.json({ success: true, data: milestones });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch milestones' },
    });
  }
});

/**
 * POST /api/programs/:id/milestones
 * Create a new milestone
 */
router.post('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const milestone = {
      id: crypto.randomUUID(),
      programId: id,
      ...data,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.status(201).json({ success: true, data: milestone });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create milestone' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES: Program Activity Timeline
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/programs/:id/activity
 * Get activity timeline for a program
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;

    // Mock response
    const activities = [
      {
        id: 'act-001',
        programId: id,
        activityType: 'evidence_added',
        entityType: 'evidence',
        entityId: 'ev-001',
        title: 'Literature evidence added',
        description: 'Added clinical study: "Long-term outcomes of cardiac monitoring devices"',
        userName: 'Dr. Sarah Chen',
        userRole: 'lead',
        timestamp: '2026-01-25T14:30:00Z',
      },
      {
        id: 'act-002',
        programId: id,
        activityType: 'milestone_completed',
        entityType: 'milestone',
        entityId: 'ms-001',
        title: 'Milestone completed',
        description: 'Literature Review Complete',
        userName: 'John Smith',
        userRole: 'author',
        timestamp: '2026-02-10T16:45:00Z',
      },
      {
        id: 'act-003',
        programId: id,
        activityType: 'status_changed',
        entityType: 'program',
        entityId: id,
        title: 'Status updated',
        description: 'Program status changed from draft to active',
        userName: 'Dr. Sarah Chen',
        userRole: 'lead',
        timestamp: '2026-01-20T09:15:00Z',
      },
    ];

    res.json({ success: true, data: activities });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity' },
    });
  }
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
    const tenantId = (req as any).tenantContext?.tenantId || 1;

    // Mock response
    const stats = {
      totalPrograms: 12,
      activePrograms: 5,
      submittedPrograms: 3,
      approvedPrograms: 4,
      byType: {
        CER: 4,
        '510K': 5,
        IND: 2,
        PMA: 1,
      },
      byStatus: {
        draft: 2,
        active: 5,
        in_review: 1,
        submitted: 3,
        approved: 4,
      },
      upcomingDeadlines: [
        {
          programId: '1',
          programName: 'Cardiac Monitor CER',
          deadline: '2026-06-30',
          daysRemaining: 155,
        },
        {
          programId: '2',
          programName: 'Glucose Monitor 510(k)',
          deadline: '2026-09-15',
          daysRemaining: 232,
        },
      ],
      recentActivity: 24,
      evidenceCount: 156,
      pendingReviews: 8,
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
