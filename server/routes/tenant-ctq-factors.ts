/**
 * Tenant CTQ Factors API Routes
 *
 * Handles tenant-specific Critical-to-Quality (CTQ) factors
 * for section gating and quality controls.
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import { eq, and, SQL } from 'drizzle-orm';
import { ctqFactors } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { createScopedLogger } from '../utils/logger';

// Import the getDb helper from the tenantDbHelper
import { getDb } from '../db/tenantDbHelper';

const logger = createScopedLogger('tenant-ctq-api');
const router = Router();

// CTQ Factor schema for validation
const ctqFactorSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().optional(),
  category: z.enum(['safety', 'effectiveness', 'performance', 'clinical', 'regulatory', 'other']),
  appliesTo: z.enum(['all', 'device', 'medicinal', 'combination']).default('all'),
  sectionCode: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  validationRule: z.string().optional(),
  active: z.boolean().default(true),
  required: z.boolean().default(false),
  customMetadata: z.record(z.any()).optional(),
});

/**
 * Get all CTQ factors for a tenant
 */
router.get(
  '/:tenantId/ctq-factors',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // Check permissions - need at least viewer access
      if (
        req.userRole !== 'super_admin' &&
        req.userRole !== 'admin' &&
        req.userRole !== 'manager' &&
        req.userRole !== 'member' &&
        req.userRole !== 'viewer'
      ) {
        return res.status(403).json({ error: 'Insufficient permissions to view CTQ factors' });
      }

      // Only allow access to own tenant unless super_admin
      if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only view CTQ factors for your own organization' });
      }

      // Optional filtering
      const { category, riskLevel, sectionCode, active } = req.query;

      // Build query with optional filters
      const conditions: SQL[] = [eq(ctqFactors.organizationId, tenantId)];

      if (category) {
        conditions.push(eq(ctqFactors.category, category as string));
      }

      if (riskLevel) {
        conditions.push(eq(ctqFactors.riskLevel, riskLevel as string));
      }

      if (sectionCode) {
        conditions.push(eq((ctqFactors as any).sectionCode, sectionCode as string));
      }

      if (active !== undefined) {
        const isActive = active === 'true';
        conditions.push(eq((ctqFactors as any).active, isActive));
      }

      const factors = await (getDb(req) as any)
        .select()
        .from(ctqFactors)
        .where(and(...conditions))
        .orderBy(ctqFactors.riskLevel, (ctqFactors as any).sectionCode);

      return res.json(factors);
    } catch (error) {
      logger.error(`Error fetching CTQ factors for tenant ${req.params.tenantId}`, { error });
      return res.status(500).json({ error: 'Failed to fetch CTQ factors' });
    }
  }
);

/**
 * Get a single CTQ factor by ID
 */
router.get(
  '/:tenantId/ctq-factors/:factorId',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const factorId = parseInt(req.params.factorId as string);

      if (isNaN(tenantId) || isNaN(factorId)) {
        return res.status(400).json({ error: 'Invalid tenant ID or factor ID' });
      }

      // Check permissions - need at least viewer access
      if (
        req.userRole !== 'super_admin' &&
        req.userRole !== 'admin' &&
        req.userRole !== 'manager' &&
        req.userRole !== 'member' &&
        req.userRole !== 'viewer'
      ) {
        return res.status(403).json({ error: 'Insufficient permissions to view CTQ factors' });
      }

      // Only allow access to own tenant unless super_admin
      if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only view CTQ factors for your own organization' });
      }

      // Get the factor
      const factor = await (getDb(req) as any)
        .select()
        .from(ctqFactors)
        .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, tenantId)))
        .limit(1);

      if (factor.length === 0) {
        return res.status(404).json({ error: 'CTQ factor not found' });
      }

      return res.json(factor[0]);
    } catch (error) {
      logger.error(
        `Error fetching CTQ factor ${req.params.factorId} for tenant ${req.params.tenantId}`,
        { error }
      );
      return res.status(500).json({ error: 'Failed to fetch CTQ factor' });
    }
  }
);

/**
 * Create a new CTQ factor
 */
