/**
 * Quality Management API Layer
 *
 * This module serves as a unified API layer for all quality management functionality,
 * integrating CTQ factors, section gating, and quality validation.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, eq, SQL, sql } from 'drizzle-orm';
import { qmpSectionGating, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { getDb } from '../db/tenantDbHelper';
import { createScopedLogger } from '../utils/logger';
import { storeInCache, getFromCache, invalidateCache } from '../cache/tenantCache';

// Import the specialized routes
import ctqFactorsRouter from './tenant-ctq-factors';
import sectionGatingRouter from './tenant-section-gating';
import qualityValidationRouter from './tenant-quality-validation';

const logger = createScopedLogger('quality-management-api');
const router = Router();

// Mount specialized routes
router.use('/ctq-factors', ctqFactorsRouter);
router.use('/section-gating', sectionGatingRouter);
router.use('/validation', qualityValidationRouter);

/**
 * Get QMP Dashboard Statistics
 * Provides unified statistics across CTQ factors, section gating, and validation results
 */
router.get('/dashboard/:qmpId', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // Try to get from cache first
    const cacheKey = `qmp-dashboard-${qmpIdNumber}`;
    const cachedData = getFromCache<any>(organizationId, 'qmp', cacheKey);

    if (cachedData) {
      logger.debug('Retrieved QMP dashboard from cache', { qmpId: qmpIdNumber });
      return res.json(cachedData);
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

    const qmp = qmps[0];

    // Get all gating rules for this QMP
    const gatingRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(
          eq(qmpSectionGating.organizationId, organizationId),
          eq(qmpSectionGating.qmpId, qmpIdNumber)
        )
      );

    // Get all CTQ factors for this organization
    const allFactors = await getDb(req)
      .select()
      .from(ctqFactors)
      .where(eq(ctqFactors.organizationId, organizationId));

    // Filter factors by those referenced in gating rules
    const factorIds = new Set();
    gatingRules.forEach(rule => {
      if (rule.requiredCtqFactorIds && Array.isArray(rule.requiredCtqFactorIds)) {
        rule.requiredCtqFactorIds.forEach((id: number) => factorIds.add(id));
      }
    });

    const relatedFactors = allFactors.filter(factor => factorIds.has(factor.id));

    // Calculate statistics
    const sectionStats = {
      totalSections: gatingRules.length,
      sectionsByGateLevel: {
        hard: gatingRules.filter(rule => rule.minimumMandatoryCompletion === 100).length,
        soft: gatingRules.filter(
          rule => rule.minimumMandatoryCompletion < 100 && rule.minimumMandatoryCompletion >= 80
        ).length,
        info: gatingRules.filter(rule => rule.minimumMandatoryCompletion < 80).length,
      },
      activeSections: gatingRules.filter(rule => rule.active === true).length,
      inactiveSections: gatingRules.filter(rule => rule.active === false).length,
      sectionsAllowingOverride: gatingRules.filter(rule => rule.allowOverride === true).length,
    };

    const factorStats = {
      totalFactors: relatedFactors.length,
      factorsByRiskLevel: {
        high: relatedFactors.filter(factor => factor.riskLevel === 'high').length,
        medium: relatedFactors.filter(factor => factor.riskLevel === 'medium').length,
        low: relatedFactors.filter(factor => factor.riskLevel === 'low').length,
      },
      activeFactors: relatedFactors.filter(factor => factor.active === true).length,
      inactiveFactors: relatedFactors.filter(factor => factor.active === false).length,
      requiredFactors: relatedFactors.filter(factor => factor.required === true).length,
    };

    // Build dashboard data
    const dashboard = {
      qmp: {
        id: qmp.id,
        name: qmp.name,
        version: qmp.version,
        status: qmp.status,
        createdAt: qmp.createdAt,
        updatedAt: qmp.updatedAt,
      },
      sections: sectionStats,
      factors: factorStats,
      overallCompleteness: (factorStats.activeFactors / (factorStats.totalFactors || 1)) * 100,
      riskProfile: {
        highRiskPercentage:
          (factorStats.factorsByRiskLevel.high / (factorStats.totalFactors || 1)) * 100,
        mediumRiskPercentage:
          (factorStats.factorsByRiskLevel.medium / (factorStats.totalFactors || 1)) * 100,
        lowRiskPercentage:
          (factorStats.factorsByRiskLevel.low / (factorStats.totalFactors || 1)) * 100,
      },
    };

    // Store in cache for future requests
    storeInCache(organizationId, 'qmp', cacheKey, dashboard, 2); // Higher priority for dashboard

    return res.json(dashboard);
  } catch (error) {
    logger.error(`Error getting QMP dashboard data for QMP ${req.params.qmpId}`, { error });
    return res.status(500).json({ error: 'Failed to get QMP dashboard data' });
  }
});

