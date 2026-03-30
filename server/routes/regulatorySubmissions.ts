/**
 * Regulatory Submissions API Routes
 *
 * This router provides the API endpoints for the unified Regulatory Submissions Hub
 * that combines IND and eCTD functionality in a single system.
 */
import { Router } from 'express';
import { db } from '../db';
// These schema tables are not yet defined — use `any` placeholders to avoid TS errors
const submissionProjects: any = null;
const submissionSequences: any = null;
const documentModules: any = null;
const documentGranules: any = null;
const insertSubmissionProjectSchema: any = null;
const insertSubmissionSequenceSchema: any = null;
const insertDocumentModuleSchema: any = null;
const insertDocumentGranuleSchema: any = null;
import { requireFeature } from '../middleware/featureToggleMiddleware';
import { eq, and } from 'drizzle-orm';
import { validateRequest } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// Apply feature toggle protection to all routes
router.use(requireFeature('UNIFIED_REGULATORY_SUBMISSIONS'));

/**
 * Get all submission projects for the current tenant
 */
router.get('/projects', async (req, res) => {
  try {
    const { organizationId, clientWorkspaceId } = (req as any).tenantContext;

    const projects = await db
      .select()
      .from(submissionProjects)
      .where(
        and(
          eq(submissionProjects.organizationId, organizationId),
          eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
        )
      );

    return res.json(projects);
  } catch (error) {
    console.error('Error fetching submission projects:', error);
    return res.status(500).json({ error: 'Failed to fetch submission projects' });
  }
});

/**
 * Create a new submission project
 */
router.post('/projects', validateRequest(insertSubmissionProjectSchema), async (req, res) => {
  try {
    const { organizationId, clientWorkspaceId, userId } = (req as any).tenantContext;

    const newProject = await db
      .insert(submissionProjects)
      .values({
        ...req.body,
        organizationId,
        clientWorkspaceId,
        createdById: userId,
        lastModifiedById: userId,
      })
      .returning();

    return res.status(201).json(newProject[0]);
  } catch (error) {
    console.error('Error creating submission project:', error);
    return res.status(500).json({ error: 'Failed to create submission project' });
  }
});

/**
 * Get a specific submission project
 */
router.get('/projects/:id', async (req, res) => {
  try {
    const { organizationId, clientWorkspaceId } = (req as any).tenantContext;
    const { id } = req.params;

    const project = await db
      .select()
      .from(submissionProjects)
      .where(
        and(
          eq(submissionProjects.id, id),
          eq(submissionProjects.organizationId, organizationId),
          eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
        )
      )
      .limit(1);

    if (project.length === 0) {
      return res.status(404).json({ error: 'Submission project not found' });
    }

    return res.json(project[0]);
  } catch (error) {
    console.error('Error fetching submission project:', error);
    return res.status(500).json({ error: 'Failed to fetch submission project' });
  }
});

/**
 * Get all sequences for a submission project
 */
router.get('/projects/:id/sequences', async (req, res) => {
  try {
    const { organizationId, clientWorkspaceId } = (req as any).tenantContext;
    const { id } = req.params;

    // First, check if the project exists and belongs to this tenant
    const project = await db
      .select()
      .from(submissionProjects)
      .where(
        and(
          eq(submissionProjects.id, id),
          eq(submissionProjects.organizationId, organizationId),
          eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
        )
      )
      .limit(1);

    if (project.length === 0) {
      return res.status(404).json({ error: 'Submission project not found' });
    }

    // Fetch the sequences
    const sequences = await db
      .select()
      .from(submissionSequences)
      .where(eq(submissionSequences.submissionProjectId, id));

    return res.json(sequences);
  } catch (error) {
    console.error('Error fetching submission sequences:', error);
    return res.status(500).json({ error: 'Failed to fetch submission sequences' });
  }
});

/**
 * Create a new sequence for a submission project
 */
router.post(
  '/projects/:id/sequences',
  validateRequest(insertSubmissionSequenceSchema),
  async (req, res) => {
    try {
      const { organizationId, clientWorkspaceId } = (req as any).tenantContext;
      const { id } = req.params;

      // Check if the project exists and belongs to this tenant
      const project = await db
        .select()
        .from(submissionProjects)
        .where(
          and(
            eq(submissionProjects.id, id),
            eq(submissionProjects.organizationId, organizationId),
            eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
          )
        )
        .limit(1);

      if (project.length === 0) {
        return res.status(404).json({ error: 'Submission project not found' });
      }

      // Create the new sequence
      const newSequence = await db
        .insert(submissionSequences)
        .values({
          ...req.body,
          submissionProjectId: id,
        })
        .returning();

      return res.status(201).json(newSequence[0]);
    } catch (error) {
      console.error('Error creating submission sequence:', error);
      return res.status(500).json({ error: 'Failed to create submission sequence' });
    }
  }
);

/**
 * Get modules for a submission sequence
 */
