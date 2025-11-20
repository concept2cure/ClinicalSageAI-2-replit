/**
 * Internal Clinical Data API
 *
 * Provides endpoints for managing internal clinical evidence as required by EU MDR,
 * including clinical investigation summaries, PMS reports, registry data, and complaint trends.
 * This module supports the critical regulatory requirement to include ALL available clinical
 * evidence in CERs, not just literature.
 *
 * Version: 1.0.0
 * Last Updated: May 8, 2025
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import openaiService from '../services/openaiService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate a simple UUID-like string without dependencies
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

const router = express.Router();

// In-memory database for development (replace with actual DB in production)
let internalData = {
  investigations: [],
  pmsReports: [],
  registryData: [],
  complaints: [],
};

// Mapping of clinical data types to JSON field locations in CER
const cerFieldMapping = {
  investigations: 'sections.clinicalInvestigations',
  pmsReports: 'sections.postMarketData',
  registryData: 'sections.registryEvidence',
  complaints: 'sections.vigilanceData',
};

/**
 * GET /api/cer/internal-data
 * Retrieve all internal clinical data
 */
router.get('/', (req, res) => {
  try {
    logger.info('Retrieved internal clinical data', {
      module: 'internal-clinical-data',
      count: Object.values(internalData).flat().length,
    });

    res.json(internalData);
  } catch (error) {
    logger.error('Error retrieving internal clinical data', {
      module: 'internal-clinical-data',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve internal clinical data',
      message: error.message,
    });
  }
});

/**
 * POST /api/cer/internal-data/upload
 * Upload internal clinical data with metadata
 *
 * Simplified version without file uploads for development
 */
router.post('/upload', async (req, res) => {
  try {
    const {
      category,
      fileName,
      reportType,
      studyDesign,
      dataType,
      timeframe,
      sampleSize,
      summary,
      author,
      department,
      documentId,
    } = req.body;

    if (!category || !Object.keys(internalData).includes(category)) {
      return res.status(400).json({
        error: 'Invalid or missing category',
      });
    }

    // Create a placeholder file record
    const fileId = generateId();
    const fileRecord = {
      id: fileId,
      name: fileName || `${reportType || 'document'}-${fileId.substring(0, 8)}`,
      uploadedAt: new Date().toISOString(),
      metadata: {
        reportType,
        studyDesign,
        dataType,
        timeframe,
        sampleSize,
        summary: summary || 'No summary available',
        author,
        department,
        documentId,
      },
      processingStatus: 'completed',
    };

    // Add to appropriate category
    internalData[category].push(fileRecord);

    logger.info('Added internal clinical data', {
      module: 'internal-clinical-data',
      category,
      documentId: documentId || 'not specified',
    });

    res.status(201).json({
      message: 'Clinical data added successfully',
      fileId: fileId,
      data: fileRecord,
    });
  } catch (error) {
    logger.error('Error adding internal clinical data', {
      module: 'internal-clinical-data',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to add internal clinical data',
      message: error.message,
    });
  }
});

/**
 * GET /api/cer/internal-data/summary
 * Generate a summary of all internal clinical data for CER inclusion
 *
 * Important: Router paths are relative to the route the router is mounted on
 * This route MUST come before any routes with path parameters to avoid conflicts
 */
