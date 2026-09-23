/**
 * Tenant CTQ Factors API Routes
 *
 * Handles tenant-specific Critical-to-Quality (CTQ) factors
 * for section gating and quality controls.
 *
 * Mounted at /api/tenant-ctq-factors (server/bootstrap/register-tenant-routes.ts)
 * and /api/quality/ctq-factors (server/routes/quality-management-api.ts).
 *
 * ── What writes here ────────────────────────────────────────────────────────
 * ONE write: DELETE /:tenantId/ctq-factors/:factorId, the canonical governed
 * CTQ-factor delete (reason, admin-only, one transaction, ledgered). It is also
 * what replaced the ungoverned duplicate delete tenant-section-gating.ts used to
 * declare.
 *
 * Create, update and the batch operations answer 501 NOT_AVAILABLE. Until
 * 2026-09-23 they answered 201 / 200 / `success: true` over a write that never
 * ran: they passed their values as a second argument to Drizzle's
 * `insert(table)` / `update(table)`, which ignore it, and never executed the
 * builder; apply-to-sections threw (500); clone-template read a template
 * organization's id from the request body. Their schema did not match the
 * ctq_factors table either (no qmp_id, which is NOT NULL; columns that do not
 * exist). Nothing in client/ calls them and they have never persisted a row,
 * so they refuse rather than being built out (RULE 2: no new capability).
 * Pinned by server/routes/__tests__/qms-subrouters-governed.test.ts.
 */
import { Router } from 'express';
import { eq, and, sql, SQL } from 'drizzle-orm';
import { ctqFactors, qmpSectionGating, qmpTraceabilityMatrix } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { requireOrganizationContext } from '../middleware/tenantContext';
import { requireEditorAccess } from '../middleware/orgMembership';
import { createScopedLogger } from '../utils/logger';
import {
  GovernedRefusal,
  governedQmsActor,
  governedQmsReason,
  governedQmsWrite,
  neverSaved,
  type GovernedQmsSubject,
} from '../services/qms/governed-qms-write';

// Import the getDb helper from the tenantDbHelper
import { getDb } from '../db/tenantDbHelper';

const logger = createScopedLogger('tenant-ctq-api');
const router = Router();

/** The CTQ factor's words for the governed-write answers (server/services/qms/governed-qms-write.ts). */
const CTQ_FACTOR: GovernedQmsSubject = {
  noun: 'CTQ factor',
  changeWhat: 'a CTQ factor',
  inUse: { error: 'FACTOR_IN_USE', referrers: 'other quality records (traceability rows)' },
  logLabel: 'CTQ factor',
  logger,
};

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
 * Create a new CTQ factor — not available (see the header): it has never saved anything.
 */
router.post(
  '/:tenantId/ctq-factors',
  authMiddleware,
  requireOrganizationContext,
  neverSaved('Creating CTQ factors through this API is not available: it has never saved anything. Nothing was saved.')
);

/**
 * Update a CTQ factor — not available (see the header): it has never saved anything.
 */
router.patch(
  '/:tenantId/ctq-factors/:factorId',
  authMiddleware,
  requireOrganizationContext,
  neverSaved('Changing CTQ factors through this API is not available: it has never saved anything. Nothing was saved.')
);

/**
 * Delete a CTQ factor — the ONE governed CTQ-factor delete.
 *
 * A CTQ factor is a gate a governed section is validated against, so deleting
 * one changes the document-control regime. Who may: requireEditorAccess (a
 * viewer is refused exactly as on every governed write) and then admin only,
 * stricter, as this route has always been. Only the caller's own organization:
 * the path's tenant id must equal it, and the ledger row is written against it.
 * Why: a reason of at least 8 characters, trimmed.
 *
 * One transaction on the request-scoped client (governedQmsWrite): lock the row
 * by id AND organization_id → refuse 409 FACTOR_IN_USE if the QMP traceability
 * matrix references it (the only foreign key into ctq_factors) or any section
 * gating rule of the organization lists it in required_ctq_factor_ids (a JSON
 * array with no foreign key, so the database would let the delete through and
 * leave the gate requiring a factor that no longer exists) → DELETE … WHERE id
 * AND organization_id → ledger row carrying the whole locked row → COMMIT.
 *
 * Until 2026-09-23 the in-use check handed its parameters to execute(), which
 * dropped them, and named a column that does not exist, so every call answered
 * 500; and the delete below it passed its where clause as an ignored second
 * argument — fixing the check alone would have run DELETE FROM ctq_factors with
 * no WHERE.
 */
