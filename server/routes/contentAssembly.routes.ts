import express from 'express';
import { dynamicContentAssembly } from '../services/DynamicContentAssembly.js';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('content-assembly');

const router = express.Router();

/**
 * Assemble a document with conditional logic and completeness tracking
 */
router.post('/assemble/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { documentType, options } = req.body;
    
    if (!documentType) {
      return res.status(400).json({
        success: false,
        error: 'Document type is required'
      });
    }
    
    const assembly = await dynamicContentAssembly.assembleDocument(
      parseInt(projectId),
      documentType,
      options
    );
    
    res.json({
      success: true,
      assembly
    });
  } catch (error) {
    log.error('Error assembling document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assemble document'
    });
  }
});

/**
 * Get completeness report for a project
 */
router.get('/completeness/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const report = await dynamicContentAssembly.getCompletenessReport(
      parseInt(projectId)
    );
    
    res.json({
      success: true,
      projectId,
      report
    });
  } catch (error) {
    log.error('Error generating completeness report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate completeness report'
    });
  }
});

/**
 * Generate document preview with live data
 */
router.get('/preview/:projectId/:documentType', async (req, res) => {
  try {
    const { projectId, documentType } = req.params;
    const format = (req.query.format as 'html' | 'markdown' | 'json') || 'html';
    
    const preview = await dynamicContentAssembly.generatePreview(
      parseInt(projectId),
      documentType,
      format
    );
    
    // Set appropriate content type
    let contentType = 'text/html';
    if (format === 'markdown') contentType = 'text/markdown';
    if (format === 'json') contentType = 'application/json';
    
    res.setHeader('Content-Type', contentType);
    res.send(preview);
  } catch (error) {
    log.error('Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate preview'
    });
  }
});

/**
 * Validate document assembly
 */
router.post('/validate/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { documentType } = req.body;
    
    if (!documentType) {
      return res.status(400).json({
        success: false,
        error: 'Document type is required'
      });
    }
    
    const assembly = await dynamicContentAssembly.assembleDocument(
      parseInt(projectId),
      documentType,
      { validateOnly: true }
    );
    
    res.json({
      success: true,
      projectId,
      documentType,
      validation: {
        status: assembly.metadata.validationStatus,
        messages: assembly.metadata.validationMessages,
        completeness: assembly.overallCompleteness,
        sections: assembly.sections.map(s => ({
          id: s.id,
          title: s.title,
          completeness: s.completeness,
          missingFields: s.missingFields,
          required: s.required
        }))
      }
    });
  } catch (error) {
    log.error('Error validating document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate document'
    });
  }
});

/**
 * Get live updates via Server-Sent Events (SSE)
 */
router.get('/live-preview/:projectId/:documentType', async (req, res) => {
  const { projectId, documentType } = req.params;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial preview
  try {
    const preview = await dynamicContentAssembly.generatePreview(
      parseInt(projectId),
      documentType,
      'html'
    );
    
    res.write(`data: ${JSON.stringify({
      type: 'preview',
      content: preview,
      timestamp: new Date()
    })}\n\n`);
  } catch (error) {
    log.error('Error generating initial preview:', error);
  }
  
  // Set up interval for periodic updates
  const updateInterval = setInterval(async () => {
    try {
      const preview = await dynamicContentAssembly.generatePreview(
        parseInt(projectId),
        documentType,
        'html'
      );
      
      const report = await dynamicContentAssembly.getCompletenessReport(
        parseInt(projectId)
      );
      
      res.write(`data: ${JSON.stringify({
        type: 'update',
        content: preview,
        completeness: report,
        timestamp: new Date()
      })}\n\n`);
    } catch (error) {
      log.error('Error generating update:', error);
    }
  }, 5000); // Update every 5 seconds
  
  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(updateInterval);
  });
});

export default router;