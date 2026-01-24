/**
 * Document Routes
 *
 * Provides endpoints for managing documents including:
 * - Clinical Evaluation Reports (CER)
 * - Evidence documents
 * - Validation reports
 * - Regulatory submissions
 *
 * Version: 1.0.0
 * Last Updated: May 8, 2025
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// In-memory document storage for development
const documents = {
  cer: [],
  evidence: [],
  regulatory: [],
  validation: [],
};

// Generate a simple UUID for documents
function generateDocumentId() {
  return 'doc-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * GET /api/documents
 * List all documents with optional filtering
 */
router.get('/', (req, res) => {
  try {
    const { type, limit = 50, page = 1 } = req.query;

    let results = [];

    // Filter by document type if provided
    if (type && documents[type]) {
      results = documents[type];
    } else {
      // Combine all document types
      results = Object.values(documents).flat();
    }

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedResults = results.slice(startIndex, endIndex);

    logger.info('Retrieved documents list', {
      module: 'documents',
      count: paginatedResults.length,
      totalCount: results.length,
      type: type || 'all',
    });

    res.json({
      data: paginatedResults,
      pagination: {
        total: results.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(results.length / limit),
      },
    });
  } catch (error) {
    logger.error('Error retrieving documents', {
      module: 'documents',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve documents',
      message: error.message,
    });
  }
});

/**
 * POST /api/documents
 * Create a new document
 */
router.post('/', (req, res) => {
  try {
    const {
      title,
      type = 'cer',
      content,
      metadata = {},
      version = '1.0',
      deviceName,
      manufacturer,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Document title is required',
      });
    }

    if (!documents[type]) {
      return res.status(400).json({
        error: `Invalid document type: ${type}`,
      });
    }

    const documentId = generateDocumentId();
    const now = new Date().toISOString();

    const document = {
      id: documentId,
      title,
      type,
      content: content || {},
      metadata: {
        ...metadata,
        deviceName,
        manufacturer,
      },
      version,
      createdAt: now,
      updatedAt: now,
      sections: [],
      status: 'draft',
    };

    // Add to appropriate collection
    documents[type].push(document);

    logger.info('Created new document', {
      module: 'documents',
      documentId,
      type,
    });

    res.status(201).json({
      message: 'Document created successfully',
      document,
    });
  } catch (error) {
    logger.error('Error creating document', {
      module: 'documents',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to create document',
      message: error.message,
    });
  }
});

/**
 * GET /api/documents/:id
 * Retrieve a specific document
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Search across all document types
    let document = null;
    for (const docType of Object.keys(documents)) {
      const found = documents[docType].find(doc => doc.id === id);
      if (found) {
        document = found;
        break;
      }
    }

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    logger.info('Retrieved document', {
      module: 'documents',
      documentId: id,
      type: document.type,
    });

    res.json(document);
  } catch (error) {
    logger.error('Error retrieving document', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve document',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/documents/:id
 * Update a document
 */
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No updates provided',
      });
    }

    // Find the document
    let docType = null;
    let docIndex = -1;

    for (const type of Object.keys(documents)) {
      const index = documents[type].findIndex(doc => doc.id === id);
      if (index !== -1) {
        docType = type;
        docIndex = index;
        break;
      }
    }

    if (docType === null || docIndex === -1) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Get the existing document
    const document = documents[docType][docIndex];

    // Clean restricted fields from updates
    const { id: _, createdAt, ...allowedUpdates } = updates;

    // Create updated document
    const updatedDocument = {
      ...document,
      ...allowedUpdates,
      updatedAt: new Date().toISOString(),
    };

    // If metadata is being updated, merge it instead of replacing
    if (updates.metadata) {
      updatedDocument.metadata = {
        ...document.metadata,
        ...updates.metadata,
      };
    }

    // Update the document
    documents[docType][docIndex] = updatedDocument;

    logger.info('Updated document', {
      module: 'documents',
      documentId: id,
      type: docType,
    });

    res.json({
      message: 'Document updated successfully',
      document: updatedDocument,
    });
  } catch (error) {
    logger.error('Error updating document', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to update document',
      message: error.message,
    });
  }
});

/**
 * POST /api/documents/:id/sections
 * Add a section to a document
 */
router.post('/:id/sections', (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, order } = req.body;

    if (!title) {
      return res.status(400).json({
        error: 'Section title is required',
      });
    }

    // Find the document
    let document = null;
    let docType = null;
    let docIndex = -1;

    for (const type of Object.keys(documents)) {
      const index = documents[type].findIndex(doc => doc.id === id);
      if (index !== -1) {
        document = documents[type][index];
        docType = type;
        docIndex = index;
        break;
      }
    }

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Create a section ID
    const sectionId = `section-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`;

    // Initialize sections array if it doesn't exist
    if (!document.sections) {
      document.sections = [];
    }

    // Determine section order
    const sectionOrder = typeof order === 'number' ? order : document.sections.length;

    // Create section
    const section = {
      id: sectionId,
      title,
      content: content || '',
      order: sectionOrder,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add section to document
    document.sections.push(section);

    // Update document's updatedAt
    document.updatedAt = new Date().toISOString();

    // Sort sections by order
    document.sections.sort((a, b) => a.order - b.order);

    // Update the document in the collection
    documents[docType][docIndex] = document;

    logger.info('Added section to document', {
      module: 'documents',
      documentId: id,
      sectionId,
    });

    res.status(201).json({
      message: 'Section added successfully',
      section,
    });
  } catch (error) {
    logger.error('Error adding section to document', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to add section',
      message: error.message,
    });
  }
});