/**
 * Run a batch validation for multiple sections
 */
router.post('/batch-validate', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { organizationId } = req.tenantContext;

    // Validate request payload
    const batchValidationSchema = z.object({
      qmpId: z.number(),
      sections: z.array(
        z.object({
          sectionCode: z.string(),
          content: z.string(),
        })
      ),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = batchValidationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid batch validation request',
        details: validationResult.error.format(),
      });
    }

    const { qmpId, sections, metadata } = validationResult.data;

    // Check if QMP exists
    const qmps = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpId)
        )
      )
      .limit(1);

    if (qmps.length === 0) {
      return res.status(404).json({ error: 'Quality Management Plan not found' });
    }

    const sectionCodes = sections.map(s => s.sectionCode);

    // Get all active gating rules for the requested sections
    const gatingRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(
          eq(qmpSectionGating.organizationId, organizationId),
          eq(qmpSectionGating.qmpId, qmpId),
          eq(qmpSectionGating.active, true),
          sql`${qmpSectionGating.sectionKey} = ANY(${sectionCodes})`
        )
      );

    // If no rules found, all sections pass automatically
    if (gatingRules.length === 0) {
      return res.json({
        valid: true,
        message: 'No quality gating rules defined for these sections',
        sectionResults: sectionCodes.map(code => ({
          sectionCode: code,
          valid: true,
          message: 'No gating rules defined for this section',
          validations: [],
        })),
      });
    }

    // Get all CTQ factors for these rules
    const ctqFactorIds = gatingRules
      .map(rule => rule.requiredCtqFactorIds || [])
      .flat()
      .filter((v, i, a) => a.indexOf(v) === i); // Unique factor IDs

    let ctqFactorDetails = [];
    if (ctqFactorIds.length > 0) {
      ctqFactorDetails = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            sql`${ctqFactors.id} = ANY(${ctqFactorIds})`
          )
        );
    }

    // Process each section
    const sectionResults = await Promise.all(
      sections.map(async section => {
        const { sectionCode, content } = section;

        // Find the rule for this section
        const rule = gatingRules.find(r => r.sectionKey === sectionCode);

        // If no rule, section automatically passes
        if (!rule) {
          return {
            sectionCode,
            valid: true,
            message: 'No gating rules defined for this section',
            validations: [],
          };
        }

        // Get factors for this section
        const requiredFactorIds = rule.requiredCtqFactorIds || [];
        const factors = ctqFactorDetails.filter(f => requiredFactorIds.includes(f.id));

        // Validate against each factor
        const validationResults = [];
        let hasHardFailures = false;
        let hasSoftFailures = false;

        for (const factor of factors) {
          // Skip inactive factors
          if (factor.active === false) continue;

          let validationPassed = true;
          let validationMessage = '';

          // Check content against factor rule
          if (factor.validationRule) {
            try {
              // Simple keyword checking (in a real system, this would be more sophisticated)
              const contentLower = content.toLowerCase();
              const requiredTerms = factor.validationRule
                .toLowerCase()
                .split(',')
                .map((term: string) => term.trim());

              // Check if all required terms are present
              const missingTerms = requiredTerms.filter(
                (term: string) => !contentLower.includes(term)
              );

              if (missingTerms.length > 0) {
                validationPassed = false;
                validationMessage = `Missing required terms: ${missingTerms.join(', ')}`;

                // Mark as hard or soft failure based on factor risk level
                if (factor.riskLevel === 'high') {
                  hasHardFailures = true;
                } else if (factor.riskLevel === 'medium') {
                  hasSoftFailures = true;
                }
              }
            } catch (error) {
              logger.error('Error evaluating validation rule', {
                error,
                rule: factor.validationRule,
              });
              validationPassed = false;
              validationMessage = 'Error evaluating validation rule';
            }
          }

          validationResults.push({
            factorId: factor.id,
            factorName: factor.name,
            category: factor.category,
            riskLevel: factor.riskLevel,
            passed: validationPassed,
            message: validationMessage || `Validation ${validationPassed ? 'passed' : 'failed'}`,
            details: factor.description,
          });
        }

        // Determine validation level based on gating configuration
        let valid = true;
        let gatingStatusMessage = 'Section meets quality requirements';
        let gatingLevel = 'soft';

        if (rule.minimumMandatoryCompletion === 100) {
          // Hard gate - any high risk failures block
          gatingLevel = 'hard';
          if (hasHardFailures) {
            valid = false;
            gatingStatusMessage = 'Section contains critical quality issues';
          }
        } else if (rule.minimumMandatoryCompletion >= 80) {
          // Soft gate - high risk failures block, medium risk warn
          gatingLevel = 'soft';
          if (hasHardFailures) {
            valid = false;
            gatingStatusMessage = 'Section contains critical quality issues';
          } else if (hasSoftFailures) {
            valid = true; // Still valid but with warnings
            gatingStatusMessage = 'Section contains quality warnings';
          }
        } else {
          // Info level - nothing blocks, just provide information
          gatingLevel = 'info';
          valid = true;
          if (hasHardFailures) {
            gatingStatusMessage = 'Section contains critical quality issues (informational)';
          } else if (hasSoftFailures) {
            gatingStatusMessage = 'Section contains quality warnings (informational)';
          }
        }

        return {
          sectionCode,
          valid,
          gatingLevel,
          message: gatingStatusMessage,
          allowOverride: rule.allowOverride,
          validations: validationResults,
        };
      })
    );

    // Determine overall validation result
    const hasAnyHardFailures = sectionResults.some(
      section => section.gatingLevel === 'hard' && !section.valid
    );

    const hasAnySoftFailures = sectionResults.some(
      section =>
        section.valid === false || (section.validations && section.validations.some(v => !v.passed))
    );

    return res.json({
      valid: !hasAnyHardFailures,
      hasWarnings: hasAnySoftFailures,
      message: hasAnyHardFailures
        ? 'One or more sections contain critical quality issues'
        : hasAnySoftFailures
          ? 'Sections contain quality warnings'
          : 'All sections meet quality requirements',
      metadata,
      timestamp: new Date().toISOString(),
      sectionResults,
    });
  } catch (error) {
    logger.error('Error performing batch validation', { error });
    return res.status(500).json({ error: 'Failed to validate sections' });
  }
});

