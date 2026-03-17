/**
 * CMC Blueprint Generator API
 *
 * This module provides endpoints for generating ICH-compliant Module 3
 * documentation based on molecular structures and process data inputs.
 */

import express from 'express';
import { checkForOpenAIKey } from '../../utils/api-security.js';
import { validateRequestBody } from '../../utils/validation.js';
import { generateDocumentation, renderProcessDiagram } from '../../utils/document-generator.js';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getOpenAIClient } from '../../services/openai-client';

// Rate limiter for document generation (more permissive)
const docGenerationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many document generation requests, please try again after a minute',
});

// Rate limiter for image generation (more restrictive due to higher cost)
const imageGenerationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 2, // 2 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many image generation requests, please try again after a minute',
});

// Create router
const router = express.Router();

// Get OpenAI client
const openai = getOpenAIClient();

// Get current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure directories exist
const outputDir = path.join(process.cwd(), 'output');
const uploadsDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Generate Module 3 document based on molecular structure and process data
 * POST /api/cmc/blueprint-generator/generate
 */
router.post('/generate', checkForOpenAIKey, docGenerationLimiter, async (req, res) => {
  try {
    const {
      moleculeData,
      processData,
      documentType,
      outputFormat = 'docx',
      includeReferences = true,
      complianceRegion = 'ich',
    } = req.body;

    // Basic validation of required fields
    if (!moleculeData || !documentType) {
      return res.status(400).json({ error: 'Molecule data and document type are required' });
    }

    // Generate a unique document ID
    const documentId = uuidv4();

    // Call the document generation utility
    const result = await generateDocumentation(
      moleculeData,
      processData,
      documentType,
      outputFormat,
      documentId,
      includeReferences,
      complianceRegion
    );

    return res.status(200).json({
      success: true,
      documentId,
      documentType,
      documentName: result.documentName,
      downloadUrl: `/api/cmc/blueprint-generator/download/${documentId}`,
      documentDetails: result.documentDetails,
    });
  } catch (error) {
    console.error('Error in document generation:', error);
    return res.status(500).json({
      error: 'An error occurred while generating the document',
      details: error.message,
    });
  }
});

/**
 * Generate a process flow diagram or chemical structure illustration
 * POST /api/cmc/blueprint-generator/diagram
 */
router.post('/diagram', checkForOpenAIKey, imageGenerationLimiter, async (req, res) => {
  try {
    const {
      processData,
      diagramType, // 'process-flow', 'reaction-scheme', 'equipment-layout'
      format = 'svg',
      moleculeData,
    } = req.body;

    // Basic validation
    if (!diagramType) {
      return res.status(400).json({ error: 'Diagram type is required' });
    }

    if (diagramType === 'reaction-scheme' && !moleculeData) {
      return res.status(400).json({ error: 'Molecule data is required for reaction schemes' });
    }

    if ((diagramType === 'process-flow' || diagramType === 'equipment-layout') && !processData) {
      return res
        .status(400)
        .json({ error: 'Process data is required for process flow and equipment diagrams' });
    }

    // Generate a unique diagram ID
    const diagramId = uuidv4();

    // Call the diagram generation utility
    const result = await renderProcessDiagram(
      diagramType,
      processData,
      moleculeData,
      format,
      diagramId
    );

    return res.status(200).json({
      success: true,
      diagramId,
      diagramType,
      downloadUrl: `/api/cmc/blueprint-generator/download/diagram/${diagramId}`,
      diagramDetails: result.diagramDetails,
    });
  } catch (error) {
    console.error('Error in diagram generation:', error);
    return res.status(500).json({
      error: 'An error occurred while generating the diagram',
      details: error.message,
    });
  }
});

/**
 * Download generated document
 * GET /api/cmc/blueprint-generator/download/:documentId
 */
router.get('/download/:documentId', (req, res) => {
  try {
    const { documentId } = req.params;
    const format = req.query.format || 'docx';

    // Sanitize the document ID to prevent directory traversal
    const sanitizedId = documentId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `${sanitizedId}.${format}`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Determine the content type
    let contentType;
    switch (format) {
      case 'pdf':
        contentType = 'application/pdf';
        break;
      case 'docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'html':
        contentType = 'text/html';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="module3_${sanitizedId}.${format}"`);

    // Return the file
    return res.sendFile(filePath);
  } catch (error) {
    console.error('Error in document download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the document',
      details: error.message,
    });
  }
});

/**
 * Download generated diagram
 * GET /api/cmc/blueprint-generator/download/diagram/:diagramId
 */
router.get('/download/diagram/:diagramId', (req, res) => {
  try {
    const { diagramId } = req.params;
    const format = req.query.format || 'svg';

    // Sanitize the diagram ID to prevent directory traversal
    const sanitizedId = diagramId.replace(/[^a-zA-Z0-9-]/g, '');

    // Build the file path
    const filePath = path.join(outputDir, `diagram_${sanitizedId}.${format}`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Diagram not found' });
    }

    // Determine the content type
    let contentType;
    switch (format) {
      case 'svg':
        contentType = 'image/svg+xml';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="diagram_${sanitizedId}.${format}"`);

    // Return the file
    return res.sendFile(filePath);
  } catch (error) {
    console.error('Error in diagram download:', error);
    return res.status(500).json({
      error: 'An error occurred while downloading the diagram',
      details: error.message,
    });
  }
});

