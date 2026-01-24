/**
 * Shared Templates API Routes
 * Provides endpoints for template management across IND Wizard and eCTD Co-Author
 */

const express = require('express');
const sharedTemplateService = require('../services/sharedTemplateService');
const eventBus = require('../services/eventBus');

const router = express.Router();

/**
 * GET /api/templates/shared
 * List all 388 templates with module flags
 */
router.get('/shared', async (req, res) => {
  try {
    const {
      organizationId = 6,
      enabledInWizard,
      enabledInCoAuthor,
      agency,
      module,
      category
    } = req.query;
    
    const options = {
      organizationId: parseInt(organizationId),
      enabledInWizard: enabledInWizard === 'true' ? true : enabledInWizard === 'false' ? false : null,
      enabledInCoAuthor: enabledInCoAuthor === 'true' ? true : enabledInCoAuthor === 'false' ? false : null,
      agency,
      module,
      category
    };
    
    const templates = await sharedTemplateService.getAllTemplates(options);
    
    res.json({
      success: true,
      data: templates,
      count: templates.length,
      metadata: {
        filters: options,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching shared templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
});

/**
 * GET /api/templates/shared/by-agency
 * Get templates grouped by agency
 */
router.get('/shared/by-agency', async (req, res) => {
  try {
    const { organizationId = 6 } = req.query;
    
    const grouped = await sharedTemplateService.getTemplatesByAgency(parseInt(organizationId));
    
    res.json({
      success: true,
      data: grouped,
      metadata: {
        totalTemplates: Object.values(grouped).reduce((sum, agency) => sum + agency.count, 0),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching templates by agency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates by agency',
      error: error.message
    });
  }
});

/**
 * GET /api/templates/shared/statistics
 * Get template statistics
 */
router.get('/shared/statistics', async (req, res) => {
  try {
    const { organizationId = 6 } = req.query;
    
    const stats = await sharedTemplateService.getTemplateStatistics(parseInt(organizationId));
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching template statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template statistics',
      error: error.message
    });
  }
});

/**
 * GET /api/templates/shared/:id
 * Get template with variables and metadata
 */
router.get('/shared/:id', async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template ID'
      });
    }
    
    const template = await sharedTemplateService.getTemplateById(templateId);
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }
    
    res.json({
      success: true,
      data: template,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template',
      error: error.message
    });
  }
});

/**
 * POST /api/templates/instantiate
 * Create document from template
 */
router.post('/instantiate', async (req, res) => {
  try {
    const {
      templateId,
      variables = {},
      options = {}
    } = req.body;
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }
    
    // Instantiate the template
    const documentInstance = await sharedTemplateService.instantiateTemplate(
      templateId,
      variables,
      options
    );
    
    // Emit event for other modules
    eventBus.emitEvent(eventBus.events.TEMPLATE_INSTANTIATED, {
      templateId,
      documentId: documentInstance.id,
      templateName: documentInstance.templateName,
      moduleNumber: documentInstance.moduleNumber
    });
    
    res.json({
      success: true,
      data: documentInstance,
      message: 'Template instantiated successfully',
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error instantiating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to instantiate template',
      error: error.message
    });
  }
});

/**
 * POST /api/templates/lock
 * Content lock with hash
 */
router.post('/lock', async (req, res) => {
  try {
    const { documentId, content } = req.body;
    
    if (!documentId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Document ID and content are required'
      });
    }
    
    // Create content lock
    const lock = await sharedTemplateService.createContentLock(documentId, content);
    
    // Emit event for other modules
    eventBus.emitEvent(eventBus.events.COAUTHOR_DOCUMENT_LOCKED, {
      documentId,
      contentHash: lock.contentHash,
      lockedAt: lock.lockedAt
    });
    
    res.json({
      success: true,
      data: lock,
      message: 'Content locked successfully',
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error locking content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lock content',
      error: error.message
    });
  }
});

/**
 * POST /api/templates/verify-lock
 * Verify content against lock
 */
router.post('/verify-lock', async (req, res) => {
  try {
    const { documentId, content } = req.body;
    
    if (!documentId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Document ID and content are required'
      });
    }
    
    // Verify content lock
    const verification = await sharedTemplateService.verifyContentLock(documentId, content);
    
    res.json({
      success: true,
      data: verification,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error verifying lock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify lock',
      error: error.message
    });
  }
});

/**
 * GET /api/templates/variables/:scope
 * Get variables by scope
 */
router.get('/variables/:scope', async (req, res) => {
  try {
    const { scope } = req.params;
    const { contextId } = req.query;
    
    const validScopes = ['global', 'region', 'module', 'document', 'all'];
    
    if (!validScopes.includes(scope)) {
      return res.status(400).json({
        success: false,
        message: `Invalid scope. Must be one of: ${validScopes.join(', ')}`
      });
    }
    
    const variables = await sharedTemplateService.getVariablesByScope(scope, contextId);
    
    res.json({
      success: true,
      data: variables,
      metadata: {
        scope,
        contextId,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch variables',
      error: error.message
    });
  }
});

/**
 * POST /api/templates/apply-variables
 * Apply variables to template content
 */
router.post('/apply-variables', async (req, res) => {
  try {
    const { content, variables } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }
    
    const processedContent = await sharedTemplateService.applyVariables(content, variables || {});
    
    res.json({
      success: true,
      data: {
        original: content,
        processed: processedContent,
        variablesApplied: Object.keys(variables || {}).length
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error applying variables:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply variables',
      error: error.message
    });
  }
});

/**
 * POST /api/templates/batch-instantiate
 * Instantiate multiple templates at once
 */
router.post('/batch-instantiate', async (req, res) => {
  try {
    const { templateIds, variables = {}, options = {} } = req.body;
    
    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Template IDs array is required'
      });
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    // Process templates in parallel (with limit)
    const batchSize = 5;
    for (let i = 0; i < templateIds.length; i += batchSize) {
      const batch = templateIds.slice(i, i + batchSize);
      
      const promises = batch.map(async (templateId) => {
        try {
          const documentInstance = await sharedTemplateService.instantiateTemplate(
            templateId,
            variables,
            options
          );
          results.successful.push(documentInstance);
        } catch (error) {
          results.failed.push({
            templateId,
            error: error.message
          });
        }
      });
      
      await Promise.all(promises);
    }
    
    // Emit event if any documents were created
    if (results.successful.length > 0) {
      eventBus.emitEvent(eventBus.events.WIZARD_DOCS_INSTANTIATED, {
        documents: results.successful,
        variables
      });
    }
    
    res.json({
      success: true,
      data: results,
      message: `Instantiated ${results.successful.length} templates successfully`,
      metadata: {
        total: templateIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error batch instantiating templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to batch instantiate templates',
      error: error.message
    });
  }
});

/**
 * GET /api/templates/event-history
 * Get event history for debugging
 */
router.get('/event-history', async (req, res) => {
  try {
    const { eventName, limit = 100 } = req.query;
    
    const history = eventBus.getEventHistory(eventName, parseInt(limit));
    const stats = eventBus.getStatistics();
    
    res.json({
      success: true,
      data: {
        history,
        statistics: stats
      },
      metadata: {
        eventName,
        limit: parseInt(limit),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching event history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event history',
      error: error.message
    });
  }
});

module.exports = router;