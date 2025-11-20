/**
 * Document Assembly Routes (ES Module Version)
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

// Import services
import documentAssemblyService from '../services/documentAssemblyService.js';
import pdfGenerationService from '../services/pdfGenerationService.js';
import wordGenerationService from '../services/wordGenerationService.js';

const router = express.Router();

// Initialize services
(async () => {
  try {
    await documentAssemblyService.initialize();
    await pdfGenerationService.initialize();
    await wordGenerationService.initialize();
    console.log('Document assembly routes registered (ESM)');
  } catch (error) {
    console.error('Failed to initialize document assembly services:', error);
  }
})();

/**
 * Generate and download an example 510(k) submission report
 *
 * @route GET /api/document-assembly/example/510k
 * @query {string} format - Format of the example (html, docx)
 * @returns {File} The generated example file
 */
router.get('/example/510k', async (req, res) => {
  try {
    const format = req.query.format || 'html';

    let filePath;
    if (format === 'html') {
      filePath = await pdfGenerationService.generatePerfect510kExample();
    } else if (format === 'docx') {
      filePath = await wordGenerationService.generatePerfect510kExampleWord();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Supported formats: html, docx',
      });
    }

    const fileStats = await fs.stat(filePath);
    const fileName = path.basename(filePath);

    res.setHeader(
      'Content-Type',
      format === 'html'
        ? 'text/html'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileStats.size);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error generating example 510(k) report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating example 510(k) report',
      error: error.message,
    });
  }
});

/**
 * Generate a 510(k) submission document based on provided data
 *
 * @route POST /api/document-assembly/generate/510k
 * @body {Object} submissionData - The data for the 510(k) submission
 * @query {string} format - Format to generate (html, docx)
 * @returns {Object} Path to the generated document
 */
router.post('/generate/510k', async (req, res) => {
  try {
    const { submissionData } = req.body;
    const format = req.query.format || 'html';

    if (!submissionData || !submissionData.deviceProfile) {
      return res.status(400).json({
        success: false,
        message: 'Missing required submission data',
      });
    }

    let filePath;
    if (format === 'html') {
      const baseHtml = await documentAssemblyService.assemble510kSubmission(submissionData);
      filePath = await pdfGenerationService.generate510kPdf(baseHtml, submissionData.deviceProfile);
    } else if (format === 'docx') {
      filePath = await wordGenerationService.generate510kDocument(submissionData);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Supported formats: html, docx',
      });
    }

    res.json({
      success: true,
      filePath: filePath.replace(process.cwd(), ''),
      format,
    });
  } catch (error) {
    console.error('Error generating 510(k) document:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating 510(k) document',
      error: error.message,
    });
  }
});

/**
 * Download a generated document
 *
 * @route GET /api/document-assembly/download
 * @query {string} filePath - Path to the file
 * @query {string} format - Format of the file (html, docx, pdf)
 * @returns {File} The requested file
 */
router.get('/download', async (req, res) => {
  try {
    const { filePath, format } = req.query;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required file path',
      });
    }

    const fullPath = path.join(process.cwd(), filePath);

    // Verify the file exists
    try {
      await fs.access(fullPath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    const fileStats = await fs.stat(fullPath);
    const fileName = path.basename(fullPath);

    let contentType;
    switch (format) {
      case 'html':
        contentType = 'text/html';
        break;
      case 'docx':
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'pdf':
        contentType = 'application/pdf';
        break;
      default:
        contentType = 'application/octet-stream';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', fileStats.size);

    const fileStream = fs.createReadStream(fullPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading document',
      error: error.message,
    });
  }
});

// Export for ES Modules
export default router;
