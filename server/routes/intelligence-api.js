/**
 * Intelligence API Routes
 *
 * This module provides API routes for the TrialSage platform's AI and intelligence services,
 * including regulatory intelligence, document processing, and blockchain verification.
 */

import express from 'express';
import multer from 'multer';
import { join } from 'path';
import fs from 'fs/promises';
import {
  generatePredictiveModel,
  generateRegulatoryText,
  extractRegulatoryData,
  analyzeRegulatoryCompliance,
  generateRegulatoryDocumentSummary,
} from '../services/ai-models.js';
import {
  extractTextFromPDF,
  extractStructuredData,
  generateDocument,
  convertDocument,
  searchDocuments,
  validateDocument,
  getProcessingResult,
} from '../services/document-processor.js';
import {
  getRegulationsByAuthority,
  getRegulatoryGuidance,
  getRegulatoryStandards,
  getSubmissionRequirements,
  searchRegulatoryDatabase,
  getRegulatoryIntelligence,
  getRegulatoryUpdates,
  clearRegulatoryCaches,
  checkRegulatoryDatabaseStatus,
} from '../services/regulatory-database.js';
import {
  initialize as initializeBlockchain,
  registerDocument,
  updateDocument,
  verifyDocument,
  createAuditTrail,
  getDocumentHistory,
  getBlockchainStatus,
} from '../services/blockchain.js';

// Create router
const router = express.Router();

// Set up file upload middleware
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Helper to get user ID from request (would use auth middleware in production)
function getUserId(req) {
  return req.user?.id || 1; // Default ID for testing
}

// Middleware to check if AI service is available
function checkAIService(req, res, next) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'AI service unavailable',
      message: 'OpenAI API key not configured',
    });
  }

  next();
}

// Initialize services
router.post('/initialize', async (req, res) => {
  try {
    console.log('[Intelligence API] Initializing services...');

    // Initialize blockchain service
    const blockchainOptions = req.body.blockchain || { enabled: true };
    const blockchainStatus = await initializeBlockchain(blockchainOptions);

    // Clear regulatory database caches
    clearRegulatoryCaches();

    res.json({
      status: 'success',
      blockchain: blockchainStatus,
      initialized: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Initialization error:', error);
    res.status(500).json({
      error: 'Initialization failed',
      message: error.message,
    });
  }
});

// Check service status
router.get('/status', async (req, res) => {
  try {
    // Get blockchain status
    const blockchainStatus = await getBlockchainStatus();

    // Check regulatory database status
    const regulatoryStatus = await checkRegulatoryDatabaseStatus();

    // Check AI service
    const aiStatus = {
      available: !!process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
    };

    res.json({
      status: 'ok',
      services: {
        blockchain: blockchainStatus,
        regulatory: regulatoryStatus,
        ai: aiStatus,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Status check error:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: error.message,
    });
  }
});

// AI Models Routes

// Generate regulatory text
router.post('/regulatory-text', checkAIService, async (req, res) => {
  try {
    const { prompt, options } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Prompt is required',
      });
    }

    const text = await generateRegulatoryText(prompt, options);

    res.json({
      text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Text generation error:', error);
    res.status(500).json({
      error: 'Text generation failed',
      message: error.message,
    });
  }
});

// Extract data from regulatory text
router.post('/extract-data', checkAIService, async (req, res) => {
  try {
    const { text, fields, options } = req.body;

    if (!text || !fields || !Array.isArray(fields)) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Text and fields array are required',
      });
    }

    const data = await extractRegulatoryData(text, fields, options);

    res.json({
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Data extraction error:', error);
    res.status(500).json({
      error: 'Data extraction failed',
      message: error.message,
    });
  }
});

// Analyze regulatory compliance
router.post('/compliance-analysis', checkAIService, async (req, res) => {
  try {
    const { text, standard, options } = req.body;

    if (!text || !standard) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Text and standard are required',
      });
    }

    const analysis = await analyzeRegulatoryCompliance(text, standard, options);

    res.json({
      analysis,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Compliance analysis error:', error);
    res.status(500).json({
      error: 'Compliance analysis failed',
      message: error.message,
    });
  }
});

// Generate document summary
router.post('/document-summary', checkAIService, async (req, res) => {
  try {
    const { text, options } = req.body;

    if (!text) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Text is required',
      });
    }

    const summary = await generateRegulatoryDocumentSummary(text, options);

    res.json({
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Document summary error:', error);
    res.status(500).json({
      error: 'Document summary failed',
      message: error.message,
    });
  }
});

