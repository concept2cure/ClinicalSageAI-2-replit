/**
 * OCR Routes for DocuShare Integration
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import DocuShareOCRService from '../services/DocuShareOCRService.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/ocr/' });
const ocrService = new DocuShareOCRService();

/**
 * Process document with OCR
 */
router.post('/process', upload.single('document'), async (req, res) => {
  try {
    const {
      method = 'auto',
      preserveLayout = true,
      analyzeStructure = false,
      docuShareDocumentId,
    } = req.body;

    let input = {};

    // Prepare input based on available data
    if (req.file) {
      input.filePath = req.file.path;
      input.buffer = fs.readFileSync(req.file.path);
    }

    if (docuShareDocumentId) {
      input.documentId = docuShareDocumentId;
    }

    // DocuShare configuration
    const docuShareConfig = {
      apiUrl: process.env.DOCUSHARE_API_URL,
      apiKey: process.env.DOCUSHARE_API_KEY,
    };

    const options = {
      preferredMethod: method,
      enableFallback: true,
      docuShareConfig: docuShareConfig.apiUrl ? docuShareConfig : null,
      preserveLayout: preserveLayout === 'true',
      analyzeStructure: analyzeStructure === 'true',
    };

    const result =
      analyzeStructure === 'true'
        ? await ocrService.processWithStructureAnalysis(input, options)
        : await ocrService.processDocument(input, options);

    // Cleanup uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[OCR Routes] Error:', error);

    // Cleanup on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Process DocuShare document by ID
 */
router.post('/docushare/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { method = 'docushare' } = req.body;

    const docuShareConfig = {
      apiUrl: process.env.DOCUSHARE_API_URL,
      apiKey: process.env.DOCUSHARE_API_KEY,
    };

    if (!docuShareConfig.apiUrl || !docuShareConfig.apiKey) {
      return res.status(400).json({
        success: false,
        error: 'DocuShare not configured',
      });
    }

    const input = { documentId };
    const options = {
      preferredMethod: method,
      enableFallback: true,
      docuShareConfig,
    };

    const result = await ocrService.processDocument(input, options);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[OCR DocuShare] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get OCR service status and capabilities
 */
router.get('/status', (req, res) => {
  const status = {
    tesseract: ocrService.tesseractEnabled,
    awsTextract: ocrService.awsTextractEnabled,
    docushare: !!(process.env.DOCUSHARE_API_URL && process.env.DOCUSHARE_API_KEY),
    supportedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp'],
    capabilities: {
      textExtraction: true,
      structureAnalysis: true,
      tableDetection: true,
      multiLanguage: true,
      confidenceScoring: true,
    },
  };

  res.json({
    success: true,
    status,
  });
});

/**
 * Batch OCR processing
 */
router.post('/batch', upload.array('documents', 10), async (req, res) => {
  try {
    const { method = 'auto', preserveLayout = true } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided',
      });
    }

    const docuShareConfig = {
      apiUrl: process.env.DOCUSHARE_API_URL,
      apiKey: process.env.DOCUSHARE_API_KEY,
    };

    const results = [];

    for (const file of req.files) {
      try {
        const input = {
          filePath: file.path,
          buffer: fs.readFileSync(file.path),
        };

        const options = {
          preferredMethod: method,
          enableFallback: true,
          docuShareConfig: docuShareConfig.apiUrl ? docuShareConfig : null,
          preserveLayout: preserveLayout === 'true',
        };

        const result = await ocrService.processDocument(input, options);

        results.push({
          filename: file.originalname,
          result,
        });

        // Cleanup file
        fs.unlinkSync(file.path);
      } catch (fileError) {
        results.push({
          filename: file.originalname,
          error: fileError.message,
        });

        // Cleanup on error
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    res.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[OCR Batch] Error:', error);

    // Cleanup all files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
