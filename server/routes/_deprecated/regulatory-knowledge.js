/**
 * Regulatory Knowledge Base Routes
 *
 * These routes provide the API for managing the regulatory knowledge base,
 * including document processing and initialization.
 *
 * NOTE: This version uses the file system for storage rather than SQLite
 * to avoid dependency issues.
 */

const express = require('express');
const router = express.Router();
const documentProcessor = require('../services/documentProcessor');
const path = require('path');
const fs = require('fs');

// Path to the knowledge base
const DATA_DIR = path.join(__dirname, '../../data');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge_base');
const METADATA_PATH = path.join(KNOWLEDGE_DIR, 'metadata.json');

/**
 * @route POST /api/regulatory-knowledge/initialize
 * @description Initialize the regulatory knowledge base database
 */
router.post('/initialize', async (req, res) => {
  try {
    const success = await documentProcessor.setupKnowledgeBase();

    if (success) {
      res.json({
        success: true,
        message: 'Regulatory knowledge base initialized successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to initialize regulatory knowledge base',
      });
    }
  } catch (error) {
    console.error('Error initializing regulatory knowledge base:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while initializing regulatory knowledge base',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/regulatory-knowledge/process-documents
 * @description Process documents in a specified folder
 */
router.post('/process-documents', async (req, res) => {
  try {
    const { folderPath } = req.body;

    if (!folderPath) {
      return res.status(400).json({
        success: false,
        message: 'Folder path is required',
      });
    }

    // Ensure the folder path is valid
    const resolvedPath = path.resolve(folderPath);

    // Check if the path exists
    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({
        success: false,
        message: `Folder path does not exist: ${resolvedPath}`,
      });
    }

    // Process documents in the folder
    const result = await documentProcessor.importDocuments(resolvedPath);

    res.json(result);
  } catch (error) {
    console.error('Error processing documents:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while processing documents',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/regulatory-knowledge/status
 * @description Get the status of the regulatory knowledge base
 */
router.get('/status', async (req, res) => {
  try {
    // Get knowledge base stats using the document processor
    const stats = await documentProcessor.getKnowledgeBaseStats();

    res.json(stats);
  } catch (error) {
    console.error('Error getting knowledge base status:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while getting knowledge base status',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/regulatory-knowledge/search
 * @description Search the regulatory knowledge base
 */
router.get('/search', async (req, res) => {
  try {
    const { query, jurisdiction, docType, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter is required',
      });
    }

    // Check if the knowledge base exists
    if (!fs.existsSync(KNOWLEDGE_DIR) || !fs.existsSync(METADATA_PATH)) {
      return res.json({
        success: false,
        message: 'Knowledge base has not been initialized',
        results: [],
      });
    }

    // Use document processor to search the knowledge base
    const results = await documentProcessor.searchKnowledgeBase(
      query,
      jurisdiction || null,
      docType || null,
      parseInt(limit, 10)
    );

    // Truncate content for response to avoid large payloads
    const processedResults = results.map(result => {
      // Limit content to 500 characters for the response
      const truncatedContent =
        result.content && result.content.length > 500
          ? result.content.substring(0, 500) + '...'
          : result.content;

      return {
        ...result,
        content: truncatedContent,
      };
    });

    res.json({
      success: true,
      count: processedResults.length,
      results: processedResults,
    });
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while searching knowledge base',
      error: error.message,
    });
  }
});

module.exports = router;