// Generate predictive model
router.post('/predictive-model', checkAIService, async (req, res) => {
  try {
    const { submissionType, productType, historicalData } = req.body;

    if (!submissionType || !productType || !historicalData) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Submission type, product type, and historical data are required',
      });
    }

    const model = await generatePredictiveModel(submissionType, productType, historicalData);

    res.json({
      model,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Predictive model error:', error);
    res.status(500).json({
      error: 'Predictive model generation failed',
      message: error.message,
    });
  }
});

// Document Processor Routes

// Upload and process document
router.post('/documents/process', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Missing file',
        message: 'No file uploaded',
      });
    }

    // Check file type
    const filename = req.file.originalname.toLowerCase();
    if (!filename.endsWith('.pdf')) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);

      return res.status(400).json({
        error: 'Invalid file type',
        message: 'Only PDF files are supported',
      });
    }

    // Get options from request
    const options = req.body.options ? JSON.parse(req.body.options) : {};

    // Extract text from PDF
    const result = await extractTextFromPDF(req.file.path, {
      title: req.body.title || req.file.originalname,
      author: req.body.author,
      ...options,
    });

    res.json({
      ...result,
      message: 'Document processed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Document processing error:', error);
    res.status(500).json({
      error: 'Document processing failed',
      message: error.message,
    });
  }
});

// Get processing result
router.get('/documents/result/:resultId', async (req, res) => {
  try {
    const { resultId } = req.params;

    const result = getProcessingResult(resultId);

    if (!result) {
      return res.status(404).json({
        error: 'Result not found',
        message: `Processing result not found: ${resultId}`,
      });
    }

    res.json({
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Get result error:', error);
    res.status(500).json({
      error: 'Failed to get processing result',
      message: error.message,
    });
  }
});

// Extract structured data from document
router.post('/documents/extract/:resultId', checkAIService, async (req, res) => {
  try {
    const { resultId } = req.params;
    const { options } = req.body;

    const result = await extractStructuredData(resultId, options || {});

    res.json({
      ...result,
      message: 'Data extracted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Data extraction error:', error);
    res.status(500).json({
      error: 'Data extraction failed',
      message: error.message,
    });
  }
});

// Generate document from template
router.post('/documents/generate', async (req, res) => {
  try {
    const { templateId, data, options } = req.body;

    if (!templateId || !data) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Template ID and data are required',
      });
    }

    const userId = getUserId(req);

    const document = await generateDocument(templateId, data, {
      ...options,
      userId,
    });

    res.json({
      document,
      message: 'Document generated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Document generation error:', error);
    res.status(500).json({
      error: 'Document generation failed',
      message: error.message,
    });
  }
});

// Convert document format
router.post('/documents/convert', async (req, res) => {
  try {
    const { documentId, targetFormat, options } = req.body;

    if (!documentId || !targetFormat) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Document ID and target format are required',
      });
    }

    const userId = getUserId(req);

    const document = await convertDocument(documentId, targetFormat, {
      ...options,
      userId,
    });

    res.json({
      document,
      message: 'Document converted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Document conversion error:', error);
    res.status(500).json({
      error: 'Document conversion failed',
      message: error.message,
    });
  }
});

// Search documents
router.post('/documents/search', async (req, res) => {
  try {
    const { query, options } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Search query is required',
      });
    }

    const results = await searchDocuments(query, options || {});

    res.json({
      ...results,
      message: 'Search completed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Document search error:', error);
    res.status(500).json({
      error: 'Document search failed',
      message: error.message,
    });
  }
});

// Validate document against template
router.post('/documents/validate', async (req, res) => {
  try {
    const { documentId, templateId, options } = req.body;

    if (!documentId || !templateId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Document ID and template ID are required',
      });
    }

    const validation = await validateDocument(documentId, templateId, options || {});

    res.json({
      ...validation,
      message: 'Document validation completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Document validation error:', error);
    res.status(500).json({
      error: 'Document validation failed',
      message: error.message,
    });
  }
});

// Regulatory Database Routes