router.get('/summary', async (req, res) => {
  try {
    // Generate a comprehensive summary of all internal clinical data
    const categoryCounts = {
      investigations: internalData.investigations.length,
      pmsReports: internalData.pmsReports.length,
      registryData: internalData.registryData.length,
      complaints: internalData.complaints.length,
    };

    const totalCount = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

    // If no data available, return empty summary
    if (totalCount === 0) {
      return res.json({
        summary: {
          totalItems: 0,
          categories: categoryCounts,
          narrative: 'No internal clinical data available for CER inclusion.',
        },
      });
    }

    // Generate category-specific summaries
    const categorySummaries = {};
    for (const category of Object.keys(internalData)) {
      if (internalData[category].length > 0) {
        categorySummaries[category] = {
          count: internalData[category].length,
          items: internalData[category].map(file => ({
            id: file.id,
            title: file.name,
            documentId: file.metadata.documentId,
            timeframe: file.metadata.timeframe,
            summary: file.metadata.summary,
            dataType: file.metadata.dataType,
          })),
        };
      }
    }

    // Generate a narrative summary if OpenAI is available
    let narrativeSummary = 'Internal clinical data summary. (AI-generated narrative not available)';

    if (process.env.OPENAI_API_KEY) {
      try {
        // Prepare data for the prompt in a condensed format
        const promptData = Object.entries(categorySummaries)
          .map(([category, data]) => {
            return `${category.toUpperCase()} (${data.count}): ${data.items
              .map(item => `${item.title} (${item.timeframe || 'No timeframe'})`)
              .join(', ')}`;
          })
          .join('\n\n');

        const prompt = `
You are a medical device regulatory expert specializing in clinical evaluations.

Please generate a concise summary (approximately 300 words) of the following internal clinical data for inclusion in a Clinical Evaluation Report (CER) under EU MDR requirements:

${promptData}

Your summary should:
1. Emphasize the importance of including internal clinical data alongside literature evidence
2. Highlight key types of evidence available
3. Note any apparent gaps in the data 
4. Explain how this internal clinical evidence supports EU MDR compliance
5. Be written in a formal, objective style appropriate for regulatory documentation

The output will be included directly in the CER as a summary of internal clinical evidence.
`;

        const response = await openaiService.generateText({
          prompt,
          maxTokens: 800,
          temperature: 0.3,
        });

        narrativeSummary = response.text;

        logger.info('Generated AI narrative summary for internal clinical data', {
          module: 'internal-clinical-data',
          summaryLength: narrativeSummary.length,
        });
      } catch (aiError) {
        logger.warn('Failed to generate AI narrative summary', {
          module: 'internal-clinical-data',
          error: aiError.message,
        });
      }
    }

    logger.info('Generated internal clinical data summary', {
      module: 'internal-clinical-data',
      totalCount,
      categories: categoryCounts,
    });

    res.json({
      summary: {
        totalItems: totalCount,
        categories: categoryCounts,
        categorySummaries: categorySummaries,
        narrative: narrativeSummary,
      },
    });
  } catch (error) {
    logger.error('Error generating internal clinical data summary', {
      module: 'internal-clinical-data',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Failed to generate internal clinical data summary',
      message: error.message,
    });
  }
});

/**
 * GET /api/cer/internal-data/category/:category
 * Retrieve all internal clinical data for a specific category
 */
router.get('/category/:category', (req, res) => {
  try {
    const { category } = req.params;

    if (!Object.keys(internalData).includes(category)) {
      return res.status(400).json({
        error: 'Invalid category',
      });
    }

    logger.info('Retrieved internal clinical data by category', {
      module: 'internal-clinical-data',
      category,
      count: internalData[category].length,
    });

    res.json(internalData[category]);
  } catch (error) {
    logger.error('Error retrieving internal clinical data by category', {
      module: 'internal-clinical-data',
      error: error.message,
      category: req.params.category,
    });

    res.status(500).json({
      error: 'Failed to retrieve internal clinical data by category',
      message: error.message,
    });
  }
});

/**
 * GET /api/cer/internal-data/:id
 * Retrieve a specific internal clinical data file
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Search for the file across all categories
    let file = null;
    for (const category of Object.keys(internalData)) {
      const found = internalData[category].find(f => f.id === id);
      if (found) {
        file = found;
        break;
      }
    }

    if (!file) {
      return res.status(404).json({
        error: 'Internal clinical data file not found',
      });
    }

    res.json(file);
  } catch (error) {
    logger.error('Error retrieving internal clinical data file', {
      module: 'internal-clinical-data',
      error: error.message,
      fileId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to retrieve internal clinical data file',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/cer/internal-data/:id
 * Delete a specific internal clinical data file
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Search for the file across all categories
    let fileCategory = null;
    let fileIndex = -1;

    for (const category of Object.keys(internalData)) {
      const index = internalData[category].findIndex(f => f.id === id);
      if (index !== -1) {
        fileCategory = category;
        fileIndex = index;
        break;
      }
    }

    if (fileCategory === null || fileIndex === -1) {
      return res.status(404).json({
        error: 'Internal clinical data file not found',
      });
    }

    // Remove from array
    internalData[fileCategory].splice(fileIndex, 1);

    logger.info('Deleted internal clinical data', {
      module: 'internal-clinical-data',
      fileId: id,
      category: fileCategory,
    });

    res.json({
      message: 'Internal clinical data deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting internal clinical data', {
      module: 'internal-clinical-data',
      error: error.message,
      fileId: req.params.id,
    });

    res.status(500).json({
      error: 'Failed to delete internal clinical data',
      message: error.message,
    });
  }
});

export default router;
