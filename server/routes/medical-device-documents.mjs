// Medical Device Document Management Routes
import express from 'express';
import { validateByDocType, getValidationSummary } from '../validation/deviceValidation.mjs';
import { DOC_TYPES } from '../../shared/docTypes.js';

const router = express.Router();

// Middleware to check tenant
const checkTenant = (req, res, next) => {
  const tenantId = req.tenantId || req.tenantContext?.organizationId;
  if (!tenantId) {
    return res.status(401).json({ error: 'Tenant context required' });
  }
  req.tenantId = tenantId;
  next();
};

// Store for documents (in production, use database)
const documentStore = new Map();

// Validate document content
router.post('/validate', checkTenant, async (req, res) => {
  try {
    const { docType, content } = req.body;
    
    if (!docType || !content) {
      return res.status(400).json({
        error: 'Document type and content are required'
      });
    }

    // Get validation results
    const validationSummary = getValidationSummary(docType, content);
    
    res.json(validationSummary);
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      error: 'Failed to validate document',
      message: error.message
    });
  }
});

// Save document
router.post('/documents/save', checkTenant, async (req, res) => {
  try {
    const { documentId, documentType, content, metadata } = req.body;
    const tenantId = req.tenantId;
    
    // Generate document ID if not provided
    const docId = documentId || `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create document object
    const document = {
      id: docId,
      tenantId: tenantId,
      documentType: documentType,
      content: content,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
    
    // Check if document exists
    const key = `${tenantId}:${docId}`;
    if (documentStore.has(key)) {
      // Update existing document
      const existing = documentStore.get(key);
      document.version = existing.version + 1;
      document.createdAt = existing.createdAt;
    }
    
    // Save to store
    documentStore.set(key, document);
    
    // Log the save action (for audit trail)
    console.log(`[Audit] Document saved: ${docId} by tenant ${tenantId}`);
    
    res.json({
      success: true,
      documentId: docId,
      version: document.version,
      message: 'Document saved successfully'
    });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({
      error: 'Failed to save document',
      message: error.message
    });
  }
});

// Get document
router.get('/documents/:id', checkTenant, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const key = `${tenantId}:${id}`;
    
    if (!documentStore.has(key)) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }
    
    const document = documentStore.get(key);
    res.json(document);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      error: 'Failed to retrieve document',
      message: error.message
    });
  }
});

// Export document (PDF/DOCX)
router.post('/documents/export', checkTenant, async (req, res) => {
  try {
    const { documentId, documentType, content, format, deviceProfile } = req.body;
    const { formatDocument, generateCoverPage, validateDocumentCompleteness } = await import('../common/exportFormats.mjs');
    
    if (!format || !['pdf', 'docx'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid format. Must be pdf or docx'
      });
    }
    
    // Generate metadata for cover page
    const metadata = {
      deviceName: deviceProfile?.deviceName || 'Medical Device',
      manufacturerName: deviceProfile?.manufacturer || 'Manufacturer Name',
      k510Number: deviceProfile?.k510Number,
      pmaNumber: deviceProfile?.pmaNumber,
      deviceClass: deviceProfile?.deviceClass,
      notifiedBody: deviceProfile?.notifiedBody,
      notifiedBodyNumber: deviceProfile?.notifiedBodyNumber
    };
    
    // Generate cover page
    const coverPage = generateCoverPage(documentType, metadata);
    
    // Format the document according to regulatory requirements
    const formattedDoc = formatDocument(content, documentType, format);
    
    // Validate document completeness
    const validation = validateDocumentCompleteness(content, documentType);
    
    // Prepare the final content with cover page
    const finalContent = coverPage + '\n\n' + content;
    
    const filename = `${documentType}_${deviceProfile?.deviceName || 'document'}_${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'docx'}`;
    
    if (format === 'pdf') {
      // Simulate PDF generation with proper formatting
      // In production, use puppeteer or similar
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Include validation warnings in the export
      let pdfContent = finalContent;
      if (validation.warnings.length > 0) {
        pdfContent += '\n\n--- DOCUMENT VALIDATION WARNINGS ---\n';
        validation.warnings.forEach(warning => {
          pdfContent += `• ${warning}\n`;
        });
      }
      
      const pdfBuffer = Buffer.from(pdfContent, 'utf-8');
      res.send(pdfBuffer);
    } else if (format === 'docx') {
      // Simulate DOCX generation with proper formatting
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      // Include validation warnings
      let docxContent = finalContent;
      if (validation.warnings.length > 0) {
        docxContent += '\n\n--- DOCUMENT VALIDATION WARNINGS ---\n';
        validation.warnings.forEach(warning => {
          docxContent += `• ${warning}\n`;
        });
      }
      
      const docxBuffer = Buffer.from(docxContent, 'utf-8');
      res.send(docxBuffer);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      error: 'Failed to export document',
      message: error.message
    });
  }
});

// List documents for tenant
router.get('/documents', checkTenant, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const documents = [];
    
    // Filter documents by tenant
    for (const [key, doc] of documentStore.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        documents.push({
          id: doc.id,
          documentType: doc.documentType,
          deviceName: doc.metadata?.deviceProfile?.deviceName,
          updatedAt: doc.updatedAt,
          version: doc.version
        });
      }
    }
    
    res.json({
      documents: documents,
      total: documents.length
    });
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({
      error: 'Failed to list documents',
      message: error.message
    });
  }
});

export default router;