// Get regulations by authority
router.get('/regulatory/regulations/:authority', async (req, res) => {
  try {
    const { authority } = req.params;
    const options = req.query;

    const regulations = await getRegulationsByAuthority(authority, options);

    res.json({
      regulations,
      count: regulations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Get regulations error:', error);
    res.status(500).json({
      error: 'Failed to get regulations',
      message: error.message,
    });
  }
});

// Get regulatory guidance
router.get('/regulatory/guidance', async (req, res) => {
  try {
    const options = req.query;

    const guidance = await getRegulatoryGuidance(options);

    res.json({
      guidance,
      count: guidance.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Get guidance error:', error);
    res.status(500).json({
      error: 'Failed to get guidance',
      message: error.message,
    });
  }
});

// Get regulatory standards
router.get('/regulatory/standards', async (req, res) => {
  try {
    const options = req.query;

    const standards = await getRegulatoryStandards(options);

    res.json({
      standards,
      count: standards.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Get standards error:', error);
    res.status(500).json({
      error: 'Failed to get standards',
      message: error.message,
    });
  }
});

// Get submission requirements
router.get('/regulatory/requirements/:authority/:productType', async (req, res) => {
  try {
    const { authority, productType } = req.params;
    const options = req.query;

    const requirements = await getSubmissionRequirements(authority, productType, options);

    if (!requirements) {
      return res.status(404).json({
        error: 'Requirements not found',
        message: `No requirements found for ${authority}/${productType}`,
      });
    }

    res.json({
      requirements,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Get requirements error:', error);
    res.status(500).json({
      error: 'Failed to get requirements',
      message: error.message,
    });
  }
});

// Search regulatory database
router.post('/regulatory/search', async (req, res) => {
  try {
    const { query, options } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Search query is required',
      });
    }

    const results = await searchRegulatoryDatabase(query, options || {});

    res.json({
      ...results,
      message: 'Search completed successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Regulatory search error:', error);
    res.status(500).json({
      error: 'Regulatory search failed',
      message: error.message,
    });
  }
});

// Get regulatory intelligence
router.post('/regulatory/intelligence', checkAIService, async (req, res) => {
  try {
    const { topic, options } = req.body;

    if (!topic) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Topic is required',
      });
    }

    const intelligence = await getRegulatoryIntelligence(topic, options || {});

    res.json({
      ...intelligence,
      message: 'Regulatory intelligence generated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Regulatory intelligence error:', error);
    res.status(500).json({
      error: 'Regulatory intelligence failed',
      message: error.message,
    });
  }
});

// Get regulatory updates
router.get('/regulatory/updates', async (req, res) => {
  try {
    const { since, ...options } = req.query;

    // Parse date or use default (30 days ago)
    let sinceDate;
    if (since) {
      sinceDate = new Date(since);
    } else {
      sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - 30);
    }

    const updates = await getRegulatoryUpdates(sinceDate, options);

    res.json({
      ...updates,
      message: 'Regulatory updates retrieved successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Regulatory updates error:', error);
    res.status(500).json({
      error: 'Failed to get regulatory updates',
      message: error.message,
    });
  }
});

// Blockchain Routes

// Register document in blockchain
router.post('/blockchain/register', async (req, res) => {
  try {
    const { document } = req.body;

    if (!document || !document.id) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Document with ID is required',
      });
    }

    const userId = getUserId(req);

    const result = await registerDocument(document, userId);

    res.json({
      ...result,
      message: 'Document registered in blockchain successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Blockchain register error:', error);
    res.status(500).json({
      error: 'Blockchain registration failed',
      message: error.message,
    });
  }
});

// Update document in blockchain
router.post('/blockchain/update', async (req, res) => {
  try {
    const { document } = req.body;

    if (!document || !document.id) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Document with ID is required',
      });
    }

    const userId = getUserId(req);

    const result = await updateDocument(document, userId);

    res.json({
      ...result,
      message: 'Document updated in blockchain successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Blockchain update error:', error);
    res.status(500).json({
      error: 'Blockchain update failed',
      message: error.message,
    });
  }
});

// Verify document in blockchain
router.post('/blockchain/verify', async (req, res) => {
  try {
    const { document } = req.body;

    if (!document || !document.id) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Document with ID is required',
      });
    }

    const userId = getUserId(req);

    const result = await verifyDocument(document, userId);

    res.json({
      ...result,
      message: 'Document verification completed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Blockchain verification error:', error);
    res.status(500).json({
      error: 'Blockchain verification failed',
      message: error.message,
    });
  }
});

// Create blockchain audit trail
router.post('/blockchain/audit', async (req, res) => {
  try {
    const { operation, resourceId, data } = req.body;

    if (!operation || !resourceId || !data) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Operation, resource ID, and data are required',
      });
    }

    const userId = getUserId(req);

    const result = await createAuditTrail(operation, resourceId, data, userId);

    res.json({
      ...result,
      message: 'Audit trail created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Blockchain audit error:', error);
    res.status(500).json({
      error: 'Blockchain audit failed',
      message: error.message,
    });
  }
});

// Get document blockchain history
router.get('/blockchain/history/:documentId', async (req, res) => {
  try {
    const { documentId } = req.params;

    const history = await getDocumentHistory(documentId);

    res.json({
      ...history,
      message: 'Document blockchain history retrieved successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Intelligence API] Blockchain history error:', error);
    res.status(500).json({
      error: 'Failed to get blockchain history',
      message: error.message,
    });
  }
});

export default router;
