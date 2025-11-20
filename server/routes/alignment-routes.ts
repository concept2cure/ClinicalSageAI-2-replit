import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Get alignment score report for a session
 *
 * @route GET /api/sessions/:sessionId/alignment
 * @param {string} sessionId - Session ID
 * @returns {Object} Alignment score report with matches
 */
router.get('/sessions/:sessionId/alignment', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Path to alignment report in session directory
    const alignmentReportPath = path.join(
      '/mnt/data/lumen_reports_backend/sessions',
      sessionId,
      'alignment_score_report.json'
    );

    // Check if file exists
    if (!fs.existsSync(alignmentReportPath)) {
      return res.status(404).json({
        error: 'Alignment report not found',
        message: 'No alignment report has been generated for this session',
      });
    }

    // Read and parse the alignment report
    const alignmentData = JSON.parse(fs.readFileSync(alignmentReportPath, 'utf8'));

    // Return the alignment data
    return res.status(200).json(alignmentData);
  } catch (error) {
    console.error('Error fetching alignment data:', error);
    return res.status(500).json({
      error: 'Failed to retrieve alignment data',
      message: 'An unexpected error occurred while fetching alignment data',
    });
  }
});

export default router;
