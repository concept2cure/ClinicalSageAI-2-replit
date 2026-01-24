/**
 * Regulatory Review API Routes
 *
 * Handles AI-powered document analysis and suggestion generation
 * for the eCTD Co-Author module.
 */

const express = require('express');
const regulatoryReviewService = require('../services/regulatoryReviewService.js');

const router = express.Router();

/**
 * POST /api/v1/review/analyze_document
 *
 * Receives drafted document text and returns a list of AI-generated,
 * citable suggestions for regulatory compliance and quality improvement.
 */
router.post('/analyze_document', async (req, res) => {
  try {
    const { task_id, document_text } = req.body;

    // Validate request
    if (!task_id || !document_text) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Both task_id and document_text are required',
      });
    }

    console.log(`Received regulatory review request for task: ${task_id}`);

    // Generate AI suggestions
    const suggestions = await regulatoryReviewService.generateSuggestions(document_text, task_id);

    // Return structured response
    res.json({
      suggestions: suggestions,
      task_id: task_id,
      analysis_timestamp: new Date().toISOString(),
      suggestion_count: suggestions.length,
    });
  } catch (error) {
    console.error('Error in analyze_document route:', error);
    res.status(500).json({
      error: 'Failed to analyze document',
      details: error.message,
    });
  }
});

/**
 * GET /api/v1/review/health
 *
 * Health check endpoint for the regulatory review service
 */
router.get('/health', (req, res) => {
  res.json({
    service: 'Regulatory Review Service',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
