import { Router } from 'express';
import { db } from '../../db';
import {
  cmcProjects,
  drugSubstances,
  analyticalMethods,
  stabilityStudies,
  complianceTracking,
  regulatoryDocuments,
  insertRegulatoryDocumentSchema,
} from '../../../shared/cmc-schema';
import { eq, desc, and } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth.js';
import { z } from 'zod';

const router = Router();

// All CMC project routes require authentication
router.use(authenticateToken);

/** Extract organizationId from the authenticated user, return null if missing */
function getOrgId(req: any): number | null {
  const orgId = req.user?.organizationId;
  if (orgId == null) return null;
  const numericOrgId = Number(orgId);
  return Number.isFinite(numericOrgId) ? numericOrgId : null;
}

/** Verify a project belongs to the user's organization */
async function verifyProjectOwnership(projectId: string, orgId: number) {
  if (!db) return null;
  const [project] = await db
    .select()
    .from(cmcProjects)
    .where(and(eq(cmcProjects.id, projectId), eq(cmcProjects.organizationId, Number(orgId))));
  return project || null;
}

// Middleware: verify project ownership for all sub-resource routes
router.param('projectId', async (req: any, res, next, projectId: string) => {
  const orgId = getOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'Organization context required' });
  if (!db) return res.status(500).json({ error: 'Database not available' });
  const project = await verifyProjectOwnership(projectId, orgId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  req.cmcProject = project; // attach for downstream use
  next();
});

// Create CMC Project
router.post('/projects', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const projectData = req.body;

    const [newProject] = await db
      .insert(cmcProjects)
      .values({
        ...projectData,
        organizationId: orgId,
        targetSubmissionDate: projectData.targetSubmissionDate
          ? new Date(projectData.targetSubmissionDate)
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newProject });
  } catch (error) {
    console.error('Error creating CMC project:', error);
    res.status(500).json({ error: 'Failed to create CMC project' });
  }
});

// Get all CMC Projects
router.get('/projects', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const projects = await db
      .select()
      .from(cmcProjects)
      .where(eq(cmcProjects.organizationId, Number(orgId)))
      .orderBy(desc(cmcProjects.createdAt));

    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Error fetching CMC projects:', error);
    res.status(500).json({ error: 'Failed to fetch CMC projects' });
  }
});

// Get single CMC Project
router.get('/projects/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { id } = req.params;

    const project = await verifyProjectOwnership(id, orgId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get related data
    const substances = await db
      .select()
      .from(drugSubstances)
      .where(eq(drugSubstances.projectId, id));

    const methods = await db
      .select()
      .from(analyticalMethods)
      .where(eq(analyticalMethods.projectId, id));

    const documents = await db
      .select()
      .from(regulatoryDocuments)
      .where(eq(regulatoryDocuments.projectId, id));

    const compliance = await db
      .select()
      .from(complianceTracking)
      .where(eq(complianceTracking.projectId, id));

    const projectDetail = {
      ...project,
      drugSubstances: substances,
      analyticalMethods: methods,
      regulatoryDocuments: documents,
      complianceTracking: compliance,
    };

    res.json({ success: true, data: projectDetail });
  } catch (error) {
    console.error('Error fetching CMC project:', error);
    res.status(500).json({ error: 'Failed to fetch CMC project' });
  }
});

// Update CMC Project
router.put('/projects/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { id } = req.params;

    // Verify ownership before updating
    const existing = await verifyProjectOwnership(id, orgId);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updateData = req.body;

    const [updatedProject] = await db
      .update(cmcProjects)
      .set({
        ...updateData,
        organizationId: orgId, // Prevent org reassignment
        updatedAt: new Date(),
      })
      .where(and(eq(cmcProjects.id, id), eq(cmcProjects.organizationId, Number(orgId))))
      .returning();

    res.json({ success: true, data: updatedProject });
  } catch (error) {
    console.error('Error updating CMC project:', error);
    res.status(500).json({ error: 'Failed to update CMC project' });
  }
});