/**
 * Get a list of available document templates
 * GET /api/cmc/blueprint-generator/templates
 */
router.get('/templates', (req, res) => {
  // Return a list of available document templates with metadata
  const templates = [
    {
      id: 's.1',
      name: 'General Information',
      description: 'General information about the drug substance',
      subSections: [
        {
          id: 's.1.1',
          name: 'Nomenclature',
          description: 'Information on the nomenclature of the drug substance',
        },
        {
          id: 's.1.2',
          name: 'Structure',
          description: 'Structural formula, molecular formula, and molecular weight',
        },
        {
          id: 's.1.3',
          name: 'General Properties',
          description: 'Physicochemical and other relevant properties',
        },
      ],
    },
    {
      id: 's.2',
      name: 'Manufacture',
      description: 'Information on the manufacture of the drug substance',
      subSections: [
        {
          id: 's.2.1',
          name: 'Manufacturer(s)',
          description: 'Name and address of manufacturer(s)',
        },
        {
          id: 's.2.2',
          name: 'Description of Manufacturing Process',
          description: 'Description of the manufacturing process and controls',
        },
        {
          id: 's.2.3',
          name: 'Control of Materials',
          description: 'Control of materials used in the manufacture',
        },
        {
          id: 's.2.4',
          name: 'Controls of Critical Steps and Intermediates',
          description: 'Controls of critical steps and intermediates',
        },
        {
          id: 's.2.5',
          name: 'Process Validation and/or Evaluation',
          description: 'Process validation and/or evaluation',
        },
        {
          id: 's.2.6',
          name: 'Manufacturing Process Development',
          description: 'Manufacturing process development',
        },
      ],
    },
    {
      id: 's.3',
      name: 'Characterization',
      description: 'Characterization of the drug substance',
      subSections: [
        {
          id: 's.3.1',
          name: 'Elucidation of Structure and Other Characteristics',
          description: 'Elucidation of structure and other characteristics',
        },
        { id: 's.3.2', name: 'Impurities', description: 'Impurities' },
      ],
    },
    {
      id: 's.4',
      name: 'Control of Drug Substance',
      description: 'Control of the drug substance',
      subSections: [
        { id: 's.4.1', name: 'Specification', description: 'Specification for the drug substance' },
        {
          id: 's.4.2',
          name: 'Analytical Procedures',
          description: 'Analytical procedures used for testing the drug substance',
        },
        {
          id: 's.4.3',
          name: 'Validation of Analytical Procedures',
          description: 'Validation of analytical procedures',
        },
        {
          id: 's.4.4',
          name: 'Batch Analyses',
          description: 'Batch analyses of the drug substance',
        },
        {
          id: 's.4.5',
          name: 'Justification of Specification',
          description: 'Justification of the drug substance specification',
        },
      ],
    },
    {
      id: 's.5',
      name: 'Reference Standards or Materials',
      description: 'Reference standards or materials for the drug substance',
    },
    {
      id: 's.6',
      name: 'Container Closure System',
      description: 'Container closure system for the drug substance',
    },
    {
      id: 's.7',
      name: 'Stability',
      description: 'Stability of the drug substance',
    },
    {
      id: 'p.1',
      name: 'Description and Composition of the Drug Product',
      description: 'Description and composition of the drug product',
    },
    {
      id: 'p.2',
      name: 'Pharmaceutical Development',
      description: 'Pharmaceutical development of the drug product',
    },
    {
      id: 'p.3',
      name: 'Manufacture',
      description: 'Information on the manufacture of the drug product',
    },
    {
      id: 'p.4',
      name: 'Control of Excipients',
      description: 'Control of excipients used in the drug product',
    },
    {
      id: 'p.5',
      name: 'Control of Drug Product',
      description: 'Control of the drug product',
    },
    {
      id: 'p.6',
      name: 'Reference Standards or Materials',
      description: 'Reference standards or materials for the drug product',
    },
    {
      id: 'p.7',
      name: 'Container Closure System',
      description: 'Container closure system for the drug product',
    },
    {
      id: 'p.8',
      name: 'Stability',
      description: 'Stability of the drug product',
    },
  ];

  return res.status(200).json({ templates });
});

export default router;
