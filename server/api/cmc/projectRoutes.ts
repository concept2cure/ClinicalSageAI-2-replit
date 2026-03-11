import { Router } from 'express';
import { db } from '../../db';
import {
  cmcProjects,
  drugSubstances,
  drugProducts,
  analyticalMethods,
  stabilityStudies,
  complianceTracking,
  regulatoryDocuments,
} from '../../../shared/cmc-schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { authenticateToken } from '../../middleware/auth.js';

const router = Router();

// All CMC project routes require authentication
router.use(authenticateToken);

/** Extract organizationId from the authenticated user, return null if missing */
function getOrgId(req: any): string | null {
  const orgId = req.user?.organizationId;
  if (orgId == null) return null;
  return String(orgId);
}

/** Verify a project belongs to the user's organization */
async function verifyProjectOwnership(projectId: string, orgId: string) {
  if (!db) return null;
  const [project] = await db
    .select()
    .from(cmcProjects)
    .where(and(eq(cmcProjects.id, projectId), eq(cmcProjects.organizationId, orgId)));
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
      .where(eq(cmcProjects.organizationId, orgId))
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
      .where(and(eq(cmcProjects.id, id), eq(cmcProjects.organizationId, orgId)))
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
      .where(and(eq(cmcProjects.id, id), eq(cmcProjects.organizationId, orgId)));

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting CMC project:', error);
    res.status(500).json({ error: 'Failed to delete CMC project' });
  }
});

// Drug Substances endpoints
router.post('/projects/:projectId/substances', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const substanceData = { ...req.body, projectId };

    const [newSubstance] = await db
      .insert(drugSubstances)
      .values({
        ...substanceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newSubstance });
  } catch (error) {
    console.error('Error creating drug substance:', error);
    res.status(500).json({ error: 'Failed to create drug substance' });
  }
});

router.get('/projects/:projectId/substances', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const substances = await db
      .select()
      .from(drugSubstances)
      .where(eq(drugSubstances.projectId, projectId))
      .orderBy(desc(drugSubstances.createdAt));

    res.json({ success: true, data: substances });
  } catch (error) {
    console.error('Error fetching drug substances:', error);
    res.status(500).json({ error: 'Failed to fetch drug substances' });
  }
});

// Drug Products endpoints
router.post('/projects/:projectId/products', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const productData = { ...req.body, projectId };

    const [newProduct] = await db
      .insert(drugProducts)
      .values({
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newProduct });
  } catch (error) {
    console.error('Error creating drug product:', error);
    res.status(500).json({ error: 'Failed to create drug product' });
  }
});

router.get('/projects/:projectId/products', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const products = await db
      .select()
      .from(drugProducts)
      .where(eq(drugProducts.projectId, projectId))
      .orderBy(desc(drugProducts.createdAt));

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching drug products:', error);
    res.status(500).json({ error: 'Failed to fetch drug products' });
  }
});

// Analytical Methods endpoints
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
    const complianceData = { ...req.body, projectId };

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
    const documentData = { ...req.body, projectId };

    const [newDocument] = await db
      .insert(regulatoryDocuments)
      .values({
        ...documentData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newDocument });
  } catch (error) {
    console.error('Error creating regulatory document:', error);
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

// Add endpoints that match frontend expectations
router.post('/projects/:projectId/drug-substances', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const substanceData = {
      ...req.body,
      projectId,
      // Map frontend field names to database field names
      cas: req.body.casNumber, // Map casNumber to cas
    };

    // Remove the old field name to avoid conflicts
    delete substanceData.casNumber;

    const [newSubstance] = await db
      .insert(drugSubstances)
      .values({
        ...substanceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newSubstance });
  } catch (error) {
    console.error('Error creating drug substance:', error);
    res.status(500).json({ error: 'Failed to create drug substance' });
  }
});

router.get('/projects/:projectId/drug-substances', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const substances = await db
      .select()
      .from(drugSubstances)
      .where(eq(drugSubstances.projectId, projectId))
      .orderBy(desc(drugSubstances.createdAt));

    res.json({ success: true, data: substances });
  } catch (error) {
    console.error('Error fetching drug substances:', error);
    res.status(500).json({ error: 'Failed to fetch drug substances' });
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
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.get('/projects/:projectId/compliance', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const compliance = await db
      .select()
      .from(complianceTracking)
      .where(eq(complianceTracking.projectId, projectId))
      .orderBy(desc(complianceTracking.createdAt));

    res.json({ success: true, data: compliance });
  } catch (error) {
    console.error('Error fetching compliance:', error);
    res.status(500).json({ error: 'Failed to fetch compliance' });
  }
});

// Drug Products endpoints
router.get('/projects/:projectId/drug-products', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;

    const products = await db
      .select()
      .from(drugProducts)
      .where(eq(drugProducts.projectId, projectId))
      .orderBy(desc(drugProducts.createdAt));

    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching drug products:', error);
    res.status(500).json({ error: 'Failed to fetch drug products' });
  }
});

router.post('/projects/:projectId/drug-products', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { projectId } = req.params;
    const productData = { ...req.body, projectId };

    const [newProduct] = await db
      .insert(drugProducts)
      .values({
        ...productData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    res.json({ success: true, data: newProduct });
  } catch (error) {
    console.error('Error creating drug product:', error);
    res.status(500).json({ error: 'Failed to create drug product' });
  }
});

router.put('/projects/:projectId/drug-products/:productId', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { productId } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };

    const [updatedProduct] = await db
      .update(drugProducts)
      .set(updateData)
      .where(eq(drugProducts.id, productId))
      .returning();

    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error('Error updating drug product:', error);
    res.status(500).json({ error: 'Failed to update drug product' });
  }
});

router.delete('/projects/:projectId/drug-products/:productId', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const { productId } = req.params;

    await db.delete(drugProducts).where(eq(drugProducts.id, productId));

    res.json({ success: true, message: 'Drug product deleted successfully' });
  } catch (error) {
    console.error('Error deleting drug product:', error);
    res.status(500).json({ error: 'Failed to delete drug product' });
  }
});

// ── Top-level convenience routes for drug substances and products ──
// These return all substances/products for projects owned by the user's org
router.get('/drug-substances', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const orgProjects = await db
      .select({ id: cmcProjects.id })
      .from(cmcProjects)
      .where(eq(cmcProjects.organizationId, orgId));
    const projectIds = orgProjects.map(p => p.id);
    const substances =
      projectIds.length > 0
        ? await db
            .select()
            .from(drugSubstances)
            .where(inArray(drugSubstances.projectId, projectIds))
        : [];
    res.json({ success: true, data: substances });
  } catch (error) {
    console.error('Error fetching all drug substances:', error);
    res.status(500).json({ error: 'Failed to fetch drug substances' });
  }
});

router.get('/drug-products', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const orgId = getOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const orgProjects = await db
      .select({ id: cmcProjects.id })
      .from(cmcProjects)
      .where(eq(cmcProjects.organizationId, orgId));
    const projectIds = orgProjects.map(p => p.id);
    const products =
      projectIds.length > 0
        ? await db.select().from(drugProducts).where(inArray(drugProducts.projectId, projectIds))
        : [];
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error fetching all drug products:', error);
    res.status(500).json({ error: 'Failed to fetch drug products' });
  }
});

export default router;
