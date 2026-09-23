/**
 * Quality Management API Layer
 *
 * This module serves as a unified API layer for all quality management functionality,
 * integrating CTQ factors, section gating, and quality validation.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { qmpSectionGating, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { governedActorId, requireEditorAccess } from '../middleware/orgMembership';
import { getDb } from '../db/tenantDbHelper';
import { requestPgClient, type RequestSqlClient } from '../db/requestDb';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { recordGovernedAction } from './c2c/actions';
import { createScopedLogger } from '../utils/logger';
import { storeInCache, getFromCache, invalidateCache } from '../cache/tenantCache';

// req.tenantContext is `{...} | undefined` and its ids are
// `string | number | null`, but requireOrganizationContext (applied to every
// route here) guarantees a numeric org id at runtime. These helpers assert
// + coerce so handlers get a definite `number` without per-route guards.
function orgIdOf(req: Request): number {
  const v = req.tenantContext?.organizationId;
  if (v === undefined || v === null || v === '') {
    throw new Error('organization context required');
  }
  return typeof v === 'string' ? parseInt(v, 10) : v;
}

/* ── Governed plan writes ─────────────────────────────────────────────────────
 * A QMP sets the hard / soft / info gates governed documents are validated
 * against, so creating, changing (activating) or deleting one is a governed
 * change to the document-control regime. These three routes did bare Drizzle
 * writes: no reason, no ledger row, nothing recording who activated a plan.
 *
 * Each now takes a reason (≥ 8 characters, trimmed) and runs BEGIN → tenant
 * vars → plan write → recordGovernedAction → COMMIT on the request-scoped
 * connection. `getDb(req)` is Drizzle over that same `req.dbClient`, so the
 * plan write and the ledger pair commit or roll back together, with the same
 * tenant scoping as before. A ledger failure is a 500 with the plan exactly as
 * it was — never a change with no record of it.
 *
 * Who may: `requireEditorAccess`, the repo's one governed-write role gate — a
 * `viewer` reads plans and cannot change the regime (§11.10(g)).
 * What is kept: the ledger payload carries every value the write overwrote or
 * destroyed — the whole row on create and delete, each changed field's from/to
 * on update — because the row keeps no history of its own (§11.10(e)). */
const PLAN_REASON = z.string().trim().min(8);

/** The trimmed reason, or null after answering 400. Runs before any write. */
function planReason(req: Request, res: Response): string | null {
  const parsed = PLAN_REASON.safeParse((req.body ?? {}).reason);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: 'REASON_REQUIRED',
    message: 'A reason of at least 8 characters is required to change a quality-management plan. Nothing was changed.',
  });
  return null;
}

/** The acting user (the canonical resolver requireEditorAccess pairs with), or
 *  null after answering 401: the ledger never records an unattributed change. */
function planActor(req: Request, res: Response): number | null {
  const userId = governedActorId(req);
  if (userId !== null) return userId;
  res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Sign in to change a quality-management plan. Nothing was changed.' });
  return null;
}

/** A refusal decided inside the transaction (not found, in use): rolled back, then answered as-is. */
class PlanRefusal extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body.error ?? 'refused'));
  }
}

const PLAN_VERB = { create: 'created', update: 'changed', delete: 'deleted' } as const;

/**
 * One governed plan write. `write` runs inside the transaction and returns the
 * ledger target/payload plus the response body; the ledger pair is written on
 * the same client before COMMIT. Answers the response itself in every branch;
 * returns true only when the change committed.
 */
