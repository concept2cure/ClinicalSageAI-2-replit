import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { auditEvents, projects, clientWorkspaces, organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getActiveLicenseForOrganization } from '../services/quotaEnforcementService.js';

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters'),
  description: z.string().optional(),
  type: z.enum(['clinical_trial', 'regulatory_submission', 'medical_device', 'literature_review']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dueDate: z.string().optional(),
  organizationId: z
    .union([z.string(), z.number()])
    .transform(val => {
      return typeof val === 'string' ? parseInt(val, 10) : val;
    })
    .pipe(z.number().int().positive()),
});

/**
 * GET /api/projects
 * Get all projects for organization
 */
router.get('/', async (req, res) => {
  try {
    // Support header/query params for organization/workspace context
    const organizationIdParam =
      req.headers['x-organization-id'] ||
      req.query.organizationId ||
      req.query.organization_id;
    const clientWorkspaceIdParam =
      req.headers['x-client-workspace-id'] ||
      req.query.clientWorkspaceId ||
      req.query.client_workspace_id;
    const organizationId = parseInt(organizationIdParam as string, 10);
    const clientWorkspaceId = clientWorkspaceIdParam
      ? parseInt(clientWorkspaceIdParam as string, 10)
      : null;

    console.log('🔍 GET projects request - organizationId:', organizationId, 'from:', req.headers['x-organization-id'] ? 'header' : 'query');

    if (!organizationId || Number.isNaN(organizationId)) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const license = await getActiveLicenseForOrganization(organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }

    // Get projects from database
    const orgProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId));

    const filteredProjects = clientWorkspaceId
      ? orgProjects.filter(project => project.clientWorkspaceId === clientWorkspaceId)
      : orgProjects;

    console.log('🔍 Retrieved projects for org', organizationId, ':', orgProjects.length);
    console.log('🔍 Projects data:', orgProjects);
    res.json(filteredProjects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    console.log('Create project request received:', req.body);

    const validatedData = createProjectSchema.parse(req.body);

    const license = await getActiveLicenseForOrganization(validatedData.organizationId);
    if (!license) {
      return res.status(403).json({ error: 'No active license for this organization' });
    }
    
    // Find an available client workspace for the organization first
    let availableClients = await db
      .select()
      .from(clientWorkspaces)
      .where(eq(clientWorkspaces.organizationId, validatedData.organizationId))
      .limit(1);

    let clientWorkspaceId: number;

    if (availableClients.length === 0) {
      // Auto-create a default client workspace for the organization
      console.log(
        `No client workspaces found for organization ${validatedData.organizationId}. Creating default workspace.`
      );

      // Get organization info for default workspace creation
      const [organization] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, validatedData.organizationId))
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
          organizationId: validatedData.organizationId,
          name: `${organization.name} - Default Workspace`,
          slug: `${organization.slug}-default`,
          description: 'Default client workspace created automatically for project management',
          status: 'active',
          industry: organization.industryType || 'pharmaceutical',
          tier: organization.tier || 'standard',
          quotaUsers: organization.maxUsers || 5,
          quotaProjects: organization.maxProjects || 10,
          quotaStorage: organization.maxStorage || 5,
        })
        .returning();

      clientWorkspaceId = newClientWorkspace.id;
      console.log(
        `Created default client workspace ${clientWorkspaceId} (${newClientWorkspace.name}) for organization ${validatedData.organizationId}`
      );
    } else {
      clientWorkspaceId = availableClients[0].id;
      console.log(
        `Using existing client workspace ${clientWorkspaceId} (${availableClients[0].name}) for project creation`
      );
    }
    
    // Use atomic project creation with quota enforcement
    const { atomicCreateProject } = await import('../services/atomicQuotaService.js');
    const result = await atomicCreateProject(validatedData.organizationId, {
      name: validatedData.name,
      description: validatedData.description || null,
      type: validatedData.type,
      priority: validatedData.priority,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : null,
      clientWorkspaceId: clientWorkspaceId,
      status: 'active'
    });
    
    if (!result.success) {
      if (result.error === 'QUOTA_EXCEEDED') {
        return res.status(403).json({
          success: false,
          error: 'Quota exceeded',
          message: result.message,
          details: result.details
        });
      }
      return res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

    console.log('Created project atomically:', result.data);
    console.log('Quota info:', result.quotaInfo);

    try {
      const now = new Date();
      const userName =
        (req.headers['x-user-name'] as string) ||
        (req.headers['x-user-email'] as string) ||
        'system';
      const userRole = (req.headers['x-user-role'] as string) || null;

      await db.insert(auditEvents).values({
        organizationId: validatedData.organizationId,
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
      console.error('Audit trail creation failed (non-blocking):', auditError);
    }
    
    res.status(201).json(result.data);
  } catch (error) {
    console.error('Error creating project:', error);
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
    const organizationIdParam = req.headers['x-organization-id'] || req.query.organizationId;
    const organizationId = parseInt(organizationIdParam as string, 10);

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (!organizationId || Number.isNaN(organizationId)) {
      return res.status(400).json({ error: 'Organization ID is required' });
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
      const userName =
        (req.headers['x-user-name'] as string) ||
        (req.headers['x-user-email'] as string) ||
        'system';
      const userRole = (req.headers['x-user-role'] as string) || null;

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
      console.error('Audit trail creation failed (non-blocking):', auditError);
    }

    console.log(`Deleted project ${projectId} (${existingProject.name})`);
    res.json({ message: 'Project deleted successfully', projectId });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
