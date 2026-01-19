import express from 'express';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from '../db/pool.js';
import {
  sections,
  sectionLinks,
  sectionPatches,
  sectionPropagations,
  leaves,
  leafPatches,
  auditTrail,
} from '../../shared/schema.ts';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import { z } from 'zod';

const db = drizzle(getPool());

const router = express.Router();

// Store active SSE connections by projectId
const projectConnections = new Map();

// Validation schemas
const linkSectionSchema = z.object({
  leafId: z.string(),
  sectionId: z.string(),
  projectId: z.number(),
  organizationId: z.number(),
  blockRange: z.object({
    start: z.string(),
    end: z.string()
  }).optional(),
  metadata: z.any().optional()
});

const patchSectionSchema = z.object({
  sectionId: z.string(),
  leafId: z.string(),
  patch: z.object({
    type: z.enum(['content', 'structure', 'metadata']),
    content: z.string().optional(),
    blocks: z.array(z.any()).optional(),
    citations: z.array(z.any()).optional(),
    metadata: z.any().optional()
  }),
  author: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().optional()
  }),
  version: z.number()
});

// Helper function to broadcast SSE messages to project subscribers
function broadcastToProject(projectId, event) {
  const connections = projectConnections.get(projectId);
  if (connections && connections.size > 0) {
    const message = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    connections.forEach(res => {
      try {
        res.write(message);
      } catch (error) {
        console.error(`Failed to send SSE to client in project ${projectId}:`, error);
      }
    });
  }
}

// Helper function to compute affected documents when a section is updated
async function computeAffectedDocuments(sectionId, organizationId) {
  try {
    // Find all documents (leaves) that link to this section
    const linkedDocuments = await db
      .select({
        leafId: sectionLinks.leafId,
        documentId: leaves.leafId,
        ctdPath: leaves.ctdPath,
        status: leaves.status,
        metadata: sectionLinks.metadata
      })
      .from(sectionLinks)
      .leftJoin(leaves, eq(sectionLinks.leafId, leaves.leafId))
      .where(
        and(
          eq(sectionLinks.sectionId, sectionId),
          eq(sectionLinks.organizationId, organizationId),
          eq(sectionLinks.isActive, true)
        )
      );

    return linkedDocuments.map(doc => ({
      documentId: doc.documentId,
      leafId: doc.leafId,
      ctdPath: doc.ctdPath,
      status: doc.status,
      linkMetadata: doc.metadata
    }));
  } catch (error) {
    console.error('Error computing affected documents:', error);
    return [];
  }
}

// Helper function to queue propagation events
async function queuePropagationEvents(sectionId, patch, affectedDocuments, author) {
  const propagations = [];
  const timestamp = new Date().toISOString();

  for (const doc of affectedDocuments) {
    propagations.push({
      sectionId,
      targetLeafId: doc.leafId,
      patchId: patch.id,
      status: 'pending',
      priority: doc.status === 'approved' ? 'high' : 'normal',
      scheduledAt: timestamp,
      metadata: {
        author,
        documentPath: doc.ctdPath,
        documentStatus: doc.status
      }
    });
  }

  // Insert propagation events
  if (propagations.length > 0) {
    await db.insert(sectionPropagations).values(propagations);
  }

  return propagations;
}

