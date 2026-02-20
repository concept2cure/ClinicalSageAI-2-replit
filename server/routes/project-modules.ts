/**
 * Project Module Integration Routes
 *
 * REST API for linking/unlinking platform modules (CER, CSR, eCTD, Vault, Protocol,
 * Literature, RegIntel, Analytics, FAERS) to/from projects. Provides a unified view
 * of all module activity within a project context.
 *
 * @module server/routes/project-modules
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { projectModuleBridge, ModuleType } from '../services/project-module-bridge';
import { getTenantContext } from '../utils/tenantContext';

const router = Router();

const MODULE_TYPES: ModuleType[] = [
  'cer',
  'csr',
  'ectd',
  'vault',
  'protocol',
  'literature',
  'regulatory_intelligence',
  'analytics',
  'faers',
  'risk',
  'ind',
  '510k',
  'cmc',
];

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const linkSchema = z.object({
  moduleType: z.enum(MODULE_TYPES as [string, ...string[]]),
  moduleInstanceId: z.number().int().positive(),
  settings: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const bulkLinkSchema = z.object({
  modules: z
    .array(
      z.object({
        moduleType: z.enum(MODULE_TYPES as [string, ...string[]]),
        moduleInstanceId: z.number().int().positive(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .min(1)
    .max(50),
});

const statusSchema = z.object({
  status: z.enum(['active', 'inactive', 'completed']),
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:projectId/modules
 * List all modules linked to a project.
 */
router.get('/:projectId/modules', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenant = getTenantContext(req);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const modules = await projectModuleBridge.getProjectModules(projectId, tenant.organizationId);
    res.json({ projectId, modules, count: modules.length });
  } catch (err: any) {
    console.error('Error listing project modules:', err);
    res.status(500).json({ error: 'Failed to list project modules' });
  }
});

/**
 * GET /api/projects/:projectId/modules/summary
 * Get module summary grouped by type.
 */
router.get('/:projectId/modules/summary', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenant = getTenantContext(req);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const summary = await projectModuleBridge.getModuleSummary(projectId, tenant.organizationId);
    res.json({ projectId, summary });
  } catch (err: any) {
    console.error('Error getting module summary:', err);
    res.status(500).json({ error: 'Failed to get module summary' });
  }
});

/**
 * POST /api/projects/:projectId/modules
 * Link a module to a project.
 */
router.post('/:projectId/modules', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenant = getTenantContext(req);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const body = linkSchema.parse(req.body);

    const link = await projectModuleBridge.linkModule({
      projectId,
      organizationId: tenant.organizationId,
      clientWorkspaceId: tenant.clientWorkspaceId!,
      moduleType: body.moduleType as ModuleType,
      moduleInstanceId: body.moduleInstanceId,
      settings: body.settings,
      metadata: body.metadata,
    });

    res.status(201).json(link);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.errors });
    }
    console.error('Error linking module:', err);
    res.status(500).json({ error: err.message || 'Failed to link module' });
  }
});

/**
 * POST /api/projects/:projectId/modules/bulk
 * Bulk-link multiple modules to a project.
 */
router.post('/:projectId/modules/bulk', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenant = getTenantContext(req);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const body = bulkLinkSchema.parse(req.body);

    const links = await projectModuleBridge.bulkLink(
      projectId,
      tenant.organizationId,
      tenant.clientWorkspaceId!,
      body.modules as Array<{
        moduleType: ModuleType;
        moduleInstanceId: number;
        metadata?: Record<string, unknown>;
      }>
    );

    res.status(201).json({ projectId, linked: links.length, modules: links });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.errors });
    }
    console.error('Error bulk-linking modules:', err);
    res.status(500).json({ error: err.message || 'Failed to bulk-link modules' });
  }
});

/**
 * DELETE /api/projects/:projectId/modules/:moduleType/:moduleInstanceId
 * Unlink a module from a project.
 */
router.delete(
  '/:projectId/modules/:moduleType/:moduleInstanceId',
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const moduleInstanceId = parseInt(req.params.moduleInstanceId, 10);
      const { moduleType } = req.params;

      if (Number.isNaN(projectId) || Number.isNaN(moduleInstanceId)) {
        return res.status(400).json({ error: 'Invalid IDs' });
      }

      const removed = await projectModuleBridge.unlinkModule(
        projectId,
        moduleType,
        moduleInstanceId
      );
      if (!removed) {
        return res.status(404).json({ error: 'Module link not found' });
      }

      res.json({ message: 'Module unlinked successfully' });
    } catch (err: any) {
      console.error('Error unlinking module:', err);
      res.status(500).json({ error: 'Failed to unlink module' });
    }
  }
);

/**
 * PATCH /api/projects/:projectId/modules/:moduleType/:moduleInstanceId/status
 * Update a module link status.
 */
router.patch(
  '/:projectId/modules/:moduleType/:moduleInstanceId/status',
  async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId, 10);
      const moduleInstanceId = parseInt(req.params.moduleInstanceId, 10);
      const { moduleType } = req.params;

      if (Number.isNaN(projectId) || Number.isNaN(moduleInstanceId)) {
        return res.status(400).json({ error: 'Invalid IDs' });
      }

      const body = statusSchema.parse(req.body);
      const updated = await projectModuleBridge.updateModuleStatus(
        projectId,
        moduleType,
        moduleInstanceId,
        body.status
      );

      if (!updated) {
        return res.status(404).json({ error: 'Module link not found' });
      }

      res.json(updated);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request', details: err.errors });
      }
      console.error('Error updating module status:', err);
      res.status(500).json({ error: 'Failed to update module status' });
    }
  }
);

/**
 * GET /api/project-modules/find
 * Find all projects that have a specific module instance linked.
 * Query params: moduleType, moduleInstanceId
 */
router.get('/find', async (req: Request, res: Response) => {
  try {
    const tenant = getTenantContext(req);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const moduleType = req.query.moduleType as string;
    const moduleInstanceId = parseInt(req.query.moduleInstanceId as string, 10);

    if (!moduleType || Number.isNaN(moduleInstanceId)) {
      return res
        .status(400)
        .json({ error: 'moduleType and moduleInstanceId query params required' });
    }

    const linkedProjects = await projectModuleBridge.findProjectsForModule(
      moduleType,
      moduleInstanceId,
      tenant.organizationId
    );

    res.json({ moduleType, moduleInstanceId, projects: linkedProjects });
  } catch (err: any) {
    console.error('Error finding projects for module:', err);
    res.status(500).json({ error: 'Failed to find projects' });
  }
});

/**
 * GET /api/project-modules/org-stats
 * Get organization-wide module statistics.
 */
router.get('/org-stats', async (req: Request, res: Response) => {
  try {
    const tenant = getTenantContext(req);
    if ('error' in tenant) return res.status(400).json({ error: tenant.error });

    const stats = await projectModuleBridge.getOrganizationModuleStats(tenant.organizationId);
    res.json(stats);
  } catch (err: any) {
    console.error('Error getting org module stats:', err);
    res.status(500).json({ error: 'Failed to get organization module stats' });
  }
});

export default router;
