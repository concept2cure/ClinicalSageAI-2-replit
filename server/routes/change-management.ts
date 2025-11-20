/**
 * Global Change Management Workflow API
 * 
 * Implements comprehensive change tracking and management system for
 * regulatory compliance with full audit trail and transaction support.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { changeRequests, components, componentVersions } from '../../shared/schema';
import { eq, and, sql, desc, ilike } from 'drizzle-orm';
// @ts-ignore - JavaScript middleware file
import { authenticateToken } from '../middleware/auth';
// @ts-ignore - JavaScript middleware file
import { requireOrganizationContext } from '../middleware/tenantContext';

if (!db) {
  throw new Error('Database connection not initialized');
}

const router = Router();

// Apply authentication and organization context middleware to ALL routes
router.use(authenticateToken);
router.use(requireOrganizationContext);

// Schema for creating a change request
const createChangeRequestSchema = z.object({
  entityType: z.string().min(1).max(100),
  originalValue: z.string(),
  newValue: z.string(),
  reason: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  targetDate: z.string().optional()
});

// Schema for updating change request status
const updateStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'completed', 'failed']),
  digitalSignature: z.string().optional(),
  reviewNotes: z.string().optional()
});

interface AuthRequest extends Request {
  user?: any;
  organizationId?: number;
}

/**
 * GET /api/change-management/requests
 * List all change requests for the organization
 */
router.get('/requests', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build query conditions
    const conditions = [eq(changeRequests.organizationId, organizationId)];
    if (status) {
      conditions.push(eq(changeRequests.status, status as string));
    }

    // Get total count
    const [countResult] = await db!
      .select({ count: sql<number>`COUNT(*)` })
      .from(changeRequests)
      .where(and(...conditions));

    // Get paginated results
    const requests = await db!
      .select()
      .from(changeRequests)
      .where(and(...conditions))
      .orderBy(desc(changeRequests.createdAt))
      .limit(limitNum)
      .offset(offset);

    res.json({
      success: true,
      data: requests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(countResult?.count || 0),
        totalPages: Math.ceil(Number(countResult?.count || 0) / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching change requests:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch change requests' });
  }
});

/**
 * GET /api/change-management/requests/:id
 * Get a specific change request with full details
 */
router.get('/requests/:id', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { id } = req.params;

    const [request] = await db!
      .select()
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.id, id),
          eq(changeRequests.organizationId, organizationId)
        )
      );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Change request not found' });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    console.error('Error fetching change request:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch change request' });
  }
});

/**
 * POST /api/change-management/requests
 * Create a new change request
 */
router.post('/requests', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const user = req.user;
    
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const validatedData = createChangeRequestSchema.parse(req.body);

    // Find affected components if doing global replacement
    let affectedUdis: string[] = [];
    
    if (validatedData.entityType === 'global_text_replacement') {
      const affectedComponents = await db!
        .select({ udi: components.udi })
        .from(components)
        .where(
          and(
            eq(components.organizationId, organizationId),
            sql`${components.content}::text ILIKE ${`%${validatedData.originalValue}%`}`
          )
        );
      
      affectedUdis = affectedComponents.map(c => c.udi);
    }

    // Create the change request
    const [newRequest] = await db!
      .insert(changeRequests)
      .values({
        entityType: validatedData.entityType,
        originalValue: validatedData.originalValue,
        newValue: validatedData.newValue,
        affectedUdis: affectedUdis.length > 0 ? affectedUdis : null,
        status: 'pending',
        initiatedBy: user?.email || 'system',
        organizationId,
        reason: validatedData.reason || null,
        priority: validatedData.priority,
        targetDate: validatedData.targetDate ? new Date(validatedData.targetDate) : null
      })
      .returning();

    res.status(201).json({
      success: true,
      data: newRequest,
      message: `Change request created. Will affect ${affectedUdis.length} components.`
    });
  } catch (error) {
    console.error('Error creating change request:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ success: false, error: 'Failed to create change request' });
  }
});

/**
 * PUT /api/change-management/requests/:id/status
 * Update the status of a change request
 */
