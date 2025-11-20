import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { projects, insertProjectSchema, clientWorkspaces, organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { enforceProjectQuota } from '../services/quotaEnforcementService.js';

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
    // Support both header and query parameter for organizationId
    const organizationIdParam = req.headers['x-organization-id'] || req.query.organizationId;
    const organizationId = parseInt(organizationIdParam as string);

    console.log('🔍 GET projects request - organizationId:', organizationId, 'from:', req.headers['x-organization-id'] ? 'header' : 'query');

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    // Get projects from database
    const orgProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, organizationId));

    console.log('🔍 Retrieved projects for org', organizationId, ':', orgProjects.length);
    console.log('🔍 Projects data:', orgProjects);
    res.json(orgProjects);
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

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Check if project exists
    const [existingProject] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete the project
    await db.delete(projects).where(eq(projects.id, projectId));

    console.log(`Deleted project ${projectId} (${existingProject.name})`);
    res.json({ message: 'Project deleted successfully', projectId });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
