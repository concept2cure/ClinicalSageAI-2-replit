/**
 * Tenant Quality Validation API Routes
 *
 * These endpoints handle validation of document sections against CTQ factors,
 * implementing risk-based quality controls through the gating system.
 */
import { Router, Request } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { qmpSectionGating, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { getDb } from '../db/tenantDbHelper';
import { createScopedLogger } from '../utils/logger';
import { neverSaved } from '../services/qms/governed-qms-write';

const logger = createScopedLogger('quality-validation-api');

// requireOrganizationContext guarantees a numeric org id at runtime; assert
// + coerce so handlers get a definite `number` (req.tenantContext is
// `{...} | undefined` with `string | number | null` ids).
function orgIdOf(req: Request): number {
  const v = req.tenantContext?.organizationId;
  if (v === undefined || v === null || v === '') {
    throw new Error('organization context required');
  }
  return typeof v === 'string' ? parseInt(v, 10) : v;
}
const router = Router();

/**
 * Validate a document section against quality gating rules
 */
router.post('/validate-section', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const organizationId = orgIdOf(req);

    // Validate request payload
    const validationSchema = z.object({
      qmpId: z.number(),
      sectionCode: z.string(),
      content: z.string(),
      metadata: z.record(z.any()).optional(),
    });

    const validationResult = validationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid validation request',
        details: validationResult.error.format(),
      });
    }

    const { qmpId, sectionCode, content } = validationResult.data;

    // Get gating rules for this section. The schema keys sections by
    // `sectionKey`; there is no separate active flag, so all rules are live.
    const gatingRules = await getDb(req)
      .select()
      .from(qmpSectionGating)
      .where(
        and(
          eq(qmpSectionGating.organizationId, organizationId),
          eq(qmpSectionGating.qmpId, qmpId),
          eq(qmpSectionGating.sectionKey, sectionCode)
        )
      );

    if (gatingRules.length === 0) {
      return res.json({
        valid: true,
        message: 'No quality gating rules defined for this section',
        validations: [],
      });
    }

    // Get the main gating rule
    const gatingRule = gatingRules[0];

    // Get all CTQ factors referenced by this gating rule. Referenced ids are
    // stored as a JSON array in `requiredCtqFactorIds`.
    const requiredFactorIds = Array.isArray(gatingRule.requiredCtqFactorIds)
      ? (gatingRule.requiredCtqFactorIds as number[])
      : [];
    let ctqFactorDetails: Array<typeof ctqFactors.$inferSelect> = [];
    if (requiredFactorIds.length > 0) {
      ctqFactorDetails = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            sql`${ctqFactors.id} = ANY(${requiredFactorIds})`
          )
        );
    }

    // Perform validation based on each factor
    const validationResults = [];
    let hasHardFailures = false;
    let hasSoftFailures = false;

    for (const factor of ctqFactorDetails) {
      // Skip inactive factors
      if (factor.status !== 'active') continue;

      let validationPassed = true;
      let validationMessage = '';

      // Check content against factor rule (validationCriteria holds the rule text)
      if (factor.validationCriteria) {
        try {
          // For now, simple keyword checking - in real app, this would be more sophisticated
          const contentLower = content.toLowerCase();
          const requiredTerms = factor.validationCriteria
            .toLowerCase()
            .split(',')
            .map((term: any) => term.trim());

          // Check if all required terms are present
          const missingTerms = requiredTerms.filter((term: any) => !contentLower.includes(term));

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
            rule: factor.validationCriteria,
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

    // The schema has no separate custom-validation collection on a gating
    // rule, so only CTQ-factor validations are evaluated here.

    // Determine overall validation status based on gating strictness. The
    // schema does not store an explicit gating level, so derive it: a rule
    // that does not allow overrides is treated as a hard gate, otherwise soft.
    const gatingLevel = gatingRule.allowOverride ? 'soft' : 'hard';
    let valid = true;
    let gatingStatusMessage = 'Section meets quality requirements';

    if (gatingLevel === 'hard') {
      // Hard gate - any high risk failures block
      if (hasHardFailures) {
        valid = false;
        gatingStatusMessage = 'Section contains critical quality issues';
      }
    } else {
      // Soft gate - high risk failures block, medium risk warn
      if (hasHardFailures) {
        valid = false;
        gatingStatusMessage = 'Section contains critical quality issues';
      } else if (hasSoftFailures) {
        valid = true; // Still valid but with warnings
        gatingStatusMessage = 'Section contains quality warnings';
      }
    }

    // Return validation results
    return res.json({
      valid,
      gatingLevel,
      message: gatingStatusMessage,
      validations: validationResults,
    });
  } catch (error) {
    logger.error('Error validating section', error);
    return res.status(500).json({ error: 'Failed to validate section' });
  }
});

/**
 * Request quality override/waiver for a gating rule — not available.
 *
 * Until 2026-09-23 this wrote nothing, invented a waiver
 * `{ id: Date.now(), status: 'pending', … }` and answered 201 "Quality waiver
 * request submitted successfully". There is no waiver table and no route that
 * approves one, so the "pending" request existed only in that response. It now
 * refuses before reading or writing anything. Pinned by
 * server/routes/__tests__/qms-subrouters-governed.test.ts.
 */
router.post(
  '/request-waiver',
  authMiddleware,
  requireOrganizationContext,
  neverSaved('Quality waiver requests are not available: a waiver request is not recorded anywhere and nothing can approve one. Nothing was submitted.')
);

/**
 * Get all quality validation statistics for a QMP
 */
router.get('/stats/:qmpId', authMiddleware, requireOrganizationContext, async (req, res) => {
  try {
    const qmpId = String(req.params.qmpId);
    const organizationId = orgIdOf(req);

    // Convert to number
    const qmpIdNumber = parseInt(String(qmpId), 10);
    if (isNaN(qmpIdNumber)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
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

    // Calculate statistics. Gating strictness is derived from override
    // allowance (no overrides => hard gate); the schema has no inactive state,
    // so all rules count as active.
    const stats = {
      totalRules: gatingRules.length,
      hardGates: gatingRules.filter(rule => !rule.allowOverride).length,
      softGates: gatingRules.filter(rule => rule.allowOverride).length,
      infoGates: 0,
      activeRules: gatingRules.length,
      inactiveRules: 0,
      // This would normally include stats on validation results and waivers
      // We'll just return the basic stats for now
    };

    return res.json({
      qmpId: qmpIdNumber,
      stats,
    });
  } catch (error) {
    logger.error(`Error getting quality validation stats for QMP ${req.params.qmpId}`, error);
    return res.status(500).json({ error: 'Failed to get quality validation statistics' });
  }
});

export default router;
