import { authMiddleware } from '../auth';
import { cerSections } from '../../shared/schema';

// Define these locally since they're not exported from schema
const cerSectionsGating = {
  id: 'id',
  organizationId: 'organization_id',
  qmpId: 'qmp_id',
  sectionKey: 'section_key',
  requiredLevel: 'required_level',
  active: 'active',
  createdById: 'created_by_id',
  updatedById: 'updated_by_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

// Define ctqFactors locally since it's not exported from schema
const ctqFactors = {
  id: 'id',
  organizationId: 'organization_id',
  name: 'name',
  riskLevel: 'risk_level',
  description: 'description',
  mitigationStrategy: 'mitigation_strategy',
  applicableSection: 'applicable_section',
  category: 'category',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

import express from 'express';
import { tenantContext, getTenantContext } from '../middleware/tenantContext';
import { pool } from '../db';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { neverSaved } from '../services/qms/governed-qms-write';

const logger = createScopedLogger('tenant-section-gating');

const router = express.Router();

// Apply tenant context middleware to all routes
router.use(tenantContext);
router.use(authMiddleware);

// Get section gating for a QMP
router.get('/api/tenant-section-gating/:qmpId', async (req, res) => {
  try {
    const { qmpId } = req.params;
    const { organizationId } = getTenantContext(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const query = {
      text: `
        SELECT id, organization_id, qmp_id, section_key, required_level, active, created_by_id, updated_by_id, created_at, updated_at
        FROM qmp_section_gating
        WHERE ${cerSectionsGating.organizationId} = $1
        AND ${cerSectionsGating.qmpId} = $2
        ORDER BY ${cerSectionsGating.sectionKey} ASC
      `,
      values: [organizationId, qmpId],
    };

    const result = await pool.query(query);

    res.json({
      status: 'success',
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching section gating:', error);
    return serverError(res, logger, 'loading tenant section gating', error);
  }
});

// Update section gating for a QMP — not available. Until 2026-09-23 this wrote
// columns qmp_section_gating does not have (required_level, active,
// created_by_id, updated_by_id; see migrations/0000_sweet_joseph.sql) on the
// shared pool, so every call answered 500 and it has never saved a rule. It
// refuses before touching the database rather than being repaired in place:
// with its columns fixed it would be an ungated, unledgered write to the rules
// governed sections are validated against. Pinned by
// server/routes/__tests__/qms-subrouters-governed.test.ts.
router.post(
  '/api/tenant-section-gating/:qmpId/update',
  neverSaved('Changing section gating rules through this API is not available: it has never saved anything. Nothing was saved.')
);

// Get CTQ factors for a specific applicable section
router.get('/api/tenant-ctq-factors/:section', async (req, res) => {
  try {
    const { section } = req.params;
    const { organizationId } = getTenantContext(req);

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const query = {
      text: `
        SELECT id, organization_id, name, risk_level, description, mitigation_strategy, applicable_section, category, created_at, updated_at
        FROM ctq_factors
        WHERE ${ctqFactors.organizationId} = $1
        AND ${ctqFactors.applicableSection} = $2
        ORDER BY ${ctqFactors.riskLevel} DESC, ${ctqFactors.name} ASC
      `,
      values: [organizationId, section],
    };

    const result = await pool.query(query);

    res.json({
      status: 'success',
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching CTQ factors:', error);
    return serverError(res, logger, 'loading tenant ctq factors', error);
  }
});

/* ── CTQ-factor writes: not here ────────────────────────────────────────────
 * This router used to declare its own CTQ-factor writers with '/api/…' paths.
 * Mounted under /api/tenant-section-gating and /api/quality/section-gating,
 * they resolved to …/api/tenant-ctq-factors[/:id] under both. Removed
 * 2026-09-23 (zero duplication):
 *
 *   DELETE …/api/tenant-ctq-factors/:id hard-deleted a ctq_factors row for ANY
 *   authenticated member — a viewer included — with no reason and no ledger
 *   row, on the shared pool rather than the request's client, and left the
 *   deleted id in qmp_section_gating.required_ctq_factor_ids. The same user
 *   outcome is delivered, governed, by the one canonical CTQ-factor delete:
 *     DELETE /api/tenant-ctq-factors/:tenantId/ctq-factors/:factorId
 *     DELETE /api/quality/ctq-factors/:tenantId/ctq-factors/:factorId
 *   in server/routes/tenant-ctq-factors.ts. Both mounts are proven reachable,
 *   and these two paths proven to delete nothing, by
 *   server/routes/__tests__/qms-subrouters-governed.test.ts.
 *
 *   POST …/api/tenant-ctq-factors never saved anything: it wrote
 *   mitigation_strategy, a column ctq_factors does not have, and omitted qmp_id,
 *   which is NOT NULL, so every call answered 500 (captured by the same test
 *   before the removal). There was no outcome to replace; creating CTQ factors
 *   is not available (the canonical POST answers 501).
 */

console.log('Tenant Section Gating routes registered');

export default router;