async function governedPlanWrite(
  req: Request,
  res: Response,
  opts: { orgId: number; userId: number; reason: string; command: keyof typeof PLAN_VERB; failure: string },
  write: () => Promise<{ target: string; payload: Record<string, unknown>; status: number; body: unknown }>,
): Promise<boolean> {
  let client: RequestSqlClient;
  try {
    client = requestPgClient(req);
  } catch {
    res.status(500).json({ error: 'REQUEST_DB_CONTEXT_REQUIRED', message: 'No tenant-scoped database context on this request. Nothing was changed.' });
    return false;
  }
  let stage: 'write' | 'ledger' | 'commit' = 'write';
  let out: Awaited<ReturnType<typeof write>>;
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, opts.orgId);
    out = await write();
    stage = 'ledger';
    await recordGovernedAction(client, {
      orgId: opts.orgId,
      userId: opts.userId,
      command: opts.command,
      target: out.target,
      reason: opts.reason,
      payload: out.payload,
      domain: 'qms',
    });
    stage = 'commit';
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof PlanRefusal) {
      res.status(error.status).json(error.body);
      return false;
    }
    logger.error(`Quality Management Plan ${opts.command} failed at ${stage}`, { error });
    const sqlState = (error as { code?: string; cause?: { code?: string } } | null)?.code
      ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
    if (stage === 'write' && sqlState === '23503') {
      // A foreign key still points at the plan (CTQ factors, traceability rows).
      res.status(409).json({
        error: 'PLAN_IN_USE',
        message: `The plan was not ${PLAN_VERB[opts.command]}: other quality records (CTQ factors or traceability rows) still refer to it. Nothing was changed.`,
      });
    } else if (stage === 'ledger') {
      res.status(500).json({
        error: 'AUDIT_WRITE_FAILED',
        message: `The plan was not ${PLAN_VERB[opts.command]} because its audit record could not be written. Nothing was changed.`,
      });
    } else if (stage === 'commit') {
      // COMMIT itself failed, so whether it landed is not known: say so.
      res.status(500).json({
        error: 'OUTCOME_UNKNOWN',
        message: `The change could not be confirmed. Reload to check whether the plan was ${PLAN_VERB[opts.command]} before trying again.`,
      });
    } else {
      res.status(500).json({ error: opts.failure });
    }
    return false;
  }
  // Committed. Answered outside the try, so nothing after COMMIT can be
  // reported as a rollback.
  res.status(out.status).json(out.body);
  return true;
}

