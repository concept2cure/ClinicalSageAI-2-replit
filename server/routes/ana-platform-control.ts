/**
 * Ana Platform Control — API Routes
 *
 * Agentic endpoints that give Ana full control over the platform
 * for paid clients. These routes power Ana's ability to autonomously:
 * - Read and modify organization settings
 * - Manage projects and compliance configurations
 * - Toggle platform features and modules
 * - Configure AI behavior per organization
 * - Run onboarding workflows
 * - Analyze usage and generate optimization recommendations
 *
 * All endpoints require an active paid subscription.
 * All mutations are audit-logged as ana:platform-controller actions.
 *
 * Mount point: /api/ana/platform
 */

import { Router, Request, Response } from 'express';
import { anaPlatformController, AnaAction } from '../services/ana-platform-controller';

const router = Router();

// ── Helper: extract org ID from request ───────────────────

function getOrgId(req: Request): number | null {
  const orgId =
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    (req as any).user?.organizationId ||
    req.query.organizationId ||
    req.body?.organizationId;
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

  const userId = (req as any).userId || (req as any).user?.id;
  const result = await anaPlatformController.updateSettings(orgId, req.body, userId);
  res.status(result.success ? 200 : 403).json(result);
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

  const result = await anaPlatformController.toggleModule(orgId, moduleId, enabled);
  res.status(result.success ? 200 : 403).json(result);
});

// ── Project Management ────────────────────────────────────

/**
 * POST /api/ana/platform/projects
 * Create a new project with Ana-configured defaults
 */
router.post('/projects', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const { name, description, submissionType, therapeuticArea, targetAgency, complianceFrameworks } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name required' });

  const result = await anaPlatformController.createProject(orgId, {
    name,
    description,
    submissionType,
    therapeuticArea,
    targetAgency,
    complianceFrameworks,
  });
  res.status(result.success ? 201 : result.error?.includes('limit') ? 402 : 403).json(result);
});

/**
 * PATCH /api/ana/platform/projects/:projectId
 * Update project configuration
 */
router.patch('/projects/:projectId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const projectId = parseInt(req.params.projectId, 10);
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

  const result = await anaPlatformController.configureAI(orgId, req.body);
  res.status(result.success ? 200 : 403).json(result);
});

// ── Compliance ────────────────────────────────────────────

/**
 * PATCH /api/ana/platform/compliance
 * Set default compliance frameworks and requirements
 */
router.patch('/compliance', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const result = await anaPlatformController.setComplianceDefaults(orgId, req.body);
  res.status(result.success ? 200 : 403).json(result);
});

// ── Onboarding ────────────────────────────────────────────

/**
 * POST /api/ana/platform/onboard
 * Run full organization onboarding (sets defaults, creates starter project, enables modules)
 * Body: { therapeuticArea, primaryAgency, submissionType, companySize? }
 */
router.post('/onboard', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const { therapeuticArea, primaryAgency, submissionType, companySize } = req.body;
  if (!therapeuticArea || !primaryAgency || !submissionType) {
    return res.status(400).json({ error: 'therapeuticArea, primaryAgency, and submissionType are required' });
  }

  const result = await anaPlatformController.onboardOrganization(orgId, {
    therapeuticArea,
    primaryAgency,
    submissionType,
    companySize,
  });
  res.status(result.success ? 200 : 403).json(result);
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

// ── Agentic Action Executor ───────────────────────────────

/**
 * POST /api/ana/platform/execute
 * Execute an arbitrary agentic action. This is Ana's primary autonomous
 * control endpoint — she can dispatch any action through this route.
 *
 * Body: AnaAction { id, category, action, description, parameters, requiresConfirmation }
 */
router.post('/execute', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID required' });

  const action = req.body as AnaAction;
  if (!action.category || !action.action) {
    return res.status(400).json({ error: 'Action must include category and action name' });
  }

  // HITL breakpoint — if the action requires confirmation, return a confirmation request
  if (action.requiresConfirmation) {
    return res.status(200).json({
      success: true,
      action: 'confirmation_required',
      result: {
        pendingAction: action,
        message: `Ana requests confirmation to: ${action.description}`,
        confirmEndpoint: '/api/ana/platform/execute',
        instructions: 'Resend this action with requiresConfirmation: false to confirm',
      },
    });
  }

  const result = await anaPlatformController.executeAction(orgId, action);
  res.status(result.success ? 200 : 403).json(result);
});

export default router;