// Delete CMC Project
router.delete('/projects/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const orgId = getOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    const { id } = req.params;

    // Verify ownership before deleting
    const existing = await verifyProjectOwnership(id, orgId);
    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db
      .delete(cmcProjects)
      .where(and(eq(cmcProjects.id, id), eq(cmcProjects.organizationId, Number(orgId))));

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting CMC project:', error);
    res.status(500).json({ error: 'Failed to delete CMC project' });
  }
});

router.post('/projects/:projectId/analytical-methods', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const methodData = { ...req.body, projectId };

    const [newMethod] = await db
      .insert(analyticalMethods)
      .values({
        ...methodData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newMethod });
  } catch (error) {
    console.error('Error creating analytical method:', error);
    res.status(500).json({ error: 'Failed to create analytical method' });
  }
});

router.get('/projects/:projectId/analytical-methods', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const methods = await db
      .select()
      .from(analyticalMethods)
      .where(eq(analyticalMethods.projectId, projectId))
      .orderBy(desc(analyticalMethods.createdAt));

    res.json({ success: true, data: methods });
  } catch (error) {
    console.error('Error fetching analytical methods:', error);
    res.status(500).json({ error: 'Failed to fetch analytical methods' });
  }
});

// Stability Studies endpoints
router.post('/projects/:projectId/stability-studies', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const studyData = { ...req.body, projectId };

    const [newStudy] = await db
      .insert(stabilityStudies)
      .values({
        ...studyData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newStudy });
  } catch (error) {
    console.error('Error creating stability study:', error);
    res.status(500).json({ error: 'Failed to create stability study' });
  }
});

router.get('/projects/:projectId/stability-studies', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const studies = await db
      .select()
      .from(stabilityStudies)
      .where(eq(stabilityStudies.projectId, projectId))
      .orderBy(desc(stabilityStudies.createdAt));

    res.json({ success: true, data: studies });
  } catch (error) {
    console.error('Error fetching stability studies:', error);
    res.status(500).json({ error: 'Failed to fetch stability studies' });
  }
});

// Compliance Tracking endpoints
router.post('/projects/:projectId/compliance', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    // The organization comes from the VERIFIED project, never from the body.
    // router.param('projectId') above has already confirmed this project belongs
    // to the caller's org and attached it, so this is the authenticated owner —
    // and stamping it is what lets the read be strict instead of widening to
    // every unattributed row.
    const ownerOrgId = (req as any).cmcProject?.organizationId;
    if (ownerOrgId == null) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const complianceData = { ...req.body, projectId, organizationId: Number(ownerOrgId) };

    // Fix date conversion issue
    if (complianceData.dueDate && typeof complianceData.dueDate === 'string') {
      complianceData.dueDate = new Date(complianceData.dueDate);
    }
    if (complianceData.completedDate && typeof complianceData.completedDate === 'string') {
      complianceData.completedDate = new Date(complianceData.completedDate);
    }

    const [newCompliance] = await db
      .insert(complianceTracking)
      .values({
        ...complianceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newCompliance });
  } catch (error) {
    console.error('Error creating compliance item:', error);
    res.status(500).json({ error: 'Failed to create compliance item' });
  }
});

router.get('/projects/:projectId/compliance', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const complianceItems = await db
      .select()
      .from(complianceTracking)
      .where(eq(complianceTracking.projectId, projectId))
      .orderBy(desc(complianceTracking.createdAt));

    res.json({ success: true, data: complianceItems });
  } catch (error) {
    console.error('Error fetching compliance tracking:', error);
    res.status(500).json({ error: 'Failed to fetch compliance tracking' });
  }
});