/** The plan row, locked for the rest of the transaction, or a 404 refusal. Same org predicate as every read here. */
async function lockedPlan(req: Request, organizationId: number, qmpId: number) {
  const rows = await getDb(req)
    .select()
    .from(qualityManagementPlans)
    .where(and(eq(qualityManagementPlans.organizationId, organizationId), eq(qualityManagementPlans.id, qmpId)))
    .limit(1)
    .for('update');
  if (rows.length === 0) throw new PlanRefusal(404, { error: 'Quality Management Plan not found' });
  return rows[0];
}

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
    const qmpId = String(req.params.qmpId);
    const organizationId = orgIdOf(req);

    // Convert to number
    const qmpIdNumber = parseInt(String(qmpId), 10);
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
    gatingRules.forEach((rule: any) => {
      if (rule.requiredCtqFactorIds && Array.isArray(rule.requiredCtqFactorIds)) {
        rule.requiredCtqFactorIds.forEach((id: number) => factorIds.add(id));
      }
    });

    const relatedFactors = allFactors.filter((factor: any) => factorIds.has(factor.id));

    // Calculate statistics. Gating level is derived from the mandatory
    // completion threshold (the schema has no explicit level), and there is no
    // inactive state on a gating rule, so all rules count as active.
    const sectionStats = {
      totalSections: gatingRules.length,
      sectionsByGateLevel: {
        hard: gatingRules.filter(rule => (rule.minimumMandatoryCompletion ?? 0) === 100).length,
        soft: gatingRules.filter(
          rule =>
            (rule.minimumMandatoryCompletion ?? 0) < 100 &&
            (rule.minimumMandatoryCompletion ?? 0) >= 80
        ).length,
        info: gatingRules.filter(rule => (rule.minimumMandatoryCompletion ?? 0) < 80).length,
      },
      activeSections: gatingRules.length,
      inactiveSections: 0,
      sectionsAllowingOverride: gatingRules.filter(rule => rule.allowOverride === true).length,
    };

    const factorStats = {
      totalFactors: relatedFactors.length,
      factorsByRiskLevel: {
        high: relatedFactors.filter(factor => factor.riskLevel === 'high').length,
        medium: relatedFactors.filter(factor => factor.riskLevel === 'medium').length,
        low: relatedFactors.filter(factor => factor.riskLevel === 'low').length,
      },
      activeFactors: relatedFactors.filter(factor => factor.status === 'active').length,
      inactiveFactors: relatedFactors.filter(factor => factor.status !== 'active').length,
      requiredFactors: relatedFactors.filter(factor => factor.requirementType === 'mandatory').length,
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
    const organizationId = orgIdOf(req);

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
      .map(rule => (rule.requiredCtqFactorIds as number[] | null) || [])
      .flat()
      .filter((v, i, a) => a.indexOf(v) === i); // Unique factor IDs

    let ctqFactorDetails: Array<typeof ctqFactors.$inferSelect> = [];
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
            validations: [] as Array<Record<string, unknown>>,
          };
        }

        // Get factors for this section
        const requiredFactorIds = (rule.requiredCtqFactorIds as number[] | null) || [];
        const factors = ctqFactorDetails.filter(f => requiredFactorIds.includes(f.id));

        // Validate against each factor
        const validationResults: Array<Record<string, unknown>> = [];
        let hasHardFailures = false;
        let hasSoftFailures = false;

        for (const factor of factors) {
          // Skip inactive factors
          if (factor.status !== 'active') continue;

          let validationPassed = true;
          let validationMessage = '';

          // Check content against factor rule (validationCriteria holds the rule text)
          if (factor.validationCriteria) {
            try {
              // Simple keyword checking (in a real system, this would be more sophisticated)
              const contentLower = content.toLowerCase();
              const requiredTerms = factor.validationCriteria
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

        // Determine validation level based on gating configuration
        let valid = true;
        let gatingStatusMessage = 'Section meets quality requirements';
        let gatingLevel = 'soft';

        const mandatoryCompletion = rule.minimumMandatoryCompletion ?? 0;
        if (mandatoryCompletion === 100) {
          // Hard gate - any high risk failures block
          gatingLevel = 'hard';
          if (hasHardFailures) {
            valid = false;
            gatingStatusMessage = 'Section contains critical quality issues';
          }
        } else if (mandatoryCompletion >= 80) {
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
      const cerProjectId = String(req.params.cerProjectId);

      // Convert to number
      const cerProjectIdNumber = parseInt(String(cerProjectId), 10);
      if (isNaN(cerProjectIdNumber)) {
        return res.status(400).json({ error: 'Invalid CER Project ID' });
      }

      // Real CER quality metrics (overall score, section completeness, validated
      // sections, critical-issue counts, active waivers) must be derived from the
      // project's actual validation results and section state. That aggregation
      // is not wired yet, so we fail closed with an honest 501 rather than
      // fabricate numbers. Previously this returned a hardcoded placeholder
      // (overallQualityScore: 85, sectionsWithCriticalIssues: 0, ...) AND cached
      // it — a direct misrepresentation of submission readiness to a regulated
      // user. No score is invented, and nothing fabricated is cached.
      return res.status(501).json({
        error: 'NOT_IMPLEMENTED',
        message:
          'Quality metrics for this CER project are not yet available: real ' +
          'validation-result and section-completeness aggregation is not wired. ' +
          'No fabricated score is returned.',
        cerProjectId: cerProjectIdNumber,
      });
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
    const organizationId = orgIdOf(req);

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
    const id = String(req.params.id);
    const organizationId = orgIdOf(req);

    // Convert to number
    const qmpId = parseInt(String(id), 10);
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
      .map(rule => (rule.requiredCtqFactorIds as number[] | null) || [])
      .flat()
      .filter((v, i, a) => a.indexOf(v) === i); // Unique factor IDs

    let ctqFactorDetails: Array<typeof ctqFactors.$inferSelect> = [];
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
      sections: gatingRules.map(rule => {
        const ruleFactorIds = (rule.requiredCtqFactorIds as number[] | null) || [];
        return {
          ...rule,
          ctqFactors: ctqFactorDetails.filter(f => ruleFactorIds.includes(f.id)),
        };
      }),
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
router.post('/plans', authMiddleware, requireOrganizationContext, requireEditorAccess, async (req, res) => {
  try {
    const organizationId = orgIdOf(req);
    const userId = planActor(req, res);
    if (userId === null) return;
    const reason = planReason(req, res);
    if (reason === null) return;

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

    // Only persist columns that exist on the QMP table. `allowWaivers` and
    // `cerTypeId` are accepted in the request for backward compatibility but
    // the schema has no such columns, so they are folded into `metadata`.
    const { allowWaivers, cerTypeId, metadata, ...qmpData } = validationResult.data;

    // Create the QMP. allowWaivers/cerTypeId are not first-class columns; they
    // live in the settings/metadata json blobs.
    const committed = await governedPlanWrite(
      req,
      res,
      { orgId: organizationId, userId, reason, command: 'create', failure: 'Failed to create Quality Management Plan' },
      async () => {
        const [created] = await getDb(req)
          .insert(qualityManagementPlans)
          .values({
            ...qmpData,
            organizationId,
            createdById: userId,
            metadata: { ...(metadata ?? {}), allowWaivers, cerTypeId },
          })
          .returning();
        return {
          target: `qmp-plan:${created.id}`,
          // The whole row as created: the start every later update's "from"
          // values build on. A plan created straight into 'active' is an
          // activation too.
          payload: { snapshot: created, activated: created.status === 'active' },
          status: 201,
          body: created,
        };
      },
    );

    // Invalidate any cache related to QMP listing
    if (committed) invalidateCache(organizationId, 'qmp', 'plans');
    return;
  } catch (error) {
    logger.error('Error creating Quality Management Plan', { error });
    if (res.headersSent) return;
    return res.status(500).json({ error: 'Failed to create Quality Management Plan' });
  }
});

/**
 * Update a quality management plan
 */
router.patch('/plans/:id', authMiddleware, requireOrganizationContext, requireEditorAccess, async (req, res) => {
  try {
    const id = String(req.params.id);
    const organizationId = orgIdOf(req);

    // Convert to number
    const qmpId = parseInt(String(id), 10);
    if (isNaN(qmpId)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }
    const userId = planActor(req, res);
    if (userId === null) return;
    const reason = planReason(req, res);
    if (reason === null) return;

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

    // `allowWaivers` and `cerTypeId` are not columns on the QMP table; fold any
    // provided values into metadata and update only real columns.
    const { allowWaivers, cerTypeId, metadata, ...qmpData } = validationResult.data;
    const touchesMetadata = metadata !== undefined || allowWaivers !== undefined || cerTypeId !== undefined;
    const fields = [...Object.keys(qmpData), ...(touchesMetadata ? ['metadata'] : [])];
    // A governed update that changes nothing would ledger a change that did not happen.
    if (fields.length === 0) {
      return res.status(400).json({ error: 'NO_CHANGES', message: 'The request changes nothing on the plan. Nothing was recorded.' });
    }

    const committed = await governedPlanWrite(
      req,
      res,
      { orgId: organizationId, userId, reason, command: 'update', failure: 'Failed to update Quality Management Plan' },
      async () => {
        // Read under lock inside the transaction, so the values the ledger
        // records as "from" are the ones this update replaced.
        const existing = await lockedPlan(req, organizationId, qmpId);

        // Merge any backward-compat fields into the metadata column.
        const mergedMetadata = touchesMetadata
          ? {
              ...((existing.metadata as Record<string, unknown> | null) ?? {}),
              ...(metadata ?? {}),
              ...(allowWaivers !== undefined ? { allowWaivers } : {}),
              ...(cerTypeId !== undefined ? { cerTypeId } : {}),
            }
          : undefined;

        // Only what differs from the locked row is a change. Re-sending the
        // current values (a double click, a stale board) would otherwise write
        // an 'update' ledger row, active -> active, for a change that did not
        // happen; the row lock makes the second of two requests see the first.
        const proposed: Record<string, unknown> = { ...qmpData, ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}) };
        const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
        const changed = fields.filter((f) => !same(proposed[f], existing[f as keyof typeof existing]));
        if (changed.length === 0) {
          throw new PlanRefusal(409, {
            error: 'NO_CHANGES',
            message: 'The plan already holds these values, so nothing was changed or recorded. Reload to see its current state.',
          });
        }

        const [updated] = await getDb(req)
          .update(qualityManagementPlans)
          .set({
            ...qmpData,
            ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
            updatedAt: new Date(),
          } as any)
          .where(
            and(
              eq(qualityManagementPlans.organizationId, organizationId),
              eq(qualityManagementPlans.id, qmpId)
            )
          )
          .returning();

        // Before and after for every field written — metadata included, since
        // it carries allowWaivers — so the overwritten value survives here.
        const changes = Object.fromEntries(
          changed.map((f) => [f, { from: existing[f as keyof typeof existing] ?? null, to: updated[f as keyof typeof updated] ?? null }]),
        );
        return {
          target: `qmp-plan:${qmpId}`,
          // Activation is an update; the payload says so, so a reader of the
          // ledger can find every time a plan was marked active. (Validation
          // selects a plan by id, not by status: activation marks the plan in
          // the register, it does not switch gates on.)
          payload: {
            fields: changed,
            changes,
            activated: updated.status === 'active' && existing.status !== 'active',
          },
          status: 200,
          body: updated,
        };
      },
    );

    // Invalidate caches
    if (committed) {
      invalidateCache(organizationId, 'qmp', 'plans');
      invalidateCache(organizationId, 'qmp', `qmp-detail-${qmpId}`);
      invalidateCache(organizationId, 'qmp', `qmp-dashboard-${qmpId}`);
    }
    return;
  } catch (error) {
    logger.error(`Error updating QMP ${req.params.id}`, { error });
    if (res.headersSent) return;
    return res.status(500).json({ error: 'Failed to update Quality Management Plan' });
  }
});

/**
 * Delete a quality management plan
 */
router.delete('/plans/:id', authMiddleware, requireOrganizationContext, requireEditorAccess, async (req, res) => {
  try {
    const id = String(req.params.id);
    const organizationId = orgIdOf(req);

    // Convert to number
    const qmpId = parseInt(String(id), 10);
    if (isNaN(qmpId)) {
      return res.status(400).json({ error: 'Invalid QMP ID' });
    }
    const userId = planActor(req, res);
    if (userId === null) return;
    // The reason travels in the JSON body; apiRequest sends a body on DELETE.
    const reason = planReason(req, res);
    if (reason === null) return;

    const committed = await governedPlanWrite(
      req,
      res,
      { orgId: organizationId, userId, reason, command: 'delete', failure: 'Failed to delete Quality Management Plan' },
      async () => {
        const existing = await lockedPlan(req, organizationId, qmpId);

        // The active plan's gates are the ones in force. Deleting it would
        // remove them and the record together; archiving (a governed PATCH)
        // retires it and keeps the record.
        if (existing.status === 'active') {
          throw new PlanRefusal(409, {
            error: 'PLAN_ACTIVE',
            message: 'The active plan cannot be deleted while its gates are in force. Archive it first; the archived plan is kept. Nothing was changed.',
          });
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
          throw new PlanRefusal(400, {
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

        return {
          target: `qmp-plan:${qmpId}`,
          // The row is gone after COMMIT; the ledger keeps all of it —
          // description, settings, metadata, dates — not a summary.
          payload: { snapshot: existing },
          status: 200,
          body: { success: true, message: 'Quality Management Plan deleted successfully' },
        };
      },
    );

    // Invalidate caches
    if (committed) {
      invalidateCache(organizationId, 'qmp', 'plans');
      invalidateCache(organizationId, 'qmp', `qmp-detail-${qmpId}`);
      invalidateCache(organizationId, 'qmp', `qmp-dashboard-${qmpId}`);
    }
    return;
  } catch (error) {
    logger.error(`Error deleting QMP ${req.params.id}`, { error });
    if (res.headersSent) return;
    return res.status(500).json({ error: 'Failed to delete Quality Management Plan' });
  }
});

export default router;
