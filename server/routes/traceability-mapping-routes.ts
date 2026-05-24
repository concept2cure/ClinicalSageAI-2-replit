/**
 * QMP Traceability Mapping Routes
 *
 * These endpoints handle the traceability matrix between quality requirements
 * and implementation evidence for quality management and regulatory compliance.
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { qmpTraceabilityMatrix, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { getDb } from '../db/tenantDbHelper';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('traceability-mapping-api');
const router = Router();

/**
 * Safely check if a table exists in the database
 * This prevents errors when trying to query tables that don't exist yet
 */
async function tableExists(req: any, tableName: string): Promise<boolean> {
  try {
    const result = await getDb(req).execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      );
    `);

    return result.rows[0]?.exists === true;
  } catch (error: any) {
    logger.error(`Error checking if table ${tableName} exists`, { error });
    return false;
  }
}

/**
 * GET /api/quality/traceability/:qmpId
 *
 * Get the traceability matrix for a QMP
 */
router.get('/:qmpId', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const qmpId = String(req.params.qmpId);
    const organizationIdRaw = req.tenantContext?.organizationId;
    const organizationId = organizationIdRaw != null ? Number(organizationIdRaw) : NaN;

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // Convert to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // First check if required tables exist
    const [tracabilityMatrixExists, qmpExists] = await Promise.all([
      tableExists(req, 'qmp_traceability_matrix'),
      tableExists(req, 'quality_management_plans'),
    ]);

    if (!tracabilityMatrixExists || !qmpExists) {
      logger.warn('Traceability tables not found, returning empty result', {
        tracabilityMatrixExists,
        qmpExists,
      });

      // Return a graceful response if tables don't exist yet
      return res.json({
        qmpId: qmpIdNumber,
        traceabilityItems: [],
      });
    }

    // Check if the QMP exists
    const qmps = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpIdNumber)
        )
      )
      .limit(1);

    if (qmps.length === 0) {
      return res.status(404).json({ error: 'Quality Management Plan not found' });
    }

    // Get all traceability items for this QMP
    const traceabilityItems = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber)
        )
      );

    // If requested with expanded ctqFactors, fetch the factor details
    if (req.query.expanded === 'true') {
      // Check if CTQ factors table exists
      const ctqFactorsExists = await tableExists(req, 'ctq_factors');

      if (ctqFactorsExists) {
        // Create a set of all factor IDs
        const factorIds = new Set<number>();
        traceabilityItems.forEach((item: any) => {
          if (item.ctqFactorId) {
            factorIds.add(item.ctqFactorId);
          }
        });

        // Get factor details if we have any
        let factorsMap = new Map();
        if (factorIds.size > 0) {
          const factors = await getDb(req)
            .select()
            .from(ctqFactors)
            .where(
              and(
                eq(ctqFactors.organizationId, organizationId),
                sql`${ctqFactors.id} = ANY(${Array.from(factorIds)})`
              )
            );

          // Create a map for quick lookup
          factors.forEach((factor: any) => {
            factorsMap.set(factor.id, factor);
          });
        }

        // Enhance each traceability item with factor details
        const enhancedItems = traceabilityItems.map((item: any) => ({
          ...item,
          ctqFactor: item.ctqFactorId ? factorsMap.get(item.ctqFactorId) : null,
        }));

        return res.json({
          qmpId: qmpIdNumber,
          traceabilityItems: enhancedItems,
        });
      }
    }

    return res.json({
      qmpId: qmpIdNumber,
      traceabilityItems,
    });
  } catch (error: any) {
    logger.error('Error retrieving QMP traceability matrix', { error });
    return res.status(500).json({
      error: 'Failed to retrieve traceability matrix',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/quality/traceability/:qmpId
 *
 * Create a new traceability item
 */
router.post('/:qmpId', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const qmpId = String(req.params.qmpId);
    const organizationIdRaw = req.tenantContext?.organizationId;
    const organizationId = organizationIdRaw != null ? Number(organizationIdRaw) : NaN;

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // Convert to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // First check if required tables exist
    const [tracabilityMatrixExists, qmpExists] = await Promise.all([
      tableExists(req, 'qmp_traceability_matrix'),
      tableExists(req, 'quality_management_plans'),
    ]);

    if (!tracabilityMatrixExists || !qmpExists) {
      return res.status(400).json({
        error: 'Traceability functionality not available',
        message: 'The database tables for traceability are not set up yet',
      });
    }

    // Check if the QMP exists
    const qmps = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpIdNumber)
        )
      )
      .limit(1);

    if (qmps.length === 0) {
      return res.status(404).json({ error: 'Quality Management Plan not found' });
    }

    // Validate request body
    const traceabilitySchema = z.object({
      ctqFactorId: z.number().optional(),
      requirementId: z.string(),
      requirementText: z.string(),
      requirementSource: z.string().optional(),
      verificationMethod: z.string().optional(),
      implementationEvidence: z.record(z.any()).optional(),
      notes: z.string().optional(),
    });

    const validationResult = traceabilitySchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validationResult.error.format(),
      });
    }

    const traceabilityData = validationResult.data;

    // If a CTQ factor ID is provided, verify it exists and belongs to this tenant
    if (traceabilityData.ctqFactorId) {
      const ctqFactorsExists = await tableExists(req, 'ctq_factors');

      if (ctqFactorsExists) {
        const factor = await getDb(req)
          .select()
          .from(ctqFactors)
          .where(
            and(
              eq(ctqFactors.organizationId, organizationId),
              eq(ctqFactors.id, traceabilityData.ctqFactorId)
            )
          )
          .limit(1);

        if (factor.length === 0) {
          return res.status(400).json({
            error: 'Invalid CTQ factor ID',
            message: 'The specified CTQ factor does not exist or does not belong to this tenant',
          });
        }
      }
    }

    // Create the traceability item
    const result = await getDb(req)
      .insert(qmpTraceabilityMatrix)
      .values({
        organizationId,
        qmpId: qmpIdNumber,
        ...traceabilityData,
        // Initialize other fields with defaults
        verificationStatus: 'pending',
      })
      .returning();

    return res.status(201).json(result[0]);
  } catch (error: any) {
    logger.error('Error creating traceability item', { error });
    return res.status(500).json({
      error: 'Failed to create traceability item',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/quality/traceability/:qmpId/item/:itemId
 *
 * Get a specific traceability item
 */
router.get('/:qmpId/item/:itemId', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const qmpId = String(req.params.qmpId);
    const itemId = String(req.params.itemId);
    const organizationIdRaw = req.tenantContext?.organizationId;
    const organizationId = organizationIdRaw != null ? Number(organizationIdRaw) : NaN;

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // Convert to numbers
    const qmpIdNumber = parseInt(qmpId, 10);
    const itemIdNumber = parseInt(itemId, 10);
    if (isNaN(qmpIdNumber) || isNaN(itemIdNumber)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // Check if table exists
    const tracabilityMatrixExists = await tableExists(req, 'qmp_traceability_matrix');

    if (!tracabilityMatrixExists) {
      return res.status(400).json({
        error: 'Traceability functionality not available',
        message: 'The database table for traceability is not set up yet',
      });
    }

    // Get the traceability item
    const items = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber),
          eq(qmpTraceabilityMatrix.id, itemIdNumber)
        )
      )
      .limit(1);

    if (items.length === 0) {
      return res.status(404).json({ error: 'Traceability item not found' });
    }

    // Get the CTQ factor if available. The enriched response carries an
    // extra ctqFactor field that is not part of the base row type.
    let item: (typeof items)[number] & { ctqFactor?: unknown } = items[0];

    if (item.ctqFactorId) {
      const ctqFactorsExists = await tableExists(req, 'ctq_factors');

      if (ctqFactorsExists) {
        const factors = await getDb(req)
          .select()
          .from(ctqFactors)
          .where(
            and(eq(ctqFactors.organizationId, organizationId), eq(ctqFactors.id, item.ctqFactorId))
          )
          .limit(1);

        if (factors.length > 0) {
          item = {
            ...item,
            ctqFactor: factors[0],
          };
        }
      }
    }

    return res.json(item);
  } catch (error: any) {
    logger.error('Error retrieving traceability item', { error });
    return res.status(500).json({
      error: 'Failed to retrieve traceability item',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * PATCH /api/quality/traceability/:qmpId/item/:itemId
 *
 * Update a traceability item
 */
router.patch(
  '/:qmpId/item/:itemId',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const qmpId = String(req.params.qmpId);
      const itemId = String(req.params.itemId);
      const organizationIdRaw = req.tenantContext?.organizationId;
      const organizationId = organizationIdRaw != null ? Number(organizationIdRaw) : NaN;

      if (!organizationId) {
        return res.status(400).json({ error: 'Missing tenant context' });
      }

      // Convert to numbers
      const qmpIdNumber = parseInt(qmpId, 10);
      const itemIdNumber = parseInt(itemId, 10);
      if (isNaN(qmpIdNumber) || isNaN(itemIdNumber)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }

      // Check if table exists
      const tracabilityMatrixExists = await tableExists(req, 'qmp_traceability_matrix');

      if (!tracabilityMatrixExists) {
        return res.status(400).json({
          error: 'Traceability functionality not available',
          message: 'The database table for traceability is not set up yet',
        });
      }

      // Check if the item exists
      const existingItems = await getDb(req)
        .select()
        .from(qmpTraceabilityMatrix)
        .where(
          and(
            eq(qmpTraceabilityMatrix.organizationId, organizationId),
            eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber),
            eq(qmpTraceabilityMatrix.id, itemIdNumber)
          )
        )
        .limit(1);

      if (existingItems.length === 0) {
        return res.status(404).json({ error: 'Traceability item not found' });
      }

      // Validate request body
      const updateSchema = z.object({
        ctqFactorId: z.number().optional(),
        requirementId: z.string().optional(),
        requirementText: z.string().optional(),
        requirementSource: z.string().optional(),
        verificationMethod: z.string().optional(),
        implementationEvidence: z.record(z.any()).optional(),
        verificationStatus: z.string().optional(),
        notes: z.string().optional(),
      });

      const validationResult = updateSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationResult.error.format(),
        });
      }

      const updateData = validationResult.data;

      // If updating the CTQ factor ID, verify it exists and belongs to this tenant
      if (updateData.ctqFactorId !== undefined) {
        if (updateData.ctqFactorId !== null) {
          const ctqFactorsExists = await tableExists(req, 'ctq_factors');

          if (ctqFactorsExists) {
            const factor = await getDb(req)
              .select()
              .from(ctqFactors)
              .where(
                and(
                  eq(ctqFactors.organizationId, organizationId),
                  eq(ctqFactors.id, updateData.ctqFactorId)
                )
              )
              .limit(1);

            if (factor.length === 0) {
              return res.status(400).json({
                error: 'Invalid CTQ factor ID',
                message:
                  'The specified CTQ factor does not exist or does not belong to this tenant',
              });
            }
          }
        }
      }

      // Build the update payload from the validated body, plus the verified
      // metadata when the status transitions to 'verified'.
      const setValues: Partial<typeof qmpTraceabilityMatrix.$inferInsert> = {
        ...updateData,
        updatedAt: new Date(),
      };
      if (updateData.verificationStatus === 'verified') {
        setValues.verifiedAt = new Date();
        setValues.verifiedById = req.userId != null ? Number(req.userId) : undefined;
      }

      // Update the traceability item
      const result = await getDb(req)
        .update(qmpTraceabilityMatrix)
        .set(setValues)
        .where(
          and(
            eq(qmpTraceabilityMatrix.organizationId, organizationId),
            eq(qmpTraceabilityMatrix.id, itemIdNumber)
          )
        )
        .returning();

      return res.json(result[0]);
    } catch (error: any) {
      logger.error('Error updating traceability item', { error });
      return res.status(500).json({
        error: 'Failed to update traceability item',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
);

/**
 * DELETE /api/quality/traceability/:qmpId/item/:itemId
 *
 * Delete a traceability item
 */
router.delete(
  '/:qmpId/item/:itemId',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const qmpId = String(req.params.qmpId);
      const itemId = String(req.params.itemId);
      const organizationIdRaw = req.tenantContext?.organizationId;
      const organizationId = organizationIdRaw != null ? Number(organizationIdRaw) : NaN;

      if (!organizationId) {
        return res.status(400).json({ error: 'Missing tenant context' });
      }

      // Convert to numbers
      const qmpIdNumber = parseInt(qmpId, 10);
      const itemIdNumber = parseInt(itemId, 10);
      if (isNaN(qmpIdNumber) || isNaN(itemIdNumber)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }

      // Check if table exists
      const tracabilityMatrixExists = await tableExists(req, 'qmp_traceability_matrix');

      if (!tracabilityMatrixExists) {
        return res.status(400).json({
          error: 'Traceability functionality not available',
          message: 'The database table for traceability is not set up yet',
        });
      }

      // Check if the item exists
      const existingItems = await getDb(req)
        .select()
        .from(qmpTraceabilityMatrix)
        .where(
          and(
            eq(qmpTraceabilityMatrix.organizationId, organizationId),
            eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber),
            eq(qmpTraceabilityMatrix.id, itemIdNumber)
          )
        )
        .limit(1);

      if (existingItems.length === 0) {
        return res.status(404).json({ error: 'Traceability item not found' });
      }

      // Delete the traceability item
      await getDb(req)
        .delete(qmpTraceabilityMatrix)
        .where(
          and(
            eq(qmpTraceabilityMatrix.organizationId, organizationId),
            eq(qmpTraceabilityMatrix.id, itemIdNumber)
          )
        );

      return res.json({
        success: true,
        message: 'Traceability item deleted successfully',
      });
    } catch (error: any) {
      logger.error('Error deleting traceability item', { error });
      return res.status(500).json({
        error: 'Failed to delete traceability item',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
);

/**
 * GET /api/quality/traceability/:qmpId/stats
 *
 * Get traceability statistics for a QMP
 */
router.get('/:qmpId/stats', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const qmpId = String(req.params.qmpId);
    const organizationIdRaw = req.tenantContext?.organizationId;
    const organizationId = organizationIdRaw != null ? Number(organizationIdRaw) : NaN;

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // Convert to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // Check if table exists
    const tracabilityMatrixExists = await tableExists(req, 'qmp_traceability_matrix');

    if (!tracabilityMatrixExists) {
      // Return empty stats if table doesn't exist
      return res.json({
        qmpId: qmpIdNumber,
        totalRequirements: 0,
        verifiedRequirements: 0,
        pendingRequirements: 0,
        failedRequirements: 0,
        verificationRate: 0,
        bySource: {},
        byMethod: {},
      });
    }

    // Get all traceability items for this QMP
    const items = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber)
        )
      );

    // Calculate statistics
    const totalRequirements = items.length;
    const verifiedRequirements = items.filter(
      (item: any) => item.verificationStatus === 'verified'
    ).length;
    const pendingRequirements = items.filter((item: any) => item.verificationStatus === 'pending').length;
    const failedRequirements = items.filter((item: any) => item.verificationStatus === 'failed').length;

    // Calculate verification rate
    const verificationRate =
      totalRequirements > 0 ? Math.round((verifiedRequirements / totalRequirements) * 100) : 0;

    // Calculate stats by requirement source
    const bySource: Record<string, { total: number; verified: number }> = {};
    items.forEach((item: any) => {
      const source = item.requirementSource || 'Unknown';
      if (!bySource[source]) {
        bySource[source] = { total: 0, verified: 0 };
      }
      bySource[source].total++;
      if (item.verificationStatus === 'verified') {
        bySource[source].verified++;
      }
    });

    // Calculate stats by verification method
    const byMethod: Record<string, { total: number; verified: number }> = {};
    items.forEach((item: any) => {
      const method = item.verificationMethod || 'Unknown';
      if (!byMethod[method]) {
        byMethod[method] = { total: 0, verified: 0 };
      }
      byMethod[method].total++;
      if (item.verificationStatus === 'verified') {
        byMethod[method].verified++;
      }
    });

    return res.json({
      qmpId: qmpIdNumber,
      totalRequirements,
      verifiedRequirements,
      pendingRequirements,
      failedRequirements,
      verificationRate,
      bySource,
      byMethod,
    });
  } catch (error: any) {
    logger.error('Error retrieving traceability statistics', { error });
    return res.status(500).json({
      error: 'Failed to retrieve traceability statistics',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

export default router;