router.delete(
  '/:tenantId/ctq-factors/:factorId',
  authMiddleware,
  requireOrganizationContext,
  requireEditorAccess,
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

      // Only the caller's own organization — the one requireEditorAccess
      // resolved. No cross-tenant exception: the delete and its ledger row are
      // written under the caller's organization.
      const organizationId = (req as typeof req & { resolvedOrganizationId?: number }).resolvedOrganizationId;
      if (organizationId === undefined || tenantId !== organizationId) {
        return res
          .status(403)
          .json({ error: 'You can only delete CTQ factors for your own organization' });
      }

      const userId = governedQmsActor(req, res, CTQ_FACTOR);
      if (userId === null) return;
      // The reason travels in the JSON body; apiRequest sends a body on DELETE.
      const reason = governedQmsReason(req, res, CTQ_FACTOR);
      if (reason === null) return;

      await governedQmsWrite(
        req,
        res,
        CTQ_FACTOR,
        { orgId: organizationId, userId, reason, command: 'delete', failure: 'Failed to delete CTQ factor' },
        async () => {
          const db = getDb(req);

          // The row, locked for the rest of the transaction: what the ledger
          // keeps is exactly what the delete removes.
          const [existing] = await db
            .select()
            .from(ctqFactors)
            .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, organizationId)))
            .limit(1)
            .for('update');
          if (!existing) throw new GovernedRefusal(404, { error: 'CTQ factor not found' });

          const traced = await db
            .select({ id: qmpTraceabilityMatrix.id })
            .from(qmpTraceabilityMatrix)
            .where(
              and(
                eq(qmpTraceabilityMatrix.organizationId, organizationId),
                eq(qmpTraceabilityMatrix.ctqFactorId, factorId)
              )
            )
            .limit(1);
          if (traced.length > 0) {
            throw new GovernedRefusal(409, {
              error: 'FACTOR_IN_USE',
              message:
                'This CTQ factor is referenced by the QMP traceability matrix. Re-point or remove those requirements first. Nothing was deleted.',
            });
          }

          // Ids have been stored as numbers; a string id is matched too, so a
          // rule written either way still counts as using the factor.
          const gated = await db
            .select({ sectionKey: qmpSectionGating.sectionKey })
            .from(qmpSectionGating)
            .where(
              and(
                eq(qmpSectionGating.organizationId, organizationId),
                sql`(${qmpSectionGating.requiredCtqFactorIds}::jsonb @> ${JSON.stringify([factorId])}::jsonb
                  OR ${qmpSectionGating.requiredCtqFactorIds}::jsonb @> ${JSON.stringify([String(factorId)])}::jsonb)`
              )
            )
            .limit(1);
          if (gated.length > 0) {
            throw new GovernedRefusal(409, {
              error: 'FACTOR_IN_USE',
              message: `This CTQ factor is required by a section gating rule (${gated[0].sectionKey}). Update that rule first. Nothing was deleted.`,
            });
          }

          const deleted = await db
            .delete(ctqFactors)
            .where(and(eq(ctqFactors.id, factorId), eq(ctqFactors.organizationId, organizationId)))
            .returning({ id: ctqFactors.id });
          if (deleted.length !== 1) {
            // The row is locked, so this cannot happen; if it does, roll back
            // rather than ledger a delete that did not remove exactly one row.
            throw new Error(`CTQ factor delete removed ${deleted.length} rows, expected 1`);
          }

          return {
            target: `ctq-factor:${factorId}`,
            // The row is gone after COMMIT; the ledger keeps all of it.
            payload: { snapshot: existing },
            status: 200,
            body: { deleted: true, id: factorId, message: 'CTQ factor deleted.' },
          };
        }
      );
      return;
    } catch (error) {
      logger.error(
        `Error deleting CTQ factor ${req.params.factorId} for tenant ${req.params.tenantId}`,
        { error }
      );
      if (res.headersSent) return;
      return res.status(500).json({ error: 'Failed to delete CTQ factor' });
    }
  }
);

/**
 * Batch CTQ factor operations (update-status, clone-template, apply-to-sections)
 * — not available (see the header): they have never saved anything.
 */
router.post(
  '/:tenantId/ctq-factors/batch',
  authMiddleware,
  requireOrganizationContext,
  neverSaved('Batch changes to CTQ factors through this API are not available: they have never saved anything. Nothing was saved.')
);

export default router;