/**
 * PUT /api/documents/:id/sections/:sectionId
 * Update a section in a document
 */
router.put('/:id/sections/:sectionId', (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const { title, content, order } = req.body;

    // Find the document
    let document = null;
    let docType = null;
    let docIndex = -1;

    for (const type of Object.keys(documents)) {
      const index = documents[type].findIndex(doc => doc.id === id);
      if (index !== -1) {
        document = documents[type][index];
        docType = type;
        docIndex = index;
        break;
      }
    }

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Find the section
    if (!document.sections) {
      return res.status(404).json({
        error: 'Document has no sections',
      });
    }

    const sectionIndex = document.sections.findIndex(section => section.id === sectionId);

    if (sectionIndex === -1) {
      return res.status(404).json({
        error: 'Section not found',
      });
    }

    // Get the existing section
    const section = document.sections[sectionIndex];

    // Update section
    const updatedSection = {
      ...section,
      title: title !== undefined ? title : section.title,
      content: content !== undefined ? content : section.content,
      order: order !== undefined ? order : section.order,
      updatedAt: new Date().toISOString(),
    };

    // Update the section in the document
    document.sections[sectionIndex] = updatedSection;

    // Update document's updatedAt
    document.updatedAt = new Date().toISOString();

    // Sort sections by order
    document.sections.sort((a, b) => a.order - b.order);

    // Update the document in the collection
    documents[docType][docIndex] = document;

    logger.info('Updated section in document', {
      module: 'documents',
      documentId: id,
      sectionId,
    });

    res.json({
      message: 'Section updated successfully',
      section: updatedSection,
    });
  } catch (error) {
    logger.error('Error updating section in document', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
      sectionId: req.params.sectionId,
    });

    res.status(500).json({
      error: 'Failed to update section',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Find the document
    let docType = null;
    let docIndex = -1;

    for (const type of Object.keys(documents)) {
      const index = documents[type].findIndex(doc => doc.id === id);
      if (index !== -1) {
        docType = type;
        docIndex = index;
        break;
      }
    }

    if (docType === null || docIndex === -1) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Remove the document
    documents[docType].splice(docIndex, 1);

    logger.info('Deleted document', {
      module: 'documents',
      documentId: id,
      type: docType,
    });

    res.json({
      message: 'Document deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting document', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to delete document',
      message: error.message,
    });
  }
});

/**
 * GET /api/documents/:id/sections
 * List all sections in a document
 */
router.get('/:id/sections', (req, res) => {
  try {
    const { id } = req.params;

    // Find the document
    let document = null;

    for (const type of Object.keys(documents)) {
      const found = documents[type].find(doc => doc.id === id);
      if (found) {
        document = found;
        break;
      }
    }

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Return sections or empty array
    const sections = document.sections || [];

    logger.info('Retrieved document sections', {
      module: 'documents',
      documentId: id,
      count: sections.length,
    });

    res.json(sections);
  } catch (error) {
    logger.error('Error retrieving document sections', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve document sections',
      message: error.message,
    });
  }
});

/**
 * POST /api/documents/:id/validations
 * Create a validation record for a document
 */
router.post('/:id/validations', (req, res) => {
  try {
    const { id } = req.params;
    const {
      framework = 'mdr',
      validationResults,
      validatedBy = 'system',
      type = 'automated',
    } = req.body;

    // Find the document
    let document = null;
    let docType = null;
    let docIndex = -1;

    for (const type of Object.keys(documents)) {
      const index = documents[type].findIndex(doc => doc.id === id);
      if (index !== -1) {
        document = documents[type][index];
        docType = type;
        docIndex = index;
        break;
      }
    }

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
      });
    }

    // Initialize validations array if it doesn't exist
    if (!document.validations) {
      document.validations = [];
    }

    // Create validation record
    const validationId = `val-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const validation = {
      id: validationId,
      framework,
      results: validationResults || { summary: { status: 'incomplete' } },
      timestamp: now,
      validatedBy,
      type,
    };

    // Add validation to document
    document.validations.push(validation);

    // Update document's status based on validation
    if (validation.results?.summary?.status === 'passed') {
      document.status = 'validated';
    }

    // Update document's updatedAt
    document.updatedAt = now;

    // Update the document in the collection
    documents[docType][docIndex] = document;

    logger.info('Added validation to document', {
      module: 'documents',
      documentId: id,
      validationId,
      framework,
    });

    res.status(201).json({
      message: 'Validation added successfully',
      validation,
    });
  } catch (error) {
    logger.error('Error adding validation to document', {
      module: 'documents',
      error: error.message,
      documentId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to add validation',
      message: error.message,
    });
  }
});

export default router;
