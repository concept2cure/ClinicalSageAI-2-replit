/**
 * Quality Management API Layer
 *
 * This module serves as a unified API layer for all quality management functionality,
 * integrating CTQ factors, section gating, and quality validation.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { qmpSectionGating, ctqFactors, qualityManagementPlans } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { requireEditorAccess } from '../middleware/orgMembership';
import { getDb } from '../db/tenantDbHelper';
import {
  GovernedRefusal,
  governedQmsActor,
  governedQmsReason,
  governedQmsWrite,
  type GovernedQmsSubject,
} from '../services/qms/governed-qms-write';
import { createScopedLogger } from '../utils/logger';
import {
  assessSection,
  batchVerdict,
  gateLevelByThreshold,
  notAssessedSection,
  requiredFactorIdsOf,
} from '../services/qms/quality-gating-verdict';
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
 * The ceremony itself — reason, actor, transaction, ledger, the refusal and
 * failure answers — lives in server/services/qms/governed-qms-write.ts, shared
 * with the governed CTQ-factor delete (tenant-ctq-factors.ts), so there is one
 * implementation of it. `PLAN` below supplies the plan's words for its answers.
 *
 * Who may: `requireEditorAccess`, the repo's one governed-write role gate — a
 * `viewer` reads plans and cannot change the regime (§11.10(g)).
 * What is kept: the ledger payload carries every value the write overwrote or
 * destroyed — the whole row on create and delete, each changed field's from/to
 * on update — because the row keeps no history of its own (§11.10(e)). */

/** The plan row, locked for the rest of the transaction, or a 404 refusal. Same org predicate as every read here. */
async function lockedPlan(req: Request, organizationId: number, qmpId: number) {
  const rows = await getDb(req)
    .select()
    .from(qualityManagementPlans)
    .where(and(eq(qualityManagementPlans.organizationId, organizationId), eq(qualityManagementPlans.id, qmpId)))
    .limit(1)
    .for('update');
  if (rows.length === 0) throw new GovernedRefusal(404, { error: 'Quality Management Plan not found' });
  return rows[0];
}

// Import the specialized routes
import ctqFactorsRouter from './tenant-ctq-factors';
import sectionGatingRouter from './tenant-section-gating';
import qualityValidationRouter from './tenant-quality-validation';

const logger = createScopedLogger('quality-management-api');
const router = Router();

