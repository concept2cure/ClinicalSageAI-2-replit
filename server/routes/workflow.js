import express from 'express';

const router = express.Router();

/**
 * POST /api/workflow/export - Export workflow configuration and data
 */
router.post('/export', async (req, res) => {
  try {
    const { workflowId, format, includeHistory } = req.body;
    
    // Mock workflow data for export
    const workflowData = {
      id: workflowId || 'workflow-default',
      name: 'eCTD Document Workflow',
      version: '1.0.0',
      stages: [
        {
          id: 'draft',
          name: 'Draft',
          description: 'Initial document creation',
          nextStages: ['review']
        },
        {
          id: 'review',
          name: 'Review',
          description: 'Regulatory and technical review',
          nextStages: ['approval', 'draft']
        },
        {
          id: 'approval',
          name: 'Approval',
          description: 'Final regulatory approval',
          nextStages: ['published', 'review']
        },
        {
          id: 'published',
          name: 'Published',
          description: 'Document finalized and published',
          nextStages: []
        }
      ],
      transitions: [
        {
          from: 'draft',
          to: 'review',
          action: 'submit_for_review',
          permissions: ['author', 'editor']
        },
        {
          from: 'review',
          to: 'approval',
          action: 'approve',
          permissions: ['reviewer', 'manager']
        },
        {
          from: 'review',
          to: 'draft',
          action: 'reject',
          permissions: ['reviewer', 'manager']
        },
        {
          from: 'approval',
          to: 'published',
          action: 'publish',
          permissions: ['manager', 'admin']
        }
      ],
      currentStage: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Add history if requested
    if (includeHistory) {
      workflowData.history = [
        {
          id: 'hist-1',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          fromStage: null,
          toStage: 'draft',
          action: 'created',
          user: 'system',
          comments: 'Workflow initialized'
        },
        {
          id: 'hist-2',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          fromStage: 'draft',
          toStage: 'review',
          action: 'submit_for_review',
          user: 'author@example.com',
          comments: 'Document ready for review'
        }
      ];
    }
    
    // Handle different export formats
    let exportData;
    let contentType = 'application/json';
    let filename = `workflow_${workflowData.id}_${Date.now()}`;
    
    switch (format) {
      case 'xml':
        // Convert to XML format
        exportData = `<?xml version="1.0" encoding="UTF-8"?>
<workflow>
  <id>${workflowData.id}</id>
  <name>${workflowData.name}</name>
  <version>${workflowData.version}</version>
  <stages>
    ${workflowData.stages.map(stage => `
    <stage>
      <id>${stage.id}</id>
      <name>${stage.name}</name>
      <description>${stage.description}</description>
    </stage>`).join('')}
  </stages>
</workflow>`;
        contentType = 'application/xml';
        filename += '.xml';
        break;
        
      case 'csv':
        // Convert to CSV format
        exportData = 'Stage ID,Stage Name,Description\n';
        exportData += workflowData.stages
          .map(stage => `"${stage.id}","${stage.name}","${stage.description}"`)
          .join('\n');
        contentType = 'text/csv';
        filename += '.csv';
        break;
        
      default:
        // Default to JSON
        exportData = JSON.stringify(workflowData, null, 2);
        filename += '.json';
    }
    
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    
    res.send(exportData);
    
  } catch (error) {
    console.error('Error exporting workflow:', error);
    res.status(500).json({ 
      error: 'Failed to export workflow',
      details: error.message 
    });
  }
});

/**
 * GET /api/workflow/status - Get workflow status
 */
router.get('/status', async (req, res) => {
  try {
    const { workflowId } = req.query;
    
    res.json({
      success: true,
      status: {
        id: workflowId || 'workflow-default',
        currentStage: 'draft',
        pendingTasks: 3,
        completedTasks: 7,
        totalTasks: 10,
        progress: 70,
        lastActivity: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting workflow status:', error);
    res.status(500).json({ 
      error: 'Failed to get workflow status',
      details: error.message 
    });
  }
});

/**
 * POST /api/workflow/transition - Transition workflow to next stage
 */
router.post('/transition', async (req, res) => {
  try {
    const { workflowId, fromStage, toStage, action, comments } = req.body;
    
    if (!fromStage || !toStage || !action) {
      return res.status(400).json({ 
        error: 'Missing required fields: fromStage, toStage, action' 
      });
    }
    
    // Mock validation - in production, check if transition is allowed
    const validTransitions = {
      'draft': ['review'],
      'review': ['approval', 'draft'],
      'approval': ['published', 'review'],
      'published': []
    };
    
    if (!validTransitions[fromStage]?.includes(toStage)) {
      return res.status(400).json({ 
        error: 'Invalid transition',
        message: `Cannot transition from ${fromStage} to ${toStage}`
      });
    }
    
    res.json({
      success: true,
      message: 'Workflow transitioned successfully',
      transition: {
        id: `trans-${Date.now()}`,
        workflowId: workflowId || 'workflow-default',
        fromStage,
        toStage,
        action,
        comments,
        timestamp: new Date().toISOString(),
        user: 'current-user@example.com'
      }
    });
  } catch (error) {
    console.error('Error transitioning workflow:', error);
    res.status(500).json({ 
      error: 'Failed to transition workflow',
      details: error.message 
    });
  }
});

export default router;