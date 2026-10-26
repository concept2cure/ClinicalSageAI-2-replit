/**
 * Ana Platform Control — API Routes
 *
 * Agentic endpoints that give Ana full control over the platform
 * for paid clients. These routes power Ana's ability to autonomously:
 * - Read and modify organization settings
 * - Manage projects and compliance configurations
 * - Toggle platform features and modules
 * - Configure AI behavior per organization
 * - Analyze usage and generate optimization recommendations
 *
 * All endpoints require an active paid subscription.
 * All mutations are audit-logged as ana:platform-controller actions.
 *
 * Mount point: /api/ana/platform
 */

import { Router, Request, Response, NextFunction } from 'express';
import { anaPlatformController } from '../services/ana-platform-controller';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('ana-platform-control');

/**
 * A settings write that throws was not made: the settings writer
 * (services/tenant/tenant-settings-writer.ts) rolls the change back when its
 * audit row, or the change itself, is refused (P1-49, DP-58). It is answered as
 * a failure — never as success, and without the error's text.
 */
function notSaved(res: Response, action: string, message: string, err: unknown) {
  logger.error(`AnA platform ${action} failed`, err as Record<string, unknown>);
  res.status(500).json({ success: false, action, error: message });
}
const SETTINGS_NOT_SAVED = 'The settings could not be saved.';

/*
 * IAM-20 (security review 2026-10-01): every write below changes
 * organisation-wide configuration (settings, AI configuration, compliance
 * defaults and module toggles). Behind the session gate alone, any member
 * could change these settings. Writes need the owner or admin role,
 * as tenant-config's settings writes do; the role is the one requireRole reads
 * from the membership on every request. Reads are unchanged.
 */
const requireConfigAdmin = requireRole('owner', 'admin');
router.use((req: Request, res: Response, next: NextFunction) =>
  req.method === 'GET' || req.method === 'HEAD' ? next() : requireConfigAdmin(req, res, next),
);

router.use((req: Request, res: Response, next) => {
  const correlationId =
    String(req.headers['x-correlation-id'] || '').trim() ||
    `ana-platform-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// ── Helper: extract org ID from request ───────────────────

function getOrgId(req: Request): number | null {
  const orgId =
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    (req as any).user?.organizationId;
  return orgId ? Number(orgId) : null;
}

// ── Settings ──────────────────────────────────────────────

/**
 * GET /api/ana/platform/settings
 * Read current organization settings
 */
router.get('/settings', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const result = await anaPlatformController.getSettings(orgId);
  res.status(result.success ? 200 : 403).json(result);
});

/**
 * PATCH /api/ana/platform/settings
 * Update organization settings (partial merge)
 */
router.patch('/settings', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  try {
    const result = await anaPlatformController.updateSettings(orgId, req.body, req);
    res.status(result.success ? 200 : 403).json(result);
  } catch (err) {
    notSaved(res, 'update_settings', SETTINGS_NOT_SAVED, err);
  }
});

// ── Capabilities & Modules ────────────────────────────────

/**
 * GET /api/ana/platform/capabilities
 * List all platform capabilities with enabled/disabled state
 */
router.get('/capabilities', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const result = await anaPlatformController.listCapabilities(orgId);
  res.status(result.success ? 200 : 403).json(result);
});

/**
 * GET /api/ana/platform/entitlements
 * Resolve effective module entitlements for this org
 */
router.get('/entitlements', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const result = await anaPlatformController.listCapabilities(orgId);
  if (!result.success) {
    return res.status(403).json(result);
  }

  const capabilities = ((result.result as any)?.capabilities || []) as Array<{
    id: string;
    enabled: boolean;
    requiredTier?: string;
    category?: string;
  }>;

  return res.json({
    success: true,
    action: 'resolve_entitlements',
    result: {
      orgId,
      capabilities,
      enabledModuleIds: capabilities.filter(c => c.enabled).map(c => c.id),
      disabledModuleIds: capabilities.filter(c => !c.enabled).map(c => c.id),
      generatedAt: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/ana/platform/modules/toggle
 * Enable or disable a specific module
 * Body: { moduleId: string, enabled: boolean }
 */
router.post('/modules/toggle', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const { moduleId, enabled } = req.body;
  if (!moduleId || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'moduleId (string) and enabled (boolean) required' });
  }

  try {
    const result = await anaPlatformController.toggleModule(orgId, moduleId, enabled, req);
    res.status(result.success ? 200 : 403).json(result);
  } catch (err) {
    notSaved(res, 'toggle_module', SETTINGS_NOT_SAVED, err);
  }
});

// ── Project Management ────────────────────────────────────

/**
 * PATCH /api/ana/platform/projects/:projectId
 * Update project configuration
 */
router.patch('/projects/:projectId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const projectId = parseInt(String(req.params.projectId), 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  const result = await anaPlatformController.updateProject(orgId, projectId, req.body);
  res.status(result.success ? 200 : 403).json(result);
});

// ── AI Configuration ──────────────────────────────────────

/**
 * PATCH /api/ana/platform/ai-config
 * Configure Ana's AI behavior for the organization
 */
router.patch('/ai-config', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  try {
    const result = await anaPlatformController.configureAI(orgId, req.body, req);
    res.status(result.success ? 200 : 403).json(result);
  } catch (err) {
    notSaved(res, 'configure_ai', SETTINGS_NOT_SAVED, err);
  }
});

// ── Compliance ────────────────────────────────────────────

/**
 * PATCH /api/ana/platform/compliance
 * Set default compliance frameworks and requirements
 */
router.patch('/compliance', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  try {
    const result = await anaPlatformController.setComplianceDefaults(orgId, req.body, req);
    res.status(result.success ? 200 : 403).json(result);
  } catch (err) {
    notSaved(res, 'set_compliance_defaults', SETTINGS_NOT_SAVED, err);
  }
});

// ── Usage & Recommendations ───────────────────────────────

/**
 * GET /api/ana/platform/usage
 * Analyze usage patterns and return optimization recommendations
 */
router.get('/usage', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const result = await anaPlatformController.analyzeUsage(orgId);
  res.status(result.success ? 200 : 403).json(result);
});

export default router;