/** The plan's words for the governed-write answers (server/services/qms/governed-qms-write.ts). */
const PLAN: GovernedQmsSubject = {
  noun: 'plan',
  changeWhat: 'a quality-management plan',
  inUse: { error: 'PLAN_IN_USE', referrers: 'other quality records (CTQ factors or traceability rows)' },
  logLabel: 'Quality Management Plan',
  logger,
};

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

    // The factors the plan's gating rules name, in either stored id form.
    const factorIds = new Set(
      gatingRules.flatMap(rule => requiredFactorIdsOf(rule.requiredCtqFactorIds).ids)
    );
    const relatedFactors = allFactors.filter(factor => factorIds.has(factor.id));

    // Calculate statistics. Gating level is derived from the mandatory
    // completion threshold as batch-validate derives it (no threshold is the
    // column default, a hard gate), and there is no inactive state on a gating
    // rule, so all rules count as active.
    const levels = gatingRules.map(rule => gateLevelByThreshold(rule.minimumMandatoryCompletion));
    const sectionStats = {
      totalSections: gatingRules.length,
      sectionsByGateLevel: {
        hard: levels.filter(level => level === 'hard').length,
        soft: levels.filter(level => level === 'soft').length,
        info: levels.filter(level => level === 'info').length,
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

    const shareOf = (n: number): number | null =>
      factorStats.totalFactors > 0 ? (n / factorStats.totalFactors) * 100 : null;

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
      // A share of nothing is not a figure: with no CTQ factor in scope,
      // completeness and the risk shares are null (not assessed), never 0%.
      overallCompleteness: shareOf(factorStats.activeFactors),
      riskProfile: {
        highRiskPercentage: shareOf(factorStats.factorsByRiskLevel.high),
        mediumRiskPercentage: shareOf(factorStats.factorsByRiskLevel.medium),
        lowRiskPercentage: shareOf(factorStats.factorsByRiskLevel.low),
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
      sections: z
        .array(
          z.object({
            sectionCode: z.string(),
            content: z.string(),
          })
        )
        .min(1),
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
          inArray(qmpSectionGating.sectionKey, sectionCodes)
        )
      );

    // No rule covers any of them: nothing was assessed, and nothing passed.
    if (gatingRules.length === 0) {
      return res.json({
        valid: null,
        assessed: false,
        message: 'No quality gating rule is defined for any of these sections, so they were not assessed.',
        sectionResults: sectionCodes.map(code => notAssessedSection(code)),
      });
    }

    // One read for every factor the rules name, in either stored id form.
    const ctqFactorIds = [
      ...new Set(gatingRules.flatMap(rule => requiredFactorIdsOf(rule.requiredCtqFactorIds).ids)),
    ];
    const ctqFactorDetails =
      ctqFactorIds.length > 0
        ? await getDb(req)
            .select()
            .from(ctqFactors)
            .where(
              and(eq(ctqFactors.organizationId, organizationId), inArray(ctqFactors.id, ctqFactorIds))
            )
        : [];

    // The gate level on this route comes from the mandatory-completion
    // threshold; a rule with none recorded takes the column default (hard).
    const sectionResults = sections.map(({ sectionCode, content }) => {
      const rule = gatingRules.find(r => r.sectionKey === sectionCode);
      if (!rule) return notAssessedSection(sectionCode);
      return assessSection({
        sectionCode,
        content,
        requiredCtqFactorIds: rule.requiredCtqFactorIds,
        factors: ctqFactorDetails,
        gatingLevel: gateLevelByThreshold(rule.minimumMandatoryCompletion),
        allowOverride: rule.allowOverride,
      });
    });

    return res.json({
      ...batchVerdict(sectionResults),
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
    const ctqFactorIds = [
      ...new Set(gatingRules.flatMap(rule => requiredFactorIdsOf(rule.requiredCtqFactorIds).ids)),
    ];

    let ctqFactorDetails: Array<typeof ctqFactors.$inferSelect> = [];
    if (ctqFactorIds.length > 0) {
      ctqFactorDetails = await getDb(req)
        .select()
        .from(ctqFactors)
        .where(
          and(
            eq(ctqFactors.organizationId, organizationId),
            inArray(ctqFactors.id, ctqFactorIds)
          )
        );
    }

    // Build the enriched QMP object
    const enrichedQmp = {
      ...qmp,
      sections: gatingRules.map(rule => {
        const ruleFactorIds = requiredFactorIdsOf(rule.requiredCtqFactorIds).ids;
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
    const userId = governedQmsActor(req, res, PLAN);
    if (userId === null) return;
    const reason = governedQmsReason(req, res, PLAN);
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
    const committed = await governedQmsWrite(
      req,
      res,
      PLAN,
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
    const userId = governedQmsActor(req, res, PLAN);
    if (userId === null) return;
    const reason = governedQmsReason(req, res, PLAN);
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

    const committed = await governedQmsWrite(
      req,
      res,
      PLAN,
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
          throw new GovernedRefusal(409, {
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
    const userId = governedQmsActor(req, res, PLAN);
    if (userId === null) return;
    // The reason travels in the JSON body; apiRequest sends a body on DELETE.
    const reason = governedQmsReason(req, res, PLAN);
    if (reason === null) return;

    const committed = await governedQmsWrite(
      req,
      res,
      PLAN,
      { orgId: organizationId, userId, reason, command: 'delete', failure: 'Failed to delete Quality Management Plan' },
      async () => {
        const existing = await lockedPlan(req, organizationId, qmpId);

        // The active plan's gates are the ones in force. Deleting it would
        // remove them and the record together; archiving (a governed PATCH)
        // retires it and keeps the record.
        if (existing.status === 'active') {
          throw new GovernedRefusal(409, {
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
          throw new GovernedRefusal(400, {
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
