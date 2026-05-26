import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { auditEvents, projects, clientWorkspaces, organizations } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import quotaEnforcementService from '../services/quotaEnforcementService.js';
import { getRequestActor, getTenantContext } from '../utils/tenantContext';
import { emitRuleEvent } from '../services/rules-engine';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('projects-management');
const { getActiveLicenseForOrganization } = quotaEnforcementService;

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['clinical_trial', 'regulatory_submission', 'medical_device', 'literature_review']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dueDate: z.string().optional(),
  parentProjectId: z.number().optional(),
  organizationId: z
    .union([z.string(), z.number()])
    .transform(val => {
      return typeof val === 'string' ? parseInt(val, 10) : val;
    })
    .pipe(z.number().int().positive())
    .optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters').optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on-hold', 'completed', 'archived']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

/**
 * GET /api/projects
 * Get all projects for organization
 */
router.get('/', async (req, res) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId, clientWorkspaceId } = tenantContext;

    log.debug('🔍 GET projects request', {
      organizationId,
      // security-allow: source-telemetry
      from: req.headers['x-organization-id'] ? 'header' : 'query',
    });

    const license = await getActiveLicenseForOrganization(organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }

    // Get projects from database
    const orgProjects = await db
      .select()
      .from(projects)
      .where(
        clientWorkspaceId
          ? and(
              eq(projects.organizationId, organizationId),
              eq(projects.clientWorkspaceId, clientWorkspaceId)
            )
          : eq(projects.organizationId, organizationId)
      );

    const filteredProjects = clientWorkspaceId
      ? orgProjects.filter(project => project.clientWorkspaceId === clientWorkspaceId)
      : orgProjects;

    log.debug('🔍 Retrieved projects for org', {
      organizationId,
      count: orgProjects.length,
    });
    log.debug('🔍 Projects data:', orgProjects);
    res.json(filteredProjects);
  } catch (error) {
    log.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/projects/:projectId
 * Get a specific project
 */
router.get('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId, clientWorkspaceId } = tenantContext;

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const license = await getActiveLicenseForOrganization(organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }

    const whereClause = clientWorkspaceId
      ? and(
          eq(projects.id, projectId),
          eq(projects.organizationId, organizationId),
          eq(projects.clientWorkspaceId, clientWorkspaceId)
        )
      : and(eq(projects.id, projectId), eq(projects.organizationId, organizationId));

    const [project] = await db.select().from(projects).where(whereClause);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    log.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    log.debug('Create project request received');

    const validatedData = createProjectSchema.parse(req.body);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const authenticatedOrgId = tenantContext.organizationId;
    if (
      validatedData.organizationId !== undefined &&
      validatedData.organizationId !== authenticatedOrgId
    ) {
      return res.status(403).json({
        error: 'organizationId in payload does not match authenticated tenant',
      });
    }
    const organizationId = authenticatedOrgId;

    const license = await getActiveLicenseForOrganization(organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }

    // Find an available client workspace for the organization first
    let availableClients = await db
      .select()
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, organizationId))
      .limit(1);

    let clientWorkspaceId: number;

    if (availableClients.length === 0) {
      // Auto-create a default client workspace for the organization
      log.debug(
        `No client workspaces found for organization ${organizationId}. Creating default workspace.`
      );

      // Get organization info for default workspace creation
      const [organization] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!organization) {
        return res.status(400).json({
          error: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND',
        });
      }

      const [newClientWorkspace] = await db
        .insert(clientWorkspaces)
        .values({
          organizationId,
          name: `${organization.name} - Default Workspace`,
          slug: `${organization.slug}-default`,
          description: 'Default client workspace created automatically for project management',
          status: 'active',
          industry: organization.industryMode || 'pharmaceutical',
          quotaProjects: organization.maxProjects || 10,
          quotaStorage: organization.maxStorage || 5,
        } as any)
        .returning();

      clientWorkspaceId = newClientWorkspace.id;
      log.debug(
        `Created default client workspace ${clientWorkspaceId} (${newClientWorkspace.name}) for organization ${organizationId}`
      );
    } else {
      clientWorkspaceId = availableClients[0].id;
      log.debug(
        `Using existing client workspace ${clientWorkspaceId} (${availableClients[0].name}) for project creation`
      );
    }

    // Use atomic project creation with quota enforcement.
    // atomicQuotaService is an untyped JS module; the global '*.js' shim only
    // surfaces a default export, so read the named function off the namespace.
    const atomicQuotaService = (await import(
      '../services/atomicQuotaService.js'
    )) as unknown as {
      atomicCreateProject: (
        organizationId: number,
        projectData: Record<string, unknown>,
      ) => Promise<{
        success: boolean;
        error?: string;
        message?: string;
        details?: unknown;
        data?: any;
        quotaInfo?: unknown;
      }>;
    };
    const result = await atomicQuotaService.atomicCreateProject(organizationId, {
      name: validatedData.name,
      description: validatedData.description || null,
      type: validatedData.type,
      priority: validatedData.priority,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
      clientWorkspaceId: clientWorkspaceId,
      status: 'active',
    });

    if (!result.success) {
      if (result.error === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          message: result.message,
          details: result.details,
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    log.debug('Created project atomically:', result.data);
    log.debug('Quota info:', result.quotaInfo);

    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);

      await db.insert(auditEvents).values({
        organizationId,
        eventType: 'project_create',
        entityType: 'project',
        entityId: result.data.id,
        userId: null,
        userName,
        userRole,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
        timestamp: now,
        timestampUtc: now,
        oldValues: null,
        newValues: result.data,
        changedFields: Object.keys(result.data || {}),
        reason: 'Project created',
        comments: null,
        requiresSignature: false,
        regulatorySignificant: true,
        gxpRelevant: true,
        metadata: {
          source: 'projects-management',
          clientWorkspaceId: result.data.client_workspace_id ?? result.data.clientWorkspaceId,
        },
      });
    } catch (auditError) {
      log.error('Audit trail creation failed (non-blocking):', auditError);
    }

    // Emit rules engine event for project creation
    try {
      await emitRuleEvent('project_created', organizationId, result.data.id, {
        project: result.data,
      });
    } catch (ruleError) {
      log.error('Rules engine event emission failed (non-blocking):', ruleError);
    }

    res.status(201).json(result.data);
  } catch (error) {
    log.error('Error creating project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid project data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * DELETE /api/projects/:projectId
 * Delete a specific project
 */
router.delete('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId } = tenantContext;

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const license = await getActiveLicenseForOrganization(organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }

    // Check if project exists
    const [existingProject] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existingProject.organizationId !== organizationId) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Delete the project
    await db.delete(projects).where(eq(projects.id, projectId));

    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);

      await db.insert(auditEvents).values({
        organizationId,
        eventType: 'project_delete',
        entityType: 'project',
        entityId: existingProject.id,
        userId: null,
        userName,
        userRole,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
        timestamp: now,
        timestampUtc: now,
        oldValues: existingProject,
        newValues: null,
        changedFields: Object.keys(existingProject || {}),
        reason: 'Project deleted',
        comments: null,
        requiresSignature: false,
        regulatorySignificant: true,
        gxpRelevant: true,
        metadata: {
          source: 'projects-management',
          clientWorkspaceId: existingProject.clientWorkspaceId,
        },
      });
    } catch (auditError) {
      log.error('Audit trail creation failed (non-blocking):', auditError);
    }

    log.debug(`Deleted project ${projectId} (${existingProject.name})`);
    res.json({ message: 'Project deleted successfully', projectId });
  } catch (error) {
    log.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/**
 * PATCH /api/projects/:projectId
 * Update a specific project
 */
router.patch('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId } = tenantContext;

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const license = await getActiveLicenseForOrganization(organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }

    const updates = updateProjectSchema.parse(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    const [existingProject] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existingProject.organizationId !== organizationId) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const [updatedProject] = await db
      .update(projects)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();

    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);

      await db.insert(auditEvents).values({
        organizationId,
        eventType: 'project_update',
        entityType: 'project',
        entityId: projectId,
        userId: null,
        userName,
        userRole,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
        timestamp: now,
        timestampUtc: now,
        oldValues: existingProject,
        newValues: updatedProject,
        changedFields: Object.keys(updates),
        reason: 'Project updated',
        comments: null,
        requiresSignature: false,
        regulatorySignificant: true,
        gxpRelevant: true,
        metadata: {
          source: 'projects-management',
          clientWorkspaceId: existingProject.clientWorkspaceId,
        },
      });
    } catch (auditError) {
      log.error('Audit trail creation failed (non-blocking):', auditError);
    }

    // Emit rules engine events for project updates
    try {
      await emitRuleEvent('project_updated', organizationId, projectId, {
        project: updatedProject,
        previousValues: existingProject,
        changedFields: Object.keys(updates),
      });
      // Detect status change specifically
      if (updates.status && updates.status !== existingProject.status) {
        await emitRuleEvent('project_status_changed', organizationId, projectId, {
          project: updatedProject,
          previousStatus: existingProject.status,
          newStatus: updates.status,
        });
      }
    } catch (ruleError) {
      log.error('Rules engine event emission failed (non-blocking):', ruleError);
    }

    res.json(updatedProject);
  } catch (error) {
    log.error('Error updating project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid project data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
});

export default router;