// Process propagation queue (would typically run in a background worker)
async function processPropagationQueue() {
  try {
    // Get pending propagations
    const pending = await db
      .select()
      .from(sectionPropagations)
      .where(eq(sectionPropagations.status, 'pending'))
      .orderBy(desc(sectionPropagations.priority), sectionPropagations.scheduledAt)
      .limit(10);

    for (const propagation of pending) {
      try {
        // Apply the patch to the target leaf
        await applyPatchToLeaf(propagation.targetLeafId, propagation.patchId);
        
        // Update propagation status
        await db
          .update(sectionPropagations)
          .set({
            status: 'completed',
            executedAt: new Date(),
            retryCount: propagation.retryCount || 0
          })
          .where(eq(sectionPropagations.id, propagation.id));
          
      } catch (error) {
        console.error(`Failed to propagate patch ${propagation.patchId} to leaf ${propagation.targetLeafId}:`, error);
        
        // Update retry count and status
        const retryCount = (propagation.retryCount || 0) + 1;
        await db
          .update(sectionPropagations)
          .set({
            status: retryCount >= 3 ? 'failed' : 'pending',
            retryCount,
            lastError: error.message
          })
          .where(eq(sectionPropagations.id, propagation.id));
      }
    }
  } catch (error) {
    console.error('Error processing propagation queue:', error);
  }
}

// Apply patch to a specific leaf
async function applyPatchToLeaf(leafId, patchId) {
  const patch = await db
    .select()
    .from(sectionPatches)
    .where(eq(sectionPatches.id, patchId))
    .limit(1);

  if (!patch[0]) {
    throw new Error(`Patch ${patchId} not found`);
  }

  // Create a new leaf patch from the section patch
  const leafPatch = {
    patchId: `leaf_patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    leafId,
    blocks: patch[0].patch.blocks || [],
    citations: patch[0].patch.citations || [],
    status: 'pending',
    author: patch[0].author,
    description: `Auto-propagated from section ${patch[0].sectionId}`
  };

  await db.insert(leafPatches).values(leafPatch);
  
  return leafPatch;
}

// SSE endpoint for project-wide subscriptions
router.get('/subscribe/:projectId', async (req, res) => {
  const { projectId } = req.params;
  
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Store connection
  if (!projectConnections.has(projectId)) {
    projectConnections.set(projectId, new Set());
  }
  projectConnections.get(projectId).add(res);

  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ projectId, timestamp: new Date().toISOString() })}\n\n`);

  // Setup heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    const connections = projectConnections.get(projectId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        projectConnections.delete(projectId);
      }
    }
  });
});

