import express from 'express';
import templateUsageService from '../services/templateUsageService.js';
import { db } from '../db';
import { indApplications, indDocuments } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

/**
 * Get all templates available for an IND application
 * GET /api/ind/:id/templates
 */
router.get('/ind/:id/templates', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    const organizationId = req.query.organizationId ? parseInt(req.query.organizationId) : 6;
    
    const templates = await templateUsageService.getTemplatesForIND(indId, organizationId);
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates',
      error: error.message
    });
  }
});

/**
 * Generate a document from a template
 * POST /api/ind/:id/generate-document
 */
router.post('/ind/:id/generate-document', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    const { templateId, userData, organizationId = 6 } = req.body;
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }
    
    // Generate the document
    const document = await templateUsageService.generateDocument(
      templateId,
      indId,
      organizationId,
      userData
    );
    
    res.json({
      success: true,
      data: document,
      message: 'Document generated successfully'
    });
  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate document',
      error: error.message
    });
  }
});

/**
 * Generate multiple documents from templates
 * POST /api/ind/:id/generate-documents-batch
 */
router.post('/ind/:id/generate-documents-batch', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    const { templateIds, userData, organizationId = 6 } = req.body;
    
    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Template IDs array is required'
      });
    }
    
    // Generate documents for all templates
    const documents = [];
    const errors = [];
    
    for (const templateId of templateIds) {
      try {
        const document = await templateUsageService.generateDocument(
          templateId,
          indId,
          organizationId,
          userData
        );
        documents.push(document);
      } catch (error) {
        errors.push({
          templateId,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        generated: documents,
        failed: errors
      },
      message: `Generated ${documents.length} documents successfully`
    });
  } catch (error) {
    console.error('Error generating documents batch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate documents',
      error: error.message
    });
  }
});

/**
 * Get all generated documents for an IND
 * GET /api/ind/:id/documents
 */
router.get('/ind/:id/documents', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    
    const documents = await templateUsageService.getDocumentsForIND(indId);
    
    res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch documents',
      error: error.message
    });
  }
});

/**
 * Get a specific document
 * GET /api/ind/:id/documents/:docId
 */
router.get('/ind/:id/documents/:docId', async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    
    const document = await db
      .select()
      .from(indDocuments)
      .where(eq(indDocuments.id, docId))
      .limit(1);
    
    if (!document || document.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }
    
    res.json({
      success: true,
      data: document[0]
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch document',
      error: error.message
    });
  }
});

/**
 * Update a document's content
 * PUT /api/ind/:id/documents/:docId
 */
router.put('/ind/:id/documents/:docId', async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Document content is required'
      });
    }
    
    const updated = await templateUsageService.updateDocument(docId, content);
    
    res.json({
      success: true,
      data: updated,
      message: 'Document updated successfully'
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document',
      error: error.message
    });
  }
});

/**
 * Approve a generated document
 * POST /api/ind/:id/documents/:docId/approve
 */
router.post('/ind/:id/documents/:docId/approve', async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    const { approverId = 1 } = req.body; // Default approver ID
    
    const approved = await templateUsageService.approveDocument(docId, approverId);
    
    res.json({
      success: true,
      data: approved,
      message: 'Document approved successfully'
    });
  } catch (error) {
    console.error('Error approving document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve document',
      error: error.message
    });
  }
});

/**
 * Delete a document
 * DELETE /api/ind/:id/documents/:docId
 */
router.delete('/ind/:id/documents/:docId', async (req, res) => {
  try {
    const docId = parseInt(req.params.docId);
    
    await db
      .delete(indDocuments)
      .where(eq(indDocuments.id, docId));
    
    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document',
      error: error.message
    });
  }
});

/**
 * Generate AI-enhanced content for a template
 * POST /api/ind/:id/enhance-template
 */
router.post('/ind/:id/enhance-template', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    const { templateId, indData, additionalData } = req.body;
    
    if (!templateId) {
      return res.status(400).json({
        success: false,
        message: 'Template ID is required'
      });
    }
    
    // Get IND data if not provided
    let fullIndData = indData;
    if (!fullIndData) {
      const indApp = await db
        .select()
        .from(indApplications)
        .where(eq(indApplications.id, indId))
        .limit(1);
      
      if (indApp && indApp.length > 0) {
        fullIndData = indApp[0];
      }
    }
    
    // Instantiate and enhance the template
    const enhanced = await templateUsageService.instantiateTemplate(
      templateId,
      fullIndData || {},
      additionalData || {}
    );
    
    res.json({
      success: true,
      data: enhanced,
      message: 'Template enhanced successfully'
    });
  } catch (error) {
    console.error('Error enhancing template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enhance template',
      error: error.message
    });
  }
});

/**
 * Get template usage statistics for an IND
 * GET /api/ind/:id/template-stats
 */
router.get('/ind/:id/template-stats', async (req, res) => {
  try {
    const indId = parseInt(req.params.id);
    
    // Get all documents for the IND
    const documents = await templateUsageService.getDocumentsForIND(indId);
    
    // Calculate statistics
    const stats = {
      totalDocuments: documents.length,
      byStatus: {
        draft: documents.filter(d => d.status === 'draft').length,
        approved: documents.filter(d => d.status === 'approved').length,
        pending: documents.filter(d => d.status === 'pending').length
      },
      byModule: {},
      byCategory: {},
      recentDocuments: documents.slice(0, 5)
    };
    
    // Group by module and category
    documents.forEach(doc => {
      const module = doc.moduleNumber || 'Unknown';
      const category = doc.documentType || 'Unknown';
      
      stats.byModule[module] = (stats.byModule[module] || 0) + 1;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching template stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch template statistics',
      error: error.message
    });
  }
});

export default router;