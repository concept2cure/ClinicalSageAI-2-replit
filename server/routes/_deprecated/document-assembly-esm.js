/**
 * Document Assembly Routes (ESM Version)
 *
 * These routes handle document assembly and generation for
 * FDA 510(k) submissions and clinical evaluation reports.
 */

import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import services as CommonJS
import documentAssemblyService from '../services/documentAssemblyService-esm.js';
import pdfGenerationService from '../services/pdfGenerationService-esm.js';
import wordGenerationService from '../services/wordGenerationService-esm.js';

const router = express.Router();

// Initialize services
(async () => {
  try {
    await documentAssemblyService.initialize();
    console.log('Document assembly service initialized');
  } catch (error) {
    console.error('Error initializing document assembly service:', error);
  }
})();

/**
 * Assemble a CER document
 * POST /api/document-assembly/cer
 */
router.post('/cer', async (req, res) => {
  try {
    const { cerData, options } = req.body;

    if (!cerData) {
      return res.status(400).json({ success: false, message: 'CER data required' });
    }

    const result = await documentAssemblyService.assembleCERDocument(cerData, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error assembling CER document:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Assemble a 510(k) document
 * POST /api/document-assembly/510k
 */
router.post('/510k', async (req, res) => {
  try {
    const { submission510kData, options } = req.body;

    if (!submission510kData) {
      return res.status(400).json({ success: false, message: '510(k) submission data required' });
    }

    const result = await documentAssemblyService.assemble510kDocument(submission510kData, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error assembling 510(k) document:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Generate PDF from assembled document
 * POST /api/document-assembly/generate-pdf
 */
router.post('/generate-pdf', async (req, res) => {
  try {
    const { content, filename } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, message: 'Document content required' });
    }

    const pdfBuffer = await pdfGenerationService.generatePdf(content, filename || 'document.pdf');

    const base64Pdf = pdfBuffer.toString('base64');

    res.json({
      success: true,
      filename: filename || 'document.pdf',
      data: base64Pdf,
      mimeType: 'application/pdf',
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Generate Word document from assembled document
 * POST /api/document-assembly/generate-docx
 */
router.post('/generate-docx', async (req, res) => {
  try {
    const { content, filename } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, message: 'Document content required' });
    }

    const docxBuffer = await wordGenerationService.generateDocx(
      content,
      filename || 'document.docx'
    );

    const base64Docx = docxBuffer.toString('base64');

    res.json({
      success: true,
      filename: filename || 'document.docx',
      data: base64Docx,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  } catch (error) {
    console.error('Error generating Word document:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Get document assembly status
 * GET /api/document-assembly/status/:assemblyId
 */
router.get('/status/:assemblyId', async (req, res) => {
  try {
    const { assemblyId } = req.params;

    if (!assemblyId) {
      return res.status(400).json({ success: false, message: 'Assembly ID required' });
    }

    const status = await documentAssemblyService.getAssemblyStatus(assemblyId);

    if (!status) {
      return res.status(404).json({ success: false, message: 'Assembly not found' });
    }

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('Error getting assembly status:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * List all document assemblies
 * GET /api/document-assembly/list
 */
router.get('/list', async (req, res) => {
  try {
    const assemblies = await documentAssemblyService.listAssemblies();

    res.json({
      success: true,
      assemblies,
    });
  } catch (error) {
    console.error('Error listing assemblies:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Generate a perfect 510(k) example report
 * POST /api/document-assembly/generate-510k-example
 */
router.post('/generate-510k-example', async (req, res) => {
  try {
    const examplePath = await documentAssemblyService.generatePerfect510kExampleReport();

    res.json({
      success: true,
      path: examplePath,
      message: 'Perfect 510(k) example report generated successfully',
    });
  } catch (error) {
    console.error('Error generating 510(k) example report:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export { router };