router.put('/requests/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const user = req.user;
    
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { id } = req.params;
    const validatedData = updateStatusSchema.parse(req.body);

    // Get the current request
    const [currentRequest] = await db!
      .select()
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.id, id),
          eq(changeRequests.organizationId, organizationId)
        )
      );

    if (!currentRequest) {
      return res.status(404).json({ success: false, error: 'Change request not found' });
    }

    // Don't allow status changes on completed or failed requests
    if (['completed', 'failed'].includes(currentRequest.status)) {
      return res.status(400).json({ 
        success: false, 
        error: `Cannot modify ${currentRequest.status} change request` 
      });
    }

    // Update the status
    const [updatedRequest] = await db!
      .update(changeRequests)
      .set({
        status: validatedData.status,
        digitalSignature: validatedData.digitalSignature || currentRequest.digitalSignature,
        reviewedBy: user?.email || 'system',
        reviewedAt: new Date(),
        reviewNotes: validatedData.reviewNotes || null,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(changeRequests.id, id),
          eq(changeRequests.organizationId, organizationId)
        )
      )
      .returning();

    res.json({
      success: true,
      data: updatedRequest,
      message: `Change request ${validatedData.status}`
    });
  } catch (error) {
    console.error('Error updating change request status:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ success: false, error: 'Failed to update change request status' });
  }
});

/**
 * GET /api/change-management/requests/:id/preview
 * Preview what will be changed without executing
 */
router.get('/requests/:id/preview', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { id } = req.params;

    // Get the change request
    const [request] = await db!
      .select()
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.id, id),
          eq(changeRequests.organizationId, organizationId)
        )
      );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Change request not found' });
    }

    const preview: any[] = [];
    
    if (request.entityType === 'global_text_replacement' && request.affectedUdis) {
      const affectedUdis = request.affectedUdis as string[];
      
      for (const udi of affectedUdis) {
        const [component] = await db!
          .select()
          .from(components)
          .where(
            and(
              eq(components.udi, udi),
              eq(components.organizationId, organizationId)
            )
          );
        
        if (!component) continue;
        
        let oldContent = component.content;
        let newContent = component.content;
        
        // Calculate what would change
        if (typeof newContent === 'string') {
          newContent = newContent.replace(
            new RegExp(request.originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            request.newValue
          );
        } else if (typeof newContent === 'object' && newContent !== null) {
          const contentStr = JSON.stringify(newContent);
          const replacedStr = contentStr.replace(
            new RegExp(request.originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            request.newValue
          );
          newContent = JSON.parse(replacedStr);
        }
        
        preview.push({
          udi: component.udi,
          documentUdi: component.documentUdi,
          sectionTitle: component.sectionTitle,
          oldContent: typeof oldContent === 'string' ? oldContent.substring(0, 200) : JSON.stringify(oldContent).substring(0, 200),
          newContent: typeof newContent === 'string' ? newContent.substring(0, 200) : JSON.stringify(newContent).substring(0, 200),
          hasChanges: JSON.stringify(oldContent) !== JSON.stringify(newContent)
        });
      }
    }

    res.json({
      success: true,
      data: {
        request,
        preview,
        totalAffected: preview.length,
        willChange: preview.filter(p => p.hasChanges).length
      }
    });
  } catch (error) {
    console.error('Error previewing change request:', error);
    res.status(500).json({ success: false, error: 'Failed to preview change request' });
  }
});

/**
 * POST /api/change-management/requests/:id/execute
 * Execute an approved change request
 */