router.post(
  '/:tenantId/ctq-factors',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);

      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // Check permissions - need admin or manager access
      if (
        req.userRole !== 'super_admin' &&
        req.userRole !== 'admin' &&
        req.userRole !== 'manager'
      ) {
        return res.status(403).json({ error: 'Insufficient permissions to create CTQ factors' });
      }

      // Only allow access to own tenant unless super_admin
      if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only create CTQ factors for your own organization' });
      }

      // Validate the request body
      const validationResult = ctqFactorSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid CTQ factor data',
          details: validationResult.error.format(),
        });
      }

      const factorData = validationResult.data;

      // Create the CTQ factor using the tenant database helper
      const tenantDb = (getDb(req) as any);
      const createdFactor = await tenantDb.insert(ctqFactors, {
        ...factorData,
        createdById: req.userId,
        updatedById: req.userId,
      });

      return res.status(201).json(createdFactor[0]);
    } catch (error) {
      logger.error(`Error creating CTQ factor for tenant ${req.params.tenantId}`, { error });
      return res.status(500).json({ error: 'Failed to create CTQ factor' });
    }
  }
);

/**
 * Update a CTQ factor
 */
router.patch(
  '/:tenantId/ctq-factors/:factorId',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const factorId = parseInt(req.params.factorId as string);

      if (isNaN(tenantId) || isNaN(factorId)) {
        return res.status(400).json({ error: 'Invalid tenant ID or factor ID' });
      }

      // Check permissions - need admin or manager access
      if (
        req.userRole !== 'super_admin' &&
        req.userRole !== 'admin' &&
        req.userRole !== 'manager'
      ) {
        return res.status(403).json({ error: 'Insufficient permissions to update CTQ factors' });
      }

      // Only allow access to own tenant unless super_admin
      if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only update CTQ factors for your own organization' });
      }

      // Check if factor exists
      const existingFactor = await (getDb(req) as any)
        .select()
        .from(ctqFactors)
        .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, tenantId)))
        .limit(1);

      if (existingFactor.length === 0) {
        return res.status(404).json({ error: 'CTQ factor not found' });
      }

      // Validate the request body
      const validationResult = ctqFactorSchema.partial().safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid CTQ factor data',
          details: validationResult.error.format(),
        });
      }

      const factorData = validationResult.data;

      // Update the CTQ factor using the tenant database helper
      const tenantDb = (getDb(req) as any);
      const updatedFactor = await tenantDb.update(
        ctqFactors,
        {
          ...factorData,
          updatedById: req.userId,
          updatedAt: new Date(),
        },
        eq(ctqFactors.id, factorId)
      );

      return res.json(updatedFactor[0]);
    } catch (error) {
      logger.error(
        `Error updating CTQ factor ${req.params.factorId} for tenant ${req.params.tenantId}`,
        { error }
      );
      return res.status(500).json({ error: 'Failed to update CTQ factor' });
    }
  }
);

/**
 * Delete a CTQ factor
 */
router.delete(
  '/:tenantId/ctq-factors/:factorId',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);
      const factorId = parseInt(req.params.factorId as string);

      if (isNaN(tenantId) || isNaN(factorId)) {
        return res.status(400).json({ error: 'Invalid tenant ID or factor ID' });
      }

      // Check permissions - need admin access
      if (req.userRole !== 'super_admin' && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions to delete CTQ factors' });
      }

      // Only allow access to own tenant unless super_admin
      if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only delete CTQ factors for your own organization' });
      }

      // Check if factor exists
      const existingFactor = await (getDb(req) as any)
        .select()
        .from(ctqFactors)
        .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, tenantId)))
        .limit(1);

      if (existingFactor.length === 0) {
        return res.status(404).json({ error: 'CTQ factor not found' });
      }

      // Check if factor is in use by any section gating rules
      const isInUse = await (getDb(req) as any).execute(
        `
      SELECT 1 FROM qmp_section_gating
      WHERE organization_id = $1 AND ctq_factors @> $2::jsonb
      LIMIT 1
    `,
        [tenantId, JSON.stringify([factorId])]
      );

      if (isInUse.rowCount > 0) {
        return res.status(400).json({
          error: 'Cannot delete CTQ factor that is in use',
          message:
            'This CTQ factor is currently used in section gating rules. Please update those rules before deleting this factor.',
        });
      }

      // Delete the CTQ factor using the tenant database helper
      const tenantDb = (getDb(req) as any);
      await tenantDb.delete(ctqFactors, eq(ctqFactors.id, factorId));

      return res.status(204).end();
    } catch (error) {
      logger.error(
        `Error deleting CTQ factor ${req.params.factorId} for tenant ${req.params.tenantId}`,
        { error }
      );
      return res.status(500).json({ error: 'Failed to delete CTQ factor' });
    }
  }
);