/**
 * Get quality metrics for a CER project
 */
router.get(
  '/metrics/:cerProjectId',
  authMiddleware,
  requireOrganizationContext,
  async (req, res) => {
    try {
      const { cerProjectId } = req.params;
      const { organizationId } = req.tenantContext;

      // Convert to number
      const cerProjectIdNumber = parseInt(cerProjectId, 10);
      if (isNaN(cerProjectIdNumber)) {
        return res.status(400).json({ error: 'Invalid CER Project ID' });
      }

      // Try to get metrics from cache
      const cacheKey = `cer-quality-metrics-${cerProjectIdNumber}`;
      const cachedMetrics = getFromCache<any>(organizationId, 'cer-metrics', cacheKey);

      if (cachedMetrics) {
        logger.debug('Retrieved quality metrics from cache', { cerProjectId: cerProjectIdNumber });
        return res.json(cachedMetrics);
      }

      // If we reach here, we need to calculate the metrics
      // In a real implementation, this would examine validation results,
      // section completeness, and other quality data stored in the database

      // For now, we'll provide a placeholder response
      const metrics = {
        cerProjectId: cerProjectIdNumber,
        qmpId: 1, // This would normally be retrieved from the CER project
        overallQualityScore: 85,
        sectionsCompleted: 8,
        totalSections: 10,
        validatedSections: 6,
        sectionsWithWarnings: 2,
        sectionsWithCriticalIssues: 0,
        activeWaivers: 1,
        timestamp: new Date().toISOString(),
        complianceStatus: 'in-progress',
      };

      // Store in cache
      storeInCache(organizationId, 'cer-metrics', cacheKey, metrics);

      return res.json(metrics);
    } catch (error) {
      logger.error(`Error getting quality metrics for CER project ${req.params.cerProjectId}`, {
        error,
      });
      return res.status(500).json({ error: 'Failed to get quality metrics' });
    }
  }
);

