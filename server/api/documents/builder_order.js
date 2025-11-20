/**
 * Document Builder Order API
 *
 * This module provides endpoints for saving the order of documents
 * in the submission builder.
 */

import express from 'express';

const router = express.Router();

/**
 * Save document order in the submission builder
 *
 * @route POST /api/documents/builder-order
 * @param {object} req.body.docs - Array of document objects with id, module, and order
 * @returns {object} Success message
 */
router.post('/api/documents/builder-order', async (req, res) => {
  try {
    const { docs } = req.body;

    if (!Array.isArray(docs)) {
      return res.status(400).json({
        error: 'Invalid request format',
        message: 'Expected "docs" array in request body',
      });
    }

    // In a real implementation, we would update the document order in the database
    // For this MVP, we'll just log the order and return success
    console.log('Saving document order:', docs);

    // Simulate a database update with a slight delay
    await new Promise(resolve => setTimeout(resolve, 300));

    return res.json({
      success: true,
      message: 'Document order saved successfully',
      count: docs.length,
    });
  } catch (error) {
    console.error('Error saving document order:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

export default router;
