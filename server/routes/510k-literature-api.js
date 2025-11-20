/**
 * 510(k) Literature API Routes
 *
 * This module handles server-side API endpoints for managing literature associations
 * with 510(k) device features, powering the literature evidence functionality.
 */

const express = require('express');
const { OpenAI } = require('openai');
const router = express.Router();
const logger = require('../utils/logger');
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

// Initialize OpenAI client
// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Save literature evidence associations for device features
 * Route: POST /api/510k/literature/evidence
 */
router.post('/evidence', async (req, res) => {
  const { documentId, featureEvidence, organizationId } = req.body;

  // Validate essential parameters
  if (!documentId || !featureEvidence) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters. Document ID and feature evidence mappings are required.',
    });
  }

  try {
    logger.info('Saving literature evidence associations', {
      module: '510k-literature-api',
      documentId,
    });

    // Create database connection
    const client = await db.pool.connect();

    try {
      // Begin transaction
      await client.query('BEGIN');

      // Delete any existing evidence connections for this document
      await client.query('DELETE FROM literature_feature_connections WHERE document_id = $1', [
        documentId,
      ]);

      // Insert new evidence connections for each feature
      for (const [featureId, papers] of Object.entries(featureEvidence)) {
        // Skip if no papers are associated with this feature
        if (!Array.isArray(papers) || papers.length === 0) continue;

        for (const paper of papers) {
          const connectionId = uuidv4();

          await client.query(
            `INSERT INTO literature_feature_connections
             (id, document_id, feature_id, paper_id, paper_title, paper_author, organization_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              connectionId,
              documentId,
              featureId,
              paper.id || paper.paperId || uuidv4(),
              paper.title || 'Unknown Title',
              paper.authors || paper.author || 'Unknown Author',
              organizationId || null,
              new Date(),
            ]
          );
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      // Return success
      res.json({
        success: true,
        documentId,
        message: 'Literature evidence associations saved successfully',
        connectionCount: Object.values(featureEvidence).reduce(
          (acc, papers) => acc + papers.length,
          0
        ),
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      // Release client back to the pool
      client.release();
    }
  } catch (error) {
    logger.error('Error saving literature evidence associations', {
      module: '510k-literature-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to save literature evidence associations',
      message: error.message,
    });
  }
});

/**
 * Analyze feature relevance of literature
 * Route: POST /api/510k/literature/analyze-relevance
 */
router.post('/analyze-relevance', async (req, res) => {
  const { features, literature } = req.body;

  // Validate essential parameters
  if (!features || !literature || !Array.isArray(features) || !Array.isArray(literature)) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters. Features and literature arrays are required.',
    });
  }

  try {
    logger.info('Analyzing literature relevance to features', {
      module: '510k-literature-api',
      featuresCount: features.length,
      literatureCount: literature.length,
    });

    // Build prompt for OpenAI
    const prompt = `
As a medical device regulatory expert, analyze the relevance of each literature paper to the device features.

FEATURES:
${features.map((f, idx) => `${idx + 1}. ${f.name}: ${f.description || ''}`).join('\n')}

LITERATURE:
${literature.map((p, idx) => `${idx + 1}. "${p.title}" ${p.abstract ? `- ${p.abstract}` : ''}`).join('\n\n')}

For each paper, determine which features (if any) it provides evidence for. Focus on:
1. Technical or clinical evidence supporting feature claims
2. Performance data relevant to specific features
3. Safety information related to features
4. References to similar designs, materials, or technologies

Return a JSON with mappings between papers and relevant features. Structure: 
{
  "paperToFeatures": {
    "paper_index": [list of relevant feature indices],
    ...
  }
}
`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a medical device regulatory expert specializing in 510(k) submissions and clinical evidence analysis.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    // Get the generated mappings
    const relevanceData = JSON.parse(response.choices[0].message.content);

    // Return the analyzed relevance
    res.json({
      success: true,
      relevanceData,
      model: 'gpt-4o',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error analyzing literature relevance', {
      module: '510k-literature-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to analyze literature relevance',
      message: error.message,
    });
  }
});

/**
 * Get literature evidence connections for a 510(k) document
 * Route: GET /api/510k/literature/connections/:documentId
 */
router.get('/connections/:documentId', async (req, res) => {
  const { documentId } = req.params;
  const organizationId = req.query.organizationId;

  // Validate essential parameters
  if (!documentId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: documentId',
    });
  }

  try {
    logger.info('Fetching literature evidence connections', {
      module: '510k-literature-api',
      documentId,
    });

    // Create database connection
    const client = await db.pool.connect();

    try {
      // Query to get all literature connections for this document
      const query = `
        SELECT * FROM literature_feature_connections 
        WHERE document_id = $1
        ${organizationId ? 'AND organization_id = $2' : ''}
        ORDER BY feature_id, created_at DESC
      `;

      const params = organizationId ? [documentId, organizationId] : [documentId];
      const result = await client.query(query, params);

      // Group connections by feature ID
      const featureEvidenceMap = {};

      for (const row of result.rows) {
        const featureId = row.feature_id;

        if (!featureEvidenceMap[featureId]) {
          featureEvidenceMap[featureId] = [];
        }

        featureEvidenceMap[featureId].push({
          id: row.paper_id,
          title: row.paper_title,
          authors: row.paper_author,
          connectionId: row.id,
          createdAt: row.created_at,
        });
      }

      // Return the grouped evidence
      res.json({
        success: true,
        documentId,
        literatureEvidence: featureEvidenceMap,
        totalConnections: result.rowCount,
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      throw dbError;
    } finally {
      // Release client back to the pool
      client.release();
    }
  } catch (error) {
    logger.error('Error fetching literature evidence connections', {
      module: '510k-literature-api',
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch literature evidence connections',
      message: error.message,
    });
  }
});

module.exports = router;