/**
 * Get all quality management plans
 */
router.get('/plans', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { organizationId } = req.tenantContext;

    // Get all QMPs for this organization
    const qmps = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(eq(qualityManagementPlans.organizationId, organizationId));

    return res.json(qmps);
  } catch (error) {
    logger.error('Error retrieving quality management plans', { error });
    return res.status(500).json({ error: 'Failed to retrieve quality management plans' });
  }
});

/**
 * Get a specific quality management plan
 */
router.get('/plans/:id', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert to number
    const qmpId = parseInt(id, 10);
    if (isNaN(qmpId)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // Try to get QMP from cache
    const cacheKey = `qmp-detail-${qmpId}`;
    const cachedQmp = getFromCache<any>(organizationId, 'qmp', cacheKey);

    if (cachedQmp) {
      logger.debug('Retrieved QMP from cache', { qmpId });
      return res.json(cachedQmp);
    }

    // Get the QMP
    const qmps = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpId)
        )
      )
      .limit(1);

    if (qmps.length === 0) {
      return res.status(404).json({ error: 'Quality Management Plan not found' });
    }

    const qmp = qmps[0];

    // Get all gating rules for this QMP
    const gatingRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(eq(qmpSectionGating.organizationId, organizationId), eq(qmpSectionGating.qmpId, qmpId))
      );

    // Get all CTQ factors for this QMP
    const ctqFactorIds = gatingRules
      .map(rule => rule.requiredCtqFactorIds || [])
      .flat()
      .filter((v, i, a) => a.indexOf(v) === i); // Unique factor IDs

    let ctqFactorDetails = [];
    if (ctqFactorIds.length > 0) {
      ctqFactorDetails = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            sql`${ctqFactors.id} = ANY(${ctqFactorIds})`
          )
        );
    }

    // Build the enriched QMP object
    const enrichedQmp = {
      ...qmp,
      sections: gatingRules.map(rule => ({
        ...rule,
        ctqFactors: rule.requiredCtqFactorIds
          ? ctqFactorDetails.filter(f => rule.requiredCtqFactorIds.includes(f.id))
          : [],
      })),
    };

    // Store in cache for future requests
    storeInCache(organizationId, 'qmp', cacheKey, enrichedQmp);

    return res.json(enrichedQmp);
  } catch (error) {
    logger.error(`Error retrieving QMP ${req.params.id}`, { error });
    return res.status(500).json({ error: 'Failed to retrieve Quality Management Plan' });
  }
});

/**
 * Create a new quality management plan
 */
