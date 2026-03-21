import express from 'express';
import { smartFieldLinking } from '../services/SmartFieldLinking.js';
import { db } from '../db';
import { fda510kProjects } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

/**
 * Update a field value and synchronize across documents
 */
router.post('/update-field', async (req, res) => {
  try {
    const { projectId, source, field, value, userId } = req.body;
    
    if (!projectId || !source || !field || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, source, field, value'
      });
    }
    
    // Validate project exists
    if (db) {
      const projects = await db
        .select()
        .from(fda510kProjects)
        .where(eq(fda510kProjects.id, projectId))
        .limit(1);
      
      if (projects.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Project not found'
        });
      }
    }
    
    // Update field and propagate changes
    await smartFieldLinking.updateField({
      source: source as 'workflow' | 'document',
      field,
      value,
      userId: userId,
      timestamp: new Date(),
      metadata: {
        projectId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });
    
    res.json({
      success: true,
      message: 'Field updated and synchronized',
      field,
      value
    });
  } catch (error) {
    console.error('Error updating field:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update field'
    });
  }
});

/**
 * Get field links for a section
 */
router.get('/field-links/:section', (req, res) => {
  try {
    const { section } = req.params;
    const links = smartFieldLinking.getFieldLinksForSection(section);
    
    res.json({
      success: true,
      section,
      links
    });
  } catch (error) {
    console.error('Error getting field links:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get field links'
    });
  }
});

/**
 * Check field completeness for a project
 */
router.get('/completeness/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const completeness = await smartFieldLinking.checkFieldCompleteness(
      parseInt(projectId)
    );
    
    res.json({
      success: true,
      projectId,
      completeness
    });
  } catch (error) {
    console.error('Error checking completeness:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check field completeness'
    });
  }
});

/**
 * Subscribe to field updates via Server-Sent Events (SSE)
 */
router.get('/subscribe/:projectId', (req, res) => {
  const { projectId } = req.params;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);
  
  // Listen for field updates
  const handleUpdate = (update: any) => {
    if (update.metadata?.projectId === parseInt(projectId)) {
      res.write(`data: ${JSON.stringify({
        type: 'fieldUpdate',
        ...update
      })}\n\n`);
    }
  };
  
  smartFieldLinking.on('fieldUpdated', handleUpdate);
  
  // Clean up on disconnect
  req.on('close', () => {
    smartFieldLinking.off('fieldUpdated', handleUpdate);
  });
});

export default router;