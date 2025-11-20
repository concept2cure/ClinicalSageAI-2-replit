/**
 * QMP Traceability Matrix API Routes
 *
 * These endpoints manage the traceability mapping between quality requirements
 * and implementation evidence, with tenant isolation.
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import {
  insertQmpTraceabilityMatrixSchema,
  qmpTraceabilityMatrix,
  ctqFactors,
  qualityManagementPlans,
} from '../../shared/schema';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { tenantContextMiddleware, requireOrganizationContext } from '../middleware/tenantContext';
import { createScopedLogger } from '../utils/logger';

// Use declaration merging to specify the tenant context and db types
// The requireOrganizationContext guarantees these will be available
declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
      userId?: number;
      userRole?: string;
      tenantContext: {
        organizationId: number;
        userId?: number;
        role?: string;
      };
      db: any; // Database instance with tenant context
    }
  }
}

const router = Router();
const logger = createScopedLogger('traceability-routes');

// Import the getDb helper from the tenantDbHelper
import { getDb } from '../db/tenantDbHelper';

// Apply tenant context and require a tenant for all routes
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

/**
 * Get all traceability matrix items for a QMP
 */
router.get('/:qmpId', async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert qmpId to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID format' });
    }

    // Get traceability items with tenant isolation
    const traceabilityItems = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber)
        )
      )
      // Join with CTQ factors
      .leftJoin(ctqFactors, eq(qmpTraceabilityMatrix.ctqFactorId, ctqFactors.id));

    return res.json({ items: traceabilityItems });
  } catch (error) {
    logger.error('Error retrieving traceability items', { error });
    return res.status(500).json({ error: 'Failed to retrieve traceability matrix' });
  }
});

/**
 * Get a specific traceability matrix item by ID
 */
router.get('/item/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert id to number
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID format' });
    }

    // Get traceability item with tenant isolation
    const traceabilityItem = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.id, itemId)
        )
      )
      .leftJoin(ctqFactors, eq(qmpTraceabilityMatrix.ctqFactorId, ctqFactors.id))
      .limit(1)
      .then(results => results[0] || null);

    if (!traceabilityItem) {
      return res.status(404).json({ error: 'Traceability item not found' });
    }

    return res.json(traceabilityItem);
  } catch (error) {
    logger.error('Error retrieving traceability item', { error });
    return res.status(500).json({ error: 'Failed to retrieve traceability item' });
  }
});

/**
 * Create a new traceability matrix item
 */
router.post('/', async (req, res) => {
  try {
    const { organizationId } = req.tenantContext;

    // Validate input
    const itemSchema = insertQmpTraceabilityMatrixSchema.extend({
      // Add any additional validation rules here
    });

    const validationResult = itemSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid traceability item data',
        details: validationResult.error.format(),
      });
    }

    const itemData = validationResult.data;

    // Verify the QMP belongs to the tenant
    const qmpResults = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, itemData.qmpId)
        )
      )
      .limit(1);

    const qmp = qmpResults[0];
    if (!qmp) {
      return res.status(404).json({ error: 'QMP not found or access denied' });
    }

    // Verify the CTQ factor belongs to the tenant and QMP if provided
    if (itemData.ctqFactorId) {
      const ctqFactorResults = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            eq(ctqFactors.id, itemData.ctqFactorId),
            eq(ctqFactors.qmpId, itemData.qmpId)
          )
        )
        .limit(1);

      const ctqFactor = ctqFactorResults[0];
      if (!ctqFactor) {
        return res.status(404).json({ error: 'CTQ factor not found or access denied' });
      }
    }

    // Set organization ID from tenant context
    const newItem = {
      ...itemData,
      organizationId,
    };

    // Create traceability item
    const result = await getDb(req).insert(qmpTraceabilityMatrix).values(newItem).returning();

    // Get the newly created item or use the returned item
    const createdItem =
      result[0] ??
      (await getDb(req)
        .select()
        .from(qmpTraceabilityMatrix)
        .where(
          and(
            eq(qmpTraceabilityMatrix.organizationId, organizationId),
            eq(qmpTraceabilityMatrix.requirementId, itemData.requirementId),
            eq(qmpTraceabilityMatrix.qmpId, itemData.qmpId)
          )
        )
        .limit(1)
        .then(results => results[0]));

    return res.status(201).json(createdItem);
  } catch (error) {
    logger.error('Error creating traceability item', { error });
    return res.status(500).json({ error: 'Failed to create traceability item' });
  }
});