router.post('/plans', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { organizationId, userId } = req.tenantContext;

    // Validate request payload
    const qmpSchema = z.object({
      name: z.string().min(3).max(100),
      version: z.string().default('1.0'),
      description: z.string().optional(),
      status: z.enum(['draft', 'active', 'archived']).default('draft'),
      allowWaivers: z.boolean().default(false),
      cerTypeId: z.number().optional(),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = qmpSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid QMP data',
        details: validationResult.error.format(),
      });
    }

    const qmpData = validationResult.data;

    // Create the QMP
    const createdQmp = await getDb(req)
      .insert(qualityManagementPlans)
      .values({
        ...qmpData,
        organizationId,
        createdById: userId,
        updatedById: userId,
      })
      .returning();

    // Invalidate any cache related to QMP listing
    invalidateCache(organizationId, 'qmp', 'plans');

    return res.status(201).json(createdQmp[0]);
  } catch (error) {
    logger.error('Error creating Quality Management Plan', { error });
    return res.status(500).json({ error: 'Failed to create Quality Management Plan' });
  }
});

/**
 * Update a quality management plan
 */
router.patch('/plans/:id', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId, userId } = req.tenantContext;

    // Convert to number
    const qmpId = parseInt(id, 10);
    if (isNaN(qmpId)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // Validate request payload
    const qmpUpdateSchema = z.object({
      name: z.string().min(3).max(100).optional(),
      version: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['draft', 'active', 'archived']).optional(),
      allowWaivers: z.boolean().optional(),
      cerTypeId: z.number().optional(),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = qmpUpdateSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid QMP update data',
        details: validationResult.error.format(),
      });
    }

    const qmpData = validationResult.data;

    // Check if QMP exists
    const existingQmp = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpId)
        )
      )
      .limit(1);

    if (existingQmp.length === 0) {
      return res.status(404).json({ error: 'Quality Management Plan not found' });
    }

    // Update the QMP
    const updatedQmp = await getDb(req)
      .update(qualityManagementPlans)
      .set({
        ...qmpData,
        updatedById: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpId)
        )
      )
      .returning();

    // Invalidate caches
    invalidateCache(organizationId, 'qmp', 'plans');
    invalidateCache(organizationId, 'qmp', `qmp-detail-${qmpId}`);
    invalidateCache(organizationId, 'qmp', `qmp-dashboard-${qmpId}`);

    return res.json(updatedQmp[0]);
  } catch (error) {
    logger.error(`Error updating QMP ${req.params.id}`, { error });
    return res.status(500).json({ error: 'Failed to update Quality Management Plan' });
  }
});

/**
 * Delete a quality management plan
 */
router.delete('/plans/:id', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.tenantContext;

    // Convert to number
    const qmpId = parseInt(id, 10);
    if (isNaN(qmpId)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // Check if QMP exists
    const existingQmp = await getDb(req)
      .select()
      .from(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpId)
        )
      )
      .limit(1);

    if (existingQmp.length === 0) {
      return res.status(404).json({ error: 'Quality Management Plan not found' });
    }

    // Check if the QMP is being used by section gating rules
    const usedRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(eq(qmpSectionGating.organizationId, organizationId), eq(qmpSectionGating.qmpId, qmpId))
      )
      .limit(1);

    if (usedRules.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete Quality Management Plan that is in use',
        message:
          'This QMP is currently used in section gating rules. Please delete those rules first.',
      });
    }

    // Delete the QMP
    await getDb(req)
      .delete(qualityManagementPlans)
      .where(
        and(
          eq(qualityManagementPlans.organizationId, organizationId),
          eq(qualityManagementPlans.id, qmpId)
        )
      );

    // Invalidate caches
    invalidateCache(organizationId, 'qmp', 'plans');
    invalidateCache(organizationId, 'qmp', `qmp-detail-${qmpId}`);
    invalidateCache(organizationId, 'qmp', `qmp-dashboard-${qmpId}`);

    return res.json({ success: true, message: 'Quality Management Plan deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting QMP ${req.params.id}`, { error });
    return res.status(500).json({ error: 'Failed to delete Quality Management Plan' });
  }
});

export default router;
