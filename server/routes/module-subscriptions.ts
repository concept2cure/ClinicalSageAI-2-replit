/**
 * @fileoverview Module Subscriptions API
 * @module server/routes/module-subscriptions
 * @version 1.0.0
 *
 * @description
 * REST API for querying and managing module subscriptions.
 * The frontend calls this to know which modules to show/hide.
 *
 * Endpoints:
 * GET  /catalog          — Full module catalog with availability status
 * GET  /enabled          — Only enabled modules for the org
 * GET  /navigation       — Per-destination entitlement verdicts for the nav rail
 * GET  /license          — Org license info (tier, quotas)
 * POST /provision        — Auto-provision modules based on tier (admin only)
 * PUT  /:moduleId/toggle — Enable/disable a module (org admin; governed: reason + audit row)
 *
 * GET  /user-intelligence — Full user intelligence payload for AI
 * GET  /work-queue        — AI-recommended tasks for current user
 * POST /work-session      — Touch/update current work session
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getLicenseInfo,
  readLicenseInfo,
  getModuleCatalog,
  canAccessModule,
  checkProjectQuota,
  checkUserQuota,
} from '../services/license-manager.js';
import {
  loadUserIntelligence,
  touchWorkSession,
  generateWorkRecommendations,
  addToWorkQueue,
} from '../services/user-intelligence.js';
import { resolveNavEntitlements } from '../services/entitlements/navigation-entitlements.js';
import { resolveAdminStanding } from '../services/entitlements/master-admin.js';
import { writeModuleGrant } from '../services/entitlements/module-grants.js';
import { authenticateToken, roleClaimsSatisfy } from '../middleware/auth.js';
import { requireGovernedReason } from './governed-reason.js';
import { recordAuditRow } from '../services/audit/audit-write-outcome.js';
import { pool } from '../db.js';

import { createScopedLogger } from '../utils/logger.js';
import { launchScopeEnforced } from '../services/entitlements/launch-scope.js';

const logger = createScopedLogger('module-subscriptions');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /catalog — Full module catalog with tier/industry availability
// ─────────────────────────────────────────────────────────────────────────────
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const catalog = await getModuleCatalog(Number(orgId));
    // `launchScope.enforced` is the deployment's answer, sent with the rows it
    // applies to, so the catalog can label a 'later' module "in a later
    // release" only when that is actually what locks it.
    return res.json({ modules: catalog, launchScope: { enforced: launchScopeEnforced() } });
  } catch (error) {
    logger.error('catalog error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load module catalog' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /enabled — Only enabled modules (for minimal frontend loading)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/enabled', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // 2026-10-15: read through getLicenseInfo, whose null for a failed read
    // answered 200 { modules: [], tier: 'free' }. A failed read now throws to
    // the 500 below; only an organization with no row is 404.
    const license = await readLicenseInfo(Number(orgId));
    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    return res.json({
      modules: license.enabledModules,
      tier: license.tier,
      industryMode: license.industryMode,
    });
  } catch (error) {
    logger.error('enabled error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load enabled modules' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /navigation — Per-destination entitlement verdicts for the nav rail
//
// The rail asks one question on load ("which of these may this organization
// open, and if not, why not") and gets one answer, resolved from persisted
// state rather than a client-side constant. `authenticateToken` is explicit
// here — unlike /catalog and /license, this handler reads the identity (email
// and roles) to decide the platform-owner grant, so the request must have been
// through real authentication rather than merely carrying a tenant context.
//
// `platformAdmin` rides along because the account menu needs it and has no
// other honest source: it is `resolvePlatformAdmin`, the exact function the
// Master Administration guard admits with, applied to this request. It is NOT
// `masterAdmin` — that is the commercial-unlock grant, a different set (a
// `support` designation opens the console without unlocking modules). Before
// it existed the menu offered the console to every customer org admin, and the
// console refused all of them. Wayfinding only; the guard stays authoritative.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/navigation', authenticateToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    // One pass for both: the owner grant is decided inside platform
    // administration (finding 43), so the two can no longer disagree.
    const { masterAdmin, platformAdmin } = await resolveAdminStanding(req);
    return res.json({
      ...(await resolveNavEntitlements(Number(orgId), { masterAdmin })),
      platformAdmin,
    });
  } catch (error) {
    logger.error('navigation error', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: 'Failed to resolve navigation entitlements' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /license — Organization license info + quota usage
// ─────────────────────────────────────────────────────────────────────────────
router.get('/license', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const numOrgId = Number(orgId);
    // readLicenseInfo, not getLicenseInfo (2026-10-15): a failed read was null,
    // and answered 404 'License not found'. It now throws to the 500 below.
    const [license, projectQuota, userQuota] = await Promise.all([
      readLicenseInfo(numOrgId),
      checkProjectQuota(numOrgId),
      checkUserQuota(numOrgId),
    ]);

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    return res.json({
      ...license,
      usage: {
        projects: projectQuota,
        users: userQuota,
      },
    });
  } catch (error) {
    logger.error('license error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load license info' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /provision — Auto-provision modules based on tier + industry
// ─────────────────────────────────────────────────────────────────────────────
router.post('/provision', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    const userRole = (req as any).user?.role || (req as any).userRole;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Call the provision_org_modules function we created in the migration
    await pool.query(`SELECT provision_org_modules($1)`, [Number(orgId)]);

    // Reload enabled modules
    const license = await getLicenseInfo(Number(orgId));
    return res.json({
      message: 'Modules provisioned successfully',
      enabledModules: license?.enabledModules || [],
    });
  } catch (error) {
    logger.error('provision error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to provision modules' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:moduleId/toggle — Enable or disable a module
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:moduleId/toggle', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    const moduleId = String(req.params.moduleId);
    const { enabled } = req.body ?? {};

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    /* The canonical org-role decision (middleware/auth.ts roleClaimsSatisfy),
       not `role !== 'admin'`: that compare read only the `role` claim, so an
       administrator whose token names the role in `roles` was refused, and a
       second copy of the role rule lived here. Settings audit 2026-10-17. */
    const user = (req as any).user ?? { role: (req as any).userRole };
    if (!roleClaimsSatisfy(user, ['admin'])) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    /* Turning a module on or off for the whole organisation is a governed
       change: it takes a stated reason (the shared 8-character floor,
       routes/governed-reason.ts) and writes a §11.10(e) audit row below. It
       took neither until the settings audit of 2026-10-17. */
    const reasonVerdict = requireGovernedReason((req.body ?? {}).reason);
    if (!reasonVerdict.ok) {
      return res.status(400).json({ error: reasonVerdict.error, code: 'REASON_REQUIRED' });
    }

    // Check if module is available for this org's tier
    // The plan question, not the use question: an administrator must be able to
    // turn back on a module they turned off, so an existing revocation is not a
    // reason to refuse the toggle. canAccessModule's default (revocation denies)
    // is what the gate and /check want.
    const access = await canAccessModule(Number(orgId), moduleId, { ignoreRevocation: true });
    if (!access.allowed) {
      return res.status(403).json({
        error: access.reason,
        code: 'MODULE_NOT_AVAILABLE',
      });
    }

    /* One canonical grant writer — services/entitlements/module-grants.ts.
       This was a second inline upsert of the same row, and it did not touch
       `expires_at`. On an organization whose trial of this module had lapsed,
       the row already holds a past date: writing `enabled = true` beside it
       produces a grant that is instantly expired, so entitlement resolution
       ignores the override, the rail stays locked, and the response below still
       says the module was enabled successfully.

       `expiresAt: null` is stated rather than defaulted. An administrator
       turning a module on means a perpetual grant, and saying so is what clears
       the stale date. Opening a time-limited grant is a different, deliberate
       act with its own endpoint. */
    const userId = (req as any).user?.id || (req as any).userId;
    const nextEnabled = enabled !== false;
    await writeModuleGrant({
      organizationId: Number(orgId),
      moduleId,
      enabled: nextEnabled,
      actorEmail: userId == null ? null : String(userId),
      expiresAt: null,
    });

    /* The same audit row the platform-owner toggle writes
       (routes/admin/master-admin.ts PATCH /tenants/:id/modules). The grant row
       has no column for a justification, so this row is the only place the
       administrator's reason is recorded. It is written beside the committed
       grant and never reverts it; whether it landed is reported in
       `auditTrail`, not assumed. */
    const auditTrail = await recordAuditRow({
      tenantId: Number(orgId),
      userId: userId == null ? undefined : userId,
      action: 'data_modify',
      resourceType: 'module_subscription',
      resourceId: `${Number(orgId)}:${moduleId}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      details: { orgAdminAction: 'org.module_toggle', moduleId, enabled: nextEnabled, reason: reasonVerdict.reason },
    });

    return res.json({
      moduleId,
      enabled: nextEnabled,
      auditTrail,
      message: `Module ${nextEnabled ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    logger.error('toggle error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to toggle module' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /check/:moduleId — Check if a specific module is accessible
// ─────────────────────────────────────────────────────────────────────────────
router.get('/check/:moduleId', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const result = await canAccessModule(Number(orgId), String(req.params.moduleId));
    return res.json(result);
  } catch (error) {
    logger.error('check error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to check module access' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER INTELLIGENCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// GET /user-intelligence — Complete user context for the frontend + AI
// ─────────────────────────────────────────────────────────────────────────────
router.get('/user-intelligence', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    const userId = (req as any).user?.id || (req as any).userId;
    const activeProjectId = req.query.projectId
      ? parseInt(String(req.query.projectId), 10)
      : undefined;

    if (!orgId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const intelligence = await loadUserIntelligence({
      userId: Number(userId),
      organizationId: Number(orgId),
      activeProjectId,
    });

    if (!intelligence) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(intelligence);
  } catch (error) {
    logger.error('user-intelligence error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load user intelligence' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /work-queue — next tasks derived from the project's section status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/work-queue', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    const userId = (req as any).user?.id || (req as any).userId;
    const projectId = req.query.projectId ? parseInt(String(req.query.projectId), 10) : undefined;

    if (!orgId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If a project is specified, regenerate recommendations first
    if (projectId) {
      await generateWorkRecommendations({
        userId: Number(userId),
        organizationId: Number(orgId),
        projectId,
      });
    }

    const intelligence = await loadUserIntelligence({
      userId: Number(userId),
      organizationId: Number(orgId),
      activeProjectId: projectId,
    });

    // 2026-10-15: `workQueue || []` answered a failed read (null) as an empty queue.
    if (intelligence?.workQueue === null) {
      return res.status(503).json({ error: 'The work queue could not be read' });
    }
    return res.json({
      queue: intelligence?.workQueue ?? [],
      activeProject: intelligence?.activeProject || null,
    });
  } catch (error) {
    logger.error('work-queue error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to load work queue' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /work-session — Touch/update the user's current work session
// ─────────────────────────────────────────────────────────────────────────────
router.post('/work-session', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    const userId = (req as any).user?.id || (req as any).userId;
    const { projectId, contextType, contextReference, contextTitle } = req.body;

    if (!orgId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const sessionId = await touchWorkSession({
      userId: Number(userId),
      organizationId: Number(orgId),
      projectId: projectId ? Number(projectId) : undefined,
      contextType,
      contextReference,
      contextTitle,
    });

    return res.json({ sessionId });
  } catch (error) {
    logger.error('work-session error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to update work session' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /work-queue/add — Manually add a task to the work queue
// ─────────────────────────────────────────────────────────────────────────────
router.post('/work-queue/add', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;
    const userId = (req as any).user?.id || (req as any).userId;

    if (!orgId || !userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const taskId = await addToWorkQueue({
      userId: Number(userId),
      organizationId: Number(orgId),
      projectId: req.body.projectId ? Number(req.body.projectId) : undefined,
      taskType: req.body.taskType || 'manual',
      taskTitle: req.body.taskTitle,
      taskDescription: req.body.taskDescription,
      priority: req.body.priority,
      referenceType: req.body.referenceType,
      referenceId: req.body.referenceId,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
      estimatedMinutes: req.body.estimatedMinutes,
      source: 'manual',
    });

    return res.json({ id: taskId });
  } catch (error) {
    logger.error('work-queue/add error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to add task' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /work-queue/:id/status — Update task status (complete, dismiss, defer)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/work-queue/:id/status', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || (req as any).userId;
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validStatuses = ['in_progress', 'completed', 'dismissed', 'deferred'];
    if (!validStatuses.includes(status)) {
      return res
        .status(400)
        .json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const extraFields: string[] = [];
    const extraValues: any[] = [];

    if (status === 'completed') {
      extraFields.push('completed_at = NOW()');
    } else if (status === 'dismissed') {
      extraFields.push('dismissed_at = NOW()');
      if (reason) {
        extraFields.push(`dismissed_reason = $${3 + extraValues.length + 1}`);
        extraValues.push(reason);
      }
    }

    await pool.query(
      `UPDATE user_work_queue SET
        status = $1
        ${extraFields.length > 0 ? ', ' + extraFields.join(', ') : ''}
       WHERE id = $2 AND user_id = $3`,
      [status, Number(id), Number(userId), ...extraValues]
    );

    return res.json({ id: Number(id), status });
  } catch (error) {
    logger.error('work-queue status error', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to update task status' });
  }
});

export default router;