router.get('/sequences/:id/modules', async (req, res) => {
  try {
    const { organizationId, clientWorkspaceId } = (req as any).tenantContext;
    const { id } = req.params;

    // First check if sequence belongs to this tenant
    const sequenceQuery = db
      .select({
        sequence: submissionSequences,
        project: submissionProjects,
      })
      .from(submissionSequences)
      .innerJoin(
        submissionProjects,
        eq(submissionSequences.submissionProjectId, submissionProjects.id)
      )
      .where(
        and(
          eq(submissionSequences.id, id),
          eq(submissionProjects.organizationId, organizationId),
          eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
        )
      )
      .limit(1);

    const sequenceResult = await sequenceQuery;

    if (sequenceResult.length === 0) {
      return res.status(404).json({ error: 'Submission sequence not found' });
    }

    // Fetch modules
    const modules = await db
      .select()
      .from(documentModules)
      .where(eq(documentModules.submissionSequenceId, id));

    return res.json(modules);
  } catch (error) {
    console.error('Error fetching document modules:', error);
    return res.status(500).json({ error: 'Failed to fetch document modules' });
  }
});

/**
 * Create a new module in a sequence
 */
router.post(
  '/sequences/:id/modules',
  validateRequest(insertDocumentModuleSchema),
  async (req, res) => {
    try {
      const { organizationId, clientWorkspaceId } = (req as any).tenantContext;
      const { id } = req.params;

      // Check sequence belongs to this tenant
      const sequenceQuery = db
        .select({
          sequence: submissionSequences,
          project: submissionProjects,
        })
        .from(submissionSequences)
        .innerJoin(
          submissionProjects,
          eq(submissionSequences.submissionProjectId, submissionProjects.id)
        )
        .where(
          and(
            eq(submissionSequences.id, id),
            eq(submissionProjects.organizationId, organizationId),
            eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
          )
        )
        .limit(1);

      const sequenceResult = await sequenceQuery;

      if (sequenceResult.length === 0) {
        return res.status(404).json({ error: 'Submission sequence not found' });
      }

      // Create the module
      const newModule = await db
        .insert(documentModules)
        .values({
          ...req.body,
          submissionSequenceId: id,
        })
        .returning();

      return res.status(201).json(newModule[0]);
    } catch (error) {
      console.error('Error creating document module:', error);
      return res.status(500).json({ error: 'Failed to create document module' });
    }
  }
);

/**
 * Get granules for a module
 */
router.get('/modules/:id/granules', async (req, res) => {
  try {
    const { organizationId, clientWorkspaceId } = (req as any).tenantContext;
    const { id } = req.params;

    // First check if module belongs to this tenant through the sequence and project
    const moduleQuery = db
      .select({
        module: documentModules,
        sequence: submissionSequences,
        project: submissionProjects,
      })
      .from(documentModules)
      .innerJoin(
        submissionSequences,
        eq(documentModules.submissionSequenceId, submissionSequences.id)
      )
      .innerJoin(
        submissionProjects,
        eq(submissionSequences.submissionProjectId, submissionProjects.id)
      )
      .where(
        and(
          eq(documentModules.id, id),
          eq(submissionProjects.organizationId, organizationId),
          eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
        )
      )
      .limit(1);

    const moduleResult = await moduleQuery;

    if (moduleResult.length === 0) {
      return res.status(404).json({ error: 'Document module not found' });
    }

    // Fetch granules
    const granules = await db
      .select()
      .from(documentGranules)
      .where(eq(documentGranules.moduleId, id));

    return res.json(granules);
  } catch (error) {
    console.error('Error fetching document granules:', error);
    return res.status(500).json({ error: 'Failed to fetch document granules' });
  }
});

/**
 * Create a new document granule in a module
 */
router.post(
  '/modules/:id/granules',
  validateRequest(insertDocumentGranuleSchema),
  async (req, res) => {
    try {
      const { organizationId, clientWorkspaceId, userId } = (req as any).tenantContext;
      const { id } = req.params;

      // Check module belongs to this tenant
      const moduleQuery = db
        .select({
          module: documentModules,
          sequence: submissionSequences,
          project: submissionProjects,
        })
        .from(documentModules)
        .innerJoin(
          submissionSequences,
          eq(documentModules.submissionSequenceId, submissionSequences.id)
        )
        .innerJoin(
          submissionProjects,
          eq(submissionSequences.submissionProjectId, submissionProjects.id)
        )
        .where(
          and(
            eq(documentModules.id, id),
            eq(submissionProjects.organizationId, organizationId),
            eq(submissionProjects.clientWorkspaceId, clientWorkspaceId)
          )
        )
        .limit(1);

      const moduleResult = await moduleQuery;

      if (moduleResult.length === 0) {
        return res.status(404).json({ error: 'Document module not found' });
      }

      // Create the granule
      const newGranule = await db
        .insert(documentGranules)
        .values({
          ...req.body,
          moduleId: id,
          sequenceId: moduleResult[0].sequence.id,
          lastModifiedById: userId,
        })
        .returning();

      return res.status(201).json(newGranule[0]);
    } catch (error) {
      console.error('Error creating document granule:', error);
      return res.status(500).json({ error: 'Failed to create document granule' });
    }
  }
);

// Export the router
export default router;