// Regulatory Documents endpoints
router.post('/projects/:projectId/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const orgIdFromAuth = Number(getOrgId(req));
    const organizationId =
      Number(req.body?.organizationId) ||
      (Number.isFinite(orgIdFromAuth) ? orgIdFromAuth : 0);

    if (!organizationId || organizationId <= 0) {
      return res.status(400).json({ error: 'Valid organizationId is required' });
    }

    const validatedDocumentData = insertRegulatoryDocumentSchema
      .omit({
        id: true,
        createdAt: true,
        updatedAt: true,
      })
      .partial()
      .required({
        documentType: true,
        title: true,
      })
      .parse({
        ...req.body,
        projectId,
        organizationId,
        status: req.body?.status || 'draft',
        version: req.body?.version || '1.0',
      });

    const [newDocument] = await db
      .insert(regulatoryDocuments)
      .values({
        ...validatedDocumentData,
        // Re-assert NOT NULL columns the partial insert schema marks optional;
        // these are always supplied above via .parse().
        projectId,
        organizationId,
        documentType: validatedDocumentData.documentType,
        title: validatedDocumentData.title,
        status: validatedDocumentData.status ?? 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    res.json({ success: true, data: newDocument });
  } catch (error) {
    console.error('Error creating regulatory document:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid document payload',
        issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    res.status(500).json({ error: 'Failed to create regulatory document' });
  }
});

router.get('/projects/:projectId/documents', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const documents = await db
      .select()
      .from(regulatoryDocuments)
      .where(eq(regulatoryDocuments.projectId, projectId))
      .orderBy(desc(regulatoryDocuments.createdAt));

    res.json({ success: true, data: documents });
  } catch (error) {
    console.error('Error fetching regulatory documents:', error);
    res.status(500).json({ error: 'Failed to fetch regulatory documents' });
  }
});


/* ── The two top-level convenience routes that used to live here are gone ──
 *
 * `GET /drug-substances` and `GET /drug-products` were defined here AND in
 * server/api/cmc/routes.ts, which register-core-routes.ts mounts FIRST — so
 * these two never ran. That is the only reason they were harmless: both
 * resolved the caller's projects through `cmc_projects`, a table the product
 * never populates (its sole creator is a reconstruction of a table with no DDL
 * anywhere), so both would have answered every organization with an empty list
 * — a failed read rendered as "you have no drug substances", which is the one
 * thing this codebase does not do. One canonical implementation per capability:
 * the org-scoped handlers in routes.ts are it, and these are deleted rather
 * than left as a trap for the next person who reorders a mount.
 *
 * ── And the ten project-nested substance/product handlers, for more ────────
 *
 * Same rule, sharper reason. POST/GET /projects/:projectId/substances,
 * /products and /drug-substances, GET/POST/PUT/DELETE
 * /projects/:projectId/drug-products all bound drug_substances and
 * drug_products through shared/cmc-schema.ts, whose model shape (uuid id,
 * project_id FK, no organization_id) contradicts the provisioned table (serial
 * id, organization_id NOT NULL, no project_id) — so every one of them threw at
 * the database on any provisioned environment. No client called them; a
 * repo-wide scan of /api/cmc/* literals in client/src returns nothing for this
 * router.
 *
 * Broken is not the worst of it. Two of them were dangerous:
 *
 *   • The write handlers spread the request body into the insert
 *     (`{ ...req.body, projectId }` → `.values({ ...substanceData })`), so a
 *     caller supplying organizationId wrote a governed CMC record attributed
 *     to another sponsor.
 *   • PUT and DELETE /drug-products/:productId predicated on the bare
 *     `eq(drugProducts.id, productId)` — no organization and no project — so
 *     any authenticated caller could edit or destroy another tenant's drug
 *     product. A GxP record deleted with no ownership check and no audit of
 *     whose it was.
 *
 * THE REPLACEMENT, by path: server/api/cmc/routes.ts. GET/POST/PUT
 * /api/cmc/drug-substances (:580/:608/:619) and /api/cmc/drug-products
 * (:638/:672/:683), each scoped `where(eq(..., organizationId))`, each writing
 * through to the Module 3 canonical sources. It is the path the product
 * actually uses and the one scripts/dev/cmc-staff-simulation.sh exercises —
 * its step 3 registers the drug substance through it, and the run is 118
 * assertions green — so the capability is proven reachable, not merely
 * asserted to be.
 */

export default router;