/**
 * Batch CTQ factor operations
 */
router.post(
  '/:tenantId/ctq-factors/batch',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenantId as string);

      if (isNaN(tenantId)) {
        return res.status(400).json({ error: 'Invalid tenant ID' });
      }

      // Check permissions - need admin access
      if (req.userRole !== 'super_admin' && req.userRole !== 'admin') {
        return res.status(403).json({ error: 'Insufficient permissions for batch CTQ operations' });
      }

      // Only allow access to own tenant unless super_admin
      if (req.userRole !== 'super_admin' && tenantId !== req.tenantId) {
        return res
          .status(403)
          .json({ error: 'You can only perform batch operations for your own organization' });
      }

      // Validate the request body
      const batchSchema = z.object({
        operation: z.enum(['update-status', 'clone-template', 'apply-to-sections']),
        factorIds: z.array(z.number()).min(1),
        data: z.record(z.any()),
      });

      const validationResult = batchSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Invalid batch operation data',
          details: validationResult.error.format(),
        });
      }

      const { operation, factorIds, data } = validationResult.data;
      const tenantDb = (getDb(req) as any);

      // Perform the batch operation
      switch (operation) {
        case 'update-status':
          if (data.active === undefined) {
            return res.status(400).json({ error: 'Missing active status in data' });
          }

          // Update the active status of the specified factors
          for (const factorId of factorIds) {
            await tenantDb.update(
              ctqFactors,
              {
                active: data.active,
                updatedById: req.userId,
                updatedAt: new Date(),
              },
              eq(ctqFactors.id, factorId)
            );
          }

          return res.json({
            success: true,
            message: `Updated status of ${factorIds.length} CTQ factors`,
          });

        case 'clone-template':
          if (!data.templateId) {
            return res.status(400).json({ error: 'Missing templateId in data' });
          }

          // Clone factors from a template
          const templateFactors = await (getDb(req) as any)
            .select()
            .from(ctqFactors)
            .where(eq(ctqFactors.organizationId, parseInt(data.templateId)));

          const createdFactors = [];

          for (const template of templateFactors) {
            // Exclude ID and organization-specific fields
            const {
              id,
              organizationId,
              createdById,
              updatedById,
              createdAt,
              updatedAt,
              ...factorData
            } = template;

            // Create a new factor based on the template
            const newFactor = await tenantDb.insert(ctqFactors, {
              ...factorData,
              createdById: req.userId,
              updatedById: req.userId,
            });

            createdFactors.push(newFactor[0]);
          }

          return res.json({
            success: true,
            factors: createdFactors,
            message: `Cloned ${createdFactors.length} CTQ factors from template`,
          });

        case 'apply-to-sections':
          if (!data.sections || !Array.isArray(data.sections)) {
            return res.status(400).json({ error: 'Missing or invalid sections array in data' });
          }

          const updatedFactors = [];

          // Apply the factors to multiple sections
          for (const factorId of factorIds) {
            for (const section of data.sections) {
              // Get the existing factor
              const [existingFactor] = await tenantDb.select(
                ctqFactors,
                eq(ctqFactors.id, factorId)
              );

              if (!existingFactor) continue;

              // Create a new factor for each section, based on the existing one
              const { id, ...factorData } = existingFactor;

              const newFactor = await tenantDb.insert(ctqFactors, {
                ...factorData,
                sectionCode: section,
                createdById: req.userId,
                updatedById: req.userId,
              });

              updatedFactors.push(newFactor[0]);
            }
          }

          return res.json({
            success: true,
            factors: updatedFactors,
            message: `Applied ${factorIds.length} CTQ factors to ${data.sections.length} sections`,
          });

        default:
          return res.status(400).json({ error: 'Unsupported batch operation' });
      }
    } catch (error) {
      logger.error(`Error performing batch operation for tenant ${req.params.tenantId}`, { error });
      return res.status(500).json({ error: 'Failed to perform batch operation' });
    }
  }
);

export default router;
