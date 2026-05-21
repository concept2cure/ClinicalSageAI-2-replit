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
 * GET  /license          — Org license info (tier, quotas)
 * POST /provision        — Auto-provision modules based on tier (admin only)
 * PUT  /:moduleId/toggle — Enable/disable a module (admin only)
 *
 * GET  /user-intelligence — Full user intelligence payload for AI
 * GET  /work-queue        — AI-recommended tasks for current user
 * POST /work-session      — Touch/update current work session
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  getLicenseInfo,
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
import { pool } from '../db.js';

import { createScopedLogger } from '../utils/logger.js';

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
    return res.json({ modules: catalog });
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

    const license = await getLicenseInfo(Number(orgId));
    if (!license) {
      return res.json({ modules: [], tier: 'free' });
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
// GET /license — Organization license info + quota usage
// ─────────────────────────────────────────────────────────────────────────────
router.get('/license', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).tenantContext?.organizationId || (req as any).user?.organizationId;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const numOrgId = Number(orgId);
    const [license, projectQuota, userQuota] = await Promise.all([
      getLicenseInfo(numOrgId),
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
    const userRole = (req as any).user?.role || (req as any).userRole;
    const { moduleId } = req.params as { moduleId: string };
    const { enabled } = req.body;

    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Check if module is available for this org's tier
    const access = await canAccessModule(Number(orgId), moduleId);
    if (!access.allowed) {
      return res.status(403).json({
        error: access.reason,
        code: 'MODULE_NOT_AVAILABLE',
      });
    }

    // Upsert subscription
    const userId = (req as any).user?.id || (req as any).userId;
    await pool.query(
      `INSERT INTO module_subscriptions (organization_id, module_id, enabled, enabled_at, enabled_by)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (organization_id, module_id) DO UPDATE SET
         enabled = $3,
         ${enabled ? 'enabled_at = NOW(), enabled_by = $4' : 'disabled_at = NOW(), disabled_by = $4'},
         updated_at = NOW()`,
      [Number(orgId), moduleId, enabled !== false, String(userId)]
    );

    return res.json({
      moduleId,
      enabled: enabled !== false,
      message: `Module ${enabled !== false ? 'enabled' : 'disabled'} successfully`,
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
// GET /work-queue — AI-recommended next tasks for the user
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

    return res.json({
      queue: intelligence?.workQueue || [],
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