// POST /api/sections/link - Link a document section to canonical section
router.post('/link', async (req, res) => {
  try {
    const validated = linkSectionSchema.parse(req.body);
    
    // Check if section exists, create if not
    let section = await db
      .select()
      .from(sections)
      .where(eq(sections.sectionId, validated.sectionId))
      .limit(1);

    if (!section[0]) {
      // Create new canonical section
      section = await db.insert(sections).values({
        sectionId: validated.sectionId,
        organizationId: validated.organizationId,
        projectId: validated.projectId,
        content: '',
        version: 1,
        status: 'active',
        metadata: validated.metadata || {}
      }).returning();
    }

    // Create or update section link
    const existingLink = await db
      .select()
      .from(sectionLinks)
      .where(
        and(
          eq(sectionLinks.leafId, validated.leafId),
          eq(sectionLinks.sectionId, validated.sectionId)
        )
      )
      .limit(1);

    let link;
    if (existingLink[0]) {
      // Update existing link
      link = await db
        .update(sectionLinks)
        .set({
          blockRange: validated.blockRange,
          metadata: validated.metadata,
          isActive: true,
          updatedAt: new Date()
        })
        .where(eq(sectionLinks.id, existingLink[0].id))
        .returning();
    } else {
      // Create new link
      link = await db.insert(sectionLinks).values({
        leafId: validated.leafId,
        sectionId: validated.sectionId,
        organizationId: validated.organizationId,
        projectId: validated.projectId,
        blockRange: validated.blockRange,
        metadata: validated.metadata
      }).returning();
    }

    // Add audit trail entry
    await db.insert(auditTrail).values({
      trailId: `audit_${Date.now()}`,
      entityType: 'section_link',
      entityId: link[0].id,
      leafId: validated.leafId,
      action: existingLink[0] ? 'modified' : 'created',
      userId: req.user?.id || 'system',
      userName: req.user?.name || 'System',
      metadata: {
        sectionId: validated.sectionId,
        leafId: validated.leafId,
        blockRange: validated.blockRange
      }
    });

    res.json({
      success: true,
      link: link[0],
      section: section[0]
    });
  } catch (error) {
    console.error('Error linking section:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sections/patch - Save a change to a section
router.post('/patch', async (req, res) => {
  try {
    const validated = patchSectionSchema.parse(req.body);
    const startTime = Date.now();

    // Create section patch
    const patch = await db.insert(sectionPatches).values({
      sectionId: validated.sectionId,
      leafId: validated.leafId,
      patch: validated.patch,
      author: validated.author,
      version: validated.version,
      status: 'pending'
    }).returning();

    // Get section project info
    const sectionInfo = await db
      .select({
        projectId: sections.projectId,
        organizationId: sections.organizationId
      })
      .from(sections)
      .where(eq(sections.sectionId, validated.sectionId))
      .limit(1);

    if (!sectionInfo[0]) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Compute affected documents
    const affectedDocuments = await computeAffectedDocuments(
      validated.sectionId, 
      sectionInfo[0].organizationId
    );

    // Queue propagation events
    const propagations = await queuePropagationEvents(
      validated.sectionId,
      patch[0],
      affectedDocuments,
      validated.author
    );

    // Broadcast SSE event to project
    const sseEvent = {
      type: 'section.updated',
      sectionId: validated.sectionId,
      leafId: validated.leafId,
      affectedDocuments: affectedDocuments.map(d => d.documentId),
      patch: {
        id: patch[0].id,
        type: validated.patch.type,
        summary: validated.patch.content?.substring(0, 100)
      },
      author: validated.author,
      timestamp: new Date().toISOString(),
      propagationTime: Date.now() - startTime
    };

    broadcastToProject(sectionInfo[0].projectId, sseEvent);

    // Process propagations asynchronously
    setImmediate(() => processPropagationQueue());

    // Add audit trail
    await db.insert(auditTrail).values({
      trailId: `audit_${Date.now()}`,
      entityType: 'section_patch',
      entityId: patch[0].id,
      leafId: validated.leafId,
      action: 'patch_created',
      userId: validated.author.id,
      userName: validated.author.name,
      reason: 'Section content updated',
      metadata: {
        sectionId: validated.sectionId,
        patchType: validated.patch.type,
        affectedCount: affectedDocuments.length,
        propagationTime: Date.now() - startTime
      }
    });

    res.json({
      success: true,
      patch: patch[0],
      affectedDocuments: affectedDocuments.length,
      propagations: propagations.length,
      propagationTime: Date.now() - startTime
    });
  } catch (error) {
    console.error('Error patching section:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sections/:id/documents - Get all documents using a section
router.get('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    
    const documents = await db
      .select({
        leafId: leaves.leafId,
        ctdPath: leaves.ctdPath,
        status: leaves.status,
        version: leaves.version,
        linkMetadata: sectionLinks.metadata,
        blockRange: sectionLinks.blockRange,
        linkedAt: sectionLinks.createdAt
      })
      .from(sectionLinks)
      .leftJoin(leaves, eq(sectionLinks.leafId, leaves.leafId))
      .where(
        and(
          eq(sectionLinks.sectionId, id),
          eq(sectionLinks.isActive, true)
        )
      );

    res.json({
      sectionId: id,
      documents,
      count: documents.length
    });
  } catch (error) {
    console.error('Error fetching documents for section:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sections/graph/:projectId - Get section dependency graph
router.get('/graph/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const projectIdNum = parseInt(projectId);

    // Get all sections in project
    const projectSections = await db
      .select()
      .from(sections)
      .where(eq(sections.projectId, projectIdNum));

    // Get all links in project
    const projectLinks = await db
      .select({
        id: sectionLinks.id,
        sectionId: sectionLinks.sectionId,
        leafId: sectionLinks.leafId,
        blockRange: sectionLinks.blockRange,
        documentPath: leaves.ctdPath,
        documentStatus: leaves.status
      })
      .from(sectionLinks)
      .leftJoin(leaves, eq(sectionLinks.leafId, leaves.leafId))
      .where(eq(sectionLinks.projectId, projectIdNum));

    // Build dependency graph
    const graph = {
      nodes: [
        // Section nodes
        ...projectSections.map(s => ({
          id: `section_${s.sectionId}`,
          type: 'section',
          label: s.title || s.sectionId,
          data: {
            sectionId: s.sectionId,
            version: s.version,
            status: s.status,
            lastModified: s.updatedAt
          }
        })),
        // Document nodes
        ...Array.from(new Set(projectLinks.map(l => l.leafId))).map(leafId => {
          const link = projectLinks.find(l => l.leafId === leafId);
          return {
            id: `doc_${leafId}`,
            type: 'document',
            label: link.documentPath || leafId,
            data: {
              leafId,
              ctdPath: link.documentPath,
              status: link.documentStatus
            }
          };
        })
      ],
      edges: projectLinks.map(link => ({
        id: `edge_${link.id}`,
        source: `section_${link.sectionId}`,
        target: `doc_${link.leafId}`,
        type: 'links_to',
        data: {
          blockRange: link.blockRange
        }
      }))
    };

    // Calculate statistics
    const stats = {
      totalSections: projectSections.length,
      totalDocuments: new Set(projectLinks.map(l => l.leafId)).size,
      totalLinks: projectLinks.length,
      averageLinksPerSection: projectLinks.length / Math.max(1, projectSections.length)
    };

    res.json({
      projectId,
      graph,
      stats
    });
  } catch (error) {
    console.error('Error fetching section graph:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sections/sync-status/:projectId - Get sync status for a project
router.get('/sync-status/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const projectIdNum = parseInt(projectId);

    // Get recent propagations
    const recentPropagations = await db
      .select({
        id: sectionPropagations.id,
        sectionId: sectionPropagations.sectionId,
        targetLeafId: sectionPropagations.targetLeafId,
        status: sectionPropagations.status,
        scheduledAt: sectionPropagations.scheduledAt,
        executedAt: sectionPropagations.executedAt,
        retryCount: sectionPropagations.retryCount
      })
      .from(sectionPropagations)
      .leftJoin(sections, eq(sectionPropagations.sectionId, sections.sectionId))
      .where(eq(sections.projectId, projectIdNum))
      .orderBy(desc(sectionPropagations.scheduledAt))
      .limit(100);

    // Calculate sync statistics
    const stats = {
      total: recentPropagations.length,
      pending: recentPropagations.filter(p => p.status === 'pending').length,
      completed: recentPropagations.filter(p => p.status === 'completed').length,
      failed: recentPropagations.filter(p => p.status === 'failed').length,
      averageExecutionTime: 0
    };

    // Calculate average execution time for completed propagations
    const completedWithTime = recentPropagations.filter(p => 
      p.status === 'completed' && p.executedAt && p.scheduledAt
    );
    
    if (completedWithTime.length > 0) {
      const totalTime = completedWithTime.reduce((sum, p) => {
        return sum + (new Date(p.executedAt) - new Date(p.scheduledAt));
      }, 0);
      stats.averageExecutionTime = Math.round(totalTime / completedWithTime.length);
    }

    res.json({
      projectId,
      stats,
      recentPropagations: recentPropagations.slice(0, 10)
    });
  } catch (error) {
    console.error('Error fetching sync status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start background propagation processor (runs every second)
// TEMPORARILY DISABLED - Missing section_propagations table blocking Quality tab for Friday client deadline
// TODO: Re-enable after database schema is properly migrated
// setInterval(() => {
//   processPropagationQueue();
// }, 1000);

export default router;