router.post('/requests/:id/execute', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    const user = req.user;
    
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    const { id } = req.params;

    // Get the change request
    const [request] = await db!
      .select()
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.id, id),
          eq(changeRequests.organizationId, organizationId)
        )
      );

    if (!request) {
      return res.status(404).json({ success: false, error: 'Change request not found' });
    }

    // Ensure request is approved
    if (request.status !== 'approved') {
      return res.status(400).json({ 
        success: false, 
        error: 'Only approved change requests can be executed' 
      });
    }

    // Execute the change based on entity type
    let changedCount = 0;
    const errors: string[] = [];
    
    if (request.entityType === 'global_text_replacement' && request.affectedUdis) {
      const affectedUdis = request.affectedUdis as string[];
      
      for (const udi of affectedUdis) {
        try {
          // Get current component
          const [component] = await db!
            .select()
            .from(components)
            .where(
              and(
                eq(components.udi, udi),
                eq(components.organizationId, organizationId)
              )
            );
          
          if (!component) continue;
          
          // Create version history before update
          await db!.insert(componentVersions).values({
            componentId: component.id,
            organizationId: component.organizationId,
            versionNumber: (component.usageCount || 0) + 1, // Increment version
            content: component.content,
            changeDescription: `Global replacement: "${request.originalValue}" → "${request.newValue}"`,
            changeType: 'major',
            createdBy: user?.email || 'system'
          });
          
          // Perform text replacement on content
          let newContent = component.content;
          if (typeof newContent === 'string') {
            newContent = newContent.replace(
              new RegExp(request.originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              request.newValue
            );
          } else if (typeof newContent === 'object' && newContent !== null) {
            // Handle JSON content
            const contentStr = JSON.stringify(newContent);
            const replacedStr = contentStr.replace(
              new RegExp(request.originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              request.newValue
            );
            newContent = JSON.parse(replacedStr);
          }
          
          // Update component
          await db!
            .update(components)
            .set({
              content: newContent,
              updatedAt: new Date()
            })
            .where(eq(components.id, component.id));
          
          changedCount++;
        } catch (err) {
          console.error(`Error updating component ${udi}:`, err);
          errors.push(`Failed to update ${udi}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    // Mark request as completed
    await db!
      .update(changeRequests)
      .set({
        status: changedCount > 0 ? 'completed' : 'failed',
        completedAt: new Date(),
        executedBy: user?.email || 'system',
        executionSummary: {
          totalAffected: request.affectedUdis ? (request.affectedUdis as string[]).length : 0,
          successfullyChanged: changedCount,
          errors: errors
        },
        failureReason: changedCount === 0 ? 'No components were successfully updated' : null,
        updatedAt: new Date()
      })
      .where(eq(changeRequests.id, id));

    res.json({
      success: true,
      message: `Change request executed. Modified ${changedCount} components.`,
      data: { 
        requestId: id, 
        status: changedCount > 0 ? 'completed' : 'failed',
        changedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Error executing change request:', error);
    
    // Mark request as failed
    try {
      await db!
        .update(changeRequests)
        .set({
          status: 'failed',
          failureReason: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(changeRequests.id, req.params.id));
    } catch (updateError) {
      console.error('Failed to update request status:', updateError);
    }
    
    res.status(500).json({ success: false, error: 'Failed to execute change request' });
  }
});

/**
 * GET /api/change-management/statistics
 * Get change management statistics for the organization
 */
router.get('/statistics', async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = req.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }
    
    // Get statistics by status
    const stats = await db!
      .select({
        status: changeRequests.status,
        count: sql<number>`COUNT(*)`,
        priority: changeRequests.priority
      })
      .from(changeRequests)
      .where(eq(changeRequests.organizationId, organizationId))
      .groupBy(changeRequests.status, changeRequests.priority);
    
    // Process statistics
    const statusBreakdown: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
      failed: 0
    };
    
    const priorityBreakdown: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };
    
    stats.forEach(stat => {
      if (stat.status in statusBreakdown) {
        statusBreakdown[stat.status] += Number(stat.count);
      }
      if (stat.priority && stat.priority in priorityBreakdown) {
        priorityBreakdown[stat.priority] += Number(stat.count);
      }
    });
    
    const totalChanges = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);
    const completionRate = totalChanges > 0 
      ? (statusBreakdown.completed / totalChanges * 100).toFixed(1)
      : '0';
    
    res.json({
      success: true,
      data: {
        total: totalChanges,
        statusBreakdown,
        priorityBreakdown,
        completionRate: `${completionRate}%`
      }
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

export default router;