/**
 * Update a traceability matrix item
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert id to number
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID format' });
    }

    // Validate input
    const updateSchema = insertQmpTraceabilityMatrixSchema.partial().extend({
      // Add any additional validation rules here
    });

    const validationResult = updateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid traceability item data',
        details: validationResult.error.format(),
      });
    }

    const updateData = validationResult.data;

    // Check if item exists and belongs to tenant
    const existingItemResults = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.id, itemId)
        )
      )
      .limit(1);

    const existingItem = existingItemResults[0];
    if (!existingItem) {
      return res.status(404).json({ error: 'Traceability item not found or access denied' });
    }

    // If CTQ factor ID is being updated, verify it belongs to the tenant and QMP
    if (updateData.ctqFactorId) {
      const ctqFactorResults = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            eq(ctqFactors.id, updateData.ctqFactorId),
            eq(ctqFactors.qmpId, existingItem.qmpId)
          )
        )
        .limit(1);

      const ctqFactor = ctqFactorResults[0];
      if (!ctqFactor) {
        return res.status(404).json({ error: 'CTQ factor not found or access denied' });
      }
    }

    // Update the item
    await getDb(req)
      .update(qmpTraceabilityMatrix)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.id, itemId)
        )
      );

    // Get the updated item
    const updatedItemResults = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.id, itemId)
        )
      )
      .leftJoin(ctqFactors, eq(qmpTraceabilityMatrix.ctqFactorId, ctqFactors.id))
      .limit(1);

    const updatedItem = updatedItemResults[0];

    return res.json(updatedItem);
  } catch (error) {
    logger.error('Error updating traceability item', { error });
    return res.status(500).json({ error: 'Failed to update traceability item' });
  }
});

/**
 * Delete a traceability matrix item
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert id to number
    const itemId = parseInt(id, 10);
    if (isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID format' });
    }

    // Check if item exists and belongs to tenant
    const existingItemResults = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.id, itemId)
        )
      )
      .limit(1);

    const existingItem = existingItemResults[0];
    if (!existingItem) {
      return res.status(404).json({ error: 'Traceability item not found or access denied' });
    }

    // Delete the item
    await getDb(req)
      .delete(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.id, itemId)
        )
      );

    return res.json({ success: true, message: 'Traceability item deleted successfully' });
  } catch (error) {
    logger.error('Error deleting traceability item', { error });
    return res.status(500).json({ error: 'Failed to delete traceability item' });
  }
});

/**
 * Bulk update verification status for traceability items
 */
router.put('/verify-batch/:qmpId', async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId, userId } = req.tenantContext;
    const { itemIds, verificationStatus, notes } = req.body;

    // Convert qmpId to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID format' });
    }

    // Validate input
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'Item IDs must be a non-empty array' });
    }

    if (!verificationStatus || !['pending', 'verified', 'failed'].includes(verificationStatus)) {
      return res.status(400).json({ error: 'Invalid verification status' });
    }

    // Check if all items exist and belong to tenant and QMP
    const existingItems = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber)
        )
      );

    const existingItemIds = existingItems.map((item: any) => item.id);
    const invalidItemIds = itemIds.filter((id: number) => !existingItemIds.includes(id));

    if (invalidItemIds.length > 0) {
      return res.status(404).json({
        error: 'Some traceability items not found or access denied',
        invalidItems: invalidItemIds,
      });
    }

    // Update all items in a transaction
    const now = new Date();
    const updatePromises = itemIds.map(itemId =>
      getDb(req)
        .update(qmpTraceabilityMatrix)
        .set({
          verificationStatus,
          verifiedById: userId ? userId : null,
          verifiedAt: now,
          notes: notes || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(qmpTraceabilityMatrix.organizationId, organizationId),
            eq(qmpTraceabilityMatrix.id, itemId)
          )
        )
    );

    await Promise.all(updatePromises);

    return res.json({
      success: true,
      message: `${itemIds.length} traceability items updated successfully`,
      status: verificationStatus,
      itemIds,
    });
  } catch (error) {
    logger.error('Error batch updating traceability items', { error });
    return res.status(500).json({ error: 'Failed to update traceability items' });
  }
});

/**
 * Get verification statistics for a QMP's traceability matrix
 */
router.get('/stats/:qmpId', async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert qmpId to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID format' });
    }

    // Get all traceability items for the QMP
    const traceabilityItems = await getDb(req)
      .select()
      .from(qmpTraceabilityMatrix)
      .where(
        and(
          eq(qmpTraceabilityMatrix.organizationId, organizationId),
          eq(qmpTraceabilityMatrix.qmpId, qmpIdNumber)
        )
      );

    const total = traceabilityItems.length;
    const verified = traceabilityItems.filter(
      (item: any) => item.verificationStatus === 'verified'
    ).length;
    const failed = traceabilityItems.filter(
      (item: any) => item.verificationStatus === 'failed'
    ).length;
    const pending = traceabilityItems.filter(
      (item: any) => item.verificationStatus === 'pending'
    ).length;

    // Calculate completion percentage
    const completionPercentage = total > 0 ? Math.round((verified / total) * 100) : 0;

    return res.json({
      total,
      verified,
      failed,
      pending,
      completionPercentage,
    });
  } catch (error) {
    logger.error('Error retrieving traceability statistics', { error });
    return res.status(500).json({ error: 'Failed to retrieve traceability statistics' });
  }
});

export default router;
