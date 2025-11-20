/**
 * Quality Validation Routes
 *
 * These endpoints handle validation of document sections against CTQ factors,
 * implementing risk-based quality controls through the gating system.
 */
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { qmpSectionGating, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { getDb } from '../db/tenantDbHelper';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('quality-validation-api');
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
  } catch (error) {
    logger.error(`Error checking if table ${tableName} exists`, { error });
    return false;
  }
}

/**
 * POST /api/quality/validation/validate-section
 *
 * Validates a single section against quality gating rules
 */
router.post('/validate-section', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { organizationId } = req.tenantContext || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // First check if required tables exist
    const [qmpSectionGatingExists, ctqFactorsExists] = await Promise.all([
      tableExists(req, 'qmp_section_gating'),
      tableExists(req, 'ctq_factors'),
    ]);

    if (!qmpSectionGatingExists || !ctqFactorsExists) {
      logger.warn('Validation tables not found, returning empty validation result', {
        qmpSectionGatingExists,
        ctqFactorsExists,
      });

      // Return a graceful response if tables don't exist yet
      return res.json({
        valid: true,
        message: 'Quality validation is not configured yet',
        validations: [],
      });
    }

    // Validate request body
    const validationSchema = z.object({
      qmpId: z.number(),
      sectionCode: z.string(),
      content: z.string(),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = validationSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validationResult.error.format(),
      });
    }

    const { qmpId, sectionCode, content } = validationResult.data;

    // Get the section gating rule for this QMP and section
    const gatingRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(
          eq(qmpSectionGating.organizationId, organizationId),
          eq(qmpSectionGating.qmpId, qmpId),
          eq(qmpSectionGating.sectionKey, sectionCode)
        )
      )
      .limit(1);

    if (gatingRules.length === 0) {
      // No gating rule found for this section
      return res.json({
        valid: true,
        message: 'No quality gating rule defined for this section',
        validations: [],
      });
    }

    const gatingRule = gatingRules[0];
    const ctqFactorIds = (gatingRule.requiredCtqFactorIds as number[]) || [];

    if (ctqFactorIds.length === 0) {
      // No CTQ factors to validate against
      return res.json({
        valid: true,
        message: 'No CTQ factors defined for this section',
        validations: [],
      });
    }

    // Get all referenced CTQ factors
    const factors = await getDb(req)
      .select()
      .from(ctqFactors)
      .where(
        and(
          eq(ctqFactors.organizationId, organizationId),
          sql`${ctqFactors.id} = ANY(${ctqFactorIds})`
        )
      );

    // Perform validation for each factor
    const validationResults = factors.map(factor => {
      // Simple text search validation based on validation criteria
      // In a real implementation, this could use more sophisticated validation
      const validationTerms = (factor.validationCriteria || '')
        .split(',')
        .map(term => term.trim().toLowerCase());
      const contentLower = content.toLowerCase();

      const allTermsPresent = validationTerms.every(term =>
        term.length > 0 ? contentLower.includes(term) : true
      );

      return {
        factorId: factor.id,
        factorName: factor.name,
        category: factor.category,
        riskLevel: factor.riskLevel,
        passed: allTermsPresent,
        message: allTermsPresent ? 'Validation passed' : 'Required terms not present in content',
        details: allTermsPresent
          ? 'All required terms are present'
          : `Missing terms: ${validationTerms
              .filter(term => term.length > 0 && !contentLower.includes(term))
              .join(', ')}`,
      };
    });

    // Calculate overall validation result
    // For HIGH risk factors, all must pass for validation to succeed
    const highRiskFactors = factors.filter(f => f.riskLevel === 'high');
    const highRiskResults = validationResults.filter(
      (_, index) => factors[index].riskLevel === 'high'
    );

    const highRiskPassed = highRiskFactors.length === 0 || highRiskResults.every(r => r.passed);

    // Medium risk factors generate warnings but don't fail validation
    const mediumRiskWarnings = validationResults.filter(
      (r, index) => !r.passed && factors[index].riskLevel === 'medium'
    );

    // Low risk factors are just informational
    const lowRiskInfo = validationResults.filter(
      (r, index) => !r.passed && factors[index].riskLevel === 'low'
    );

    // Determine the overall gating level based on rule
    const gatingLevel = gatingRule.requiredLevel || (highRiskFactors.length > 0 ? 'hard' : 'soft');

    return res.json({
      valid: highRiskPassed,
      gatingLevel,
      message: highRiskPassed
        ? 'Section meets quality requirements'
        : 'Section fails to meet quality requirements',
      warnings: mediumRiskWarnings.length,
      infos: lowRiskInfo.length,
      validations: validationResults,
    });
  } catch (error) {
    logger.error('Error validating section against quality rules', { error });
    return res.status(500).json({
      error: 'Failed to validate section',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/quality/validation/batch-validate
 *
 * Validates multiple sections at once
 */
router.post('/batch-validate', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { organizationId } = req.tenantContext || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // First check if required tables exist
    const [qmpSectionGatingExists, ctqFactorsExists] = await Promise.all([
      tableExists(req, 'qmp_section_gating'),
      tableExists(req, 'ctq_factors'),
    ]);

    if (!qmpSectionGatingExists || !ctqFactorsExists) {
      logger.warn('Validation tables not found, returning empty batch validation result', {
        qmpSectionGatingExists,
        ctqFactorsExists,
      });

      // Return a graceful response if tables don't exist yet
      return res.json({
        valid: true,
        message: 'Quality validation is not configured yet',
        sections: [],
      });
    }

    // Validate request body
    const validationSchema = z.object({
      qmpId: z.number(),
      sections: z.array(
        z.object({
          sectionCode: z.string(),
          content: z.string(),
        })
      ),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = validationSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validationResult.error.format(),
      });
    }

    const { qmpId, sections } = validationResult.data;

    // Get all section gating rules for this QMP
    const gatingRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(eq(qmpSectionGating.organizationId, organizationId), eq(qmpSectionGating.qmpId, qmpId))
      );

    // Create a map for quick lookup of gating rules by section code
    const gatingRulesBySection = new Map();
    gatingRules.forEach(rule => {
      gatingRulesBySection.set(rule.sectionKey, rule);
    });

    // Collect all CTQ factor IDs from all gating rules
    const allFactorIds = new Set<number>();
    gatingRules.forEach(rule => {
      const factorIds = (rule.requiredCtqFactorIds as number[]) || [];
      factorIds.forEach(id => allFactorIds.add(id));
    });

    // Fetch all CTQ factors if we have any
    let factors: any[] = [];
    if (allFactorIds.size > 0) {
      factors = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            sql`${ctqFactors.id} = ANY(${Array.from(allFactorIds)})`
          )
        );
    }

    // Create a map for quick lookup of factors by ID
    const factorsById = new Map();
    factors.forEach(factor => {
      factorsById.set(factor.id, factor);
    });

    // Process each section in the batch
    const sectionResults = await Promise.all(
      sections.map(async section => {
        const { sectionCode, content } = section;
        const gatingRule = gatingRulesBySection.get(sectionCode);

        if (!gatingRule) {
          // No gating rule for this section
          return {
            sectionCode,
            valid: true,
            message: 'No quality gating rule defined for this section',
            validations: [],
          };
        }

        const ctqFactorIds = (gatingRule.requiredCtqFactorIds as number[]) || [];

        if (ctqFactorIds.length === 0) {
          // No CTQ factors for this section
          return {
            sectionCode,
            valid: true,
            message: 'No CTQ factors defined for this section',
            validations: [],
          };
        }

        // Get all factors for this section
        const sectionFactors = ctqFactorIds.map(id => factorsById.get(id)).filter(Boolean);

        // Perform validation for each factor
        const validationResults = sectionFactors.map(factor => {
          const validationTerms = (factor.validationCriteria || '')
            .split(',')
            .map(term => term.trim().toLowerCase());

          const contentLower = content.toLowerCase();

          const allTermsPresent = validationTerms.every(term =>
            term.length > 0 ? contentLower.includes(term) : true
          );

          return {
            factorId: factor.id,
            factorName: factor.name,
            category: factor.category,
            riskLevel: factor.riskLevel,
            passed: allTermsPresent,
            message: allTermsPresent
              ? 'Validation passed'
              : 'Required terms not present in content',
            details: allTermsPresent
              ? 'All required terms are present'
              : `Missing terms: ${validationTerms
                  .filter(term => term.length > 0 && !contentLower.includes(term))
                  .join(', ')}`,
          };
        });

        // Calculate overall validation result for this section
        const highRiskFactors = sectionFactors.filter(f => f.riskLevel === 'high');
        const highRiskResults = validationResults.filter(
          (_, index) => sectionFactors[index].riskLevel === 'high'
        );

        const highRiskPassed = highRiskFactors.length === 0 || highRiskResults.every(r => r.passed);

        // Medium risk factors generate warnings but don't fail validation
        const mediumRiskWarnings = validationResults.filter(
          (r, index) => !r.passed && sectionFactors[index].riskLevel === 'medium'
        );

        // Low risk factors are just informational
        const lowRiskInfo = validationResults.filter(
          (r, index) => !r.passed && sectionFactors[index].riskLevel === 'low'
        );

        // Determine the overall gating level based on rule
        const gatingLevel =
          gatingRule.requiredLevel || (highRiskFactors.length > 0 ? 'hard' : 'soft');

        return {
          sectionCode,
          valid: highRiskPassed,
          gatingLevel,
          message: highRiskPassed
            ? 'Section meets quality requirements'
            : 'Section fails to meet quality requirements',
          warnings: mediumRiskWarnings.length,
          infos: lowRiskInfo.length,
          validations: validationResults,
        };
      })
    );

    // Calculate overall batch validation result
    const allSectionsValid = sectionResults.every(section => section.valid);

    return res.json({
      valid: allSectionsValid,
      message: allSectionsValid
        ? 'All sections meet quality requirements'
        : 'One or more sections fail to meet quality requirements',
      sections: sectionResults,
    });
  } catch (error) {
    logger.error('Error batch validating sections against quality rules', { error });
    return res.status(500).json({
      error: 'Failed to batch validate sections',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/quality/validation/stats/:qmpId
 *
 * Get validation statistics for a QMP
 */
router.get('/stats/:qmpId', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = req.tenantContext || {};

    if (!organizationId) {
      return res.status(400).json({ error: 'Missing tenant context' });
    }

    // Convert to number
    const qmpIdNumber = parseInt(qmpId, 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }

    // First check if required tables exist
    const [qmpSectionGatingExists, ctqFactorsExists, qmpExists] = await Promise.all([
      tableExists(req, 'qmp_section_gating'),
      tableExists(req, 'ctq_factors'),
      tableExists(req, 'quality_management_plans'),
    ]);

    if (!qmpSectionGatingExists || !ctqFactorsExists || !qmpExists) {
      logger.warn('Validation tables not found, returning empty stats', {
        qmpSectionGatingExists,
        ctqFactorsExists,
        qmpExists,
      });

      // Return a graceful response if tables don't exist yet
      return res.json({
        qmpId: qmpIdNumber,
        totalSections: 0,
        sectionsWithRules: 0,
        totalFactors: 0,
        factorsInUse: 0,
        highRiskFactors: 0,
        mediumRiskFactors: 0,
        lowRiskFactors: 0,
        hardGates: 0,
        softGates: 0,
        sectionsPassingAll: 0,
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

    // Get number of CER sections (if available)
    let totalSections = 0;
    try {
      const hasCerSectionsTable = await tableExists(req, 'cer_sections');
      if (hasCerSectionsTable) {
        // Use a simple count query instead of referencing cerSections
        const sectionsCount = await getDb(req).execute(sql`SELECT COUNT(*) FROM cer_sections`);

        totalSections = parseInt(sectionsCount.rows[0]?.count || '0', 10);
      }
    } catch (error) {
      logger.warn('Error counting CER sections', { error });
    }

    // Get all CTQ factors for this tenant
    const factors = await getDb(req)
      .select()
      .from(ctqFactors)
      .where(eq(ctqFactors.organizationId, organizationId));

    // Collect all CTQ factor IDs from all gating rules
    const factorIdsInUse = new Set<number>();
    gatingRules.forEach(rule => {
      const factorIds = (rule.requiredCtqFactorIds as number[]) || [];
      factorIds.forEach(id => factorIdsInUse.add(id));
    });

    // Calculate statistics
    const stats = {
      qmpId: qmpIdNumber,
      totalSections: totalSections || 0,
      sectionsWithRules: gatingRules.length,
      totalFactors: factors.length,
      factorsInUse: factorIdsInUse.size,
      highRiskFactors: factors.filter(f => f.riskLevel === 'high').length,
      mediumRiskFactors: factors.filter(f => f.riskLevel === 'medium').length,
      lowRiskFactors: factors.filter(f => f.riskLevel === 'low').length,
      hardGates: gatingRules.filter(r => r.requiredLevel === 'hard').length,
      softGates: gatingRules.filter(r => r.requiredLevel === 'soft').length,
      sectionsPassingAll: 0, // This would be populated from actual validation results
    };

    return res.json(stats);
  } catch (error) {
    logger.error('Error retrieving validation statistics', { error });
    return res.status(500).json({
      error: 'Failed to retrieve validation statistics',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

export default router;
