import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * Route to get protocol correction suggestions based on CSR alignment
 * @route GET /api/insights/suggested-corrections/:sessionId
 * @param {string} sessionId - Session ID to retrieve alignment data for
 * @returns {object} Correction suggestions
 */
router.get('/suggested-corrections/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;

  try {
    // Check if alignment file exists
    const alignmentPath = path.join(
      '/mnt/data/lumen_reports_backend/sessions',
      sessionId,
      'alignment_score_report.json'
    );

    if (!fs.existsSync(alignmentPath)) {
      return res.status(404).json({
        error: 'No alignment data found for this session',
        session_id: sessionId,
        suggestions: [],
        suggestion_count: 0,
      });
    }

    // Execute the correction engine
    const correctionProcess = spawn('python3', [
      path.join(process.cwd(), 'correction_engine.py'),
      sessionId,
    ]);

    // Collect stdout data
    let outputData = '';
    correctionProcess.stdout.on('data', data => {
      outputData += data.toString();
    });

    // Handle errors
    let errorData = '';
    correctionProcess.stderr.on('data', data => {
      errorData += data.toString();
    });

    // Return results when process completes
    correctionProcess.on('close', code => {
      if (code !== 0) {
        console.error(`Correction engine exited with code ${code}`);
        console.error(errorData);

        return res.status(500).json({
          error: 'Failed to generate correction suggestions',
          details: errorData,
          session_id: sessionId,
          suggestions: [],
          suggestion_count: 0,
        });
      }

      try {
        // Parse engine output
        const suggestions = JSON.parse(outputData);
        return res.json(suggestions);
      } catch (parseError) {
        console.error('Failed to parse correction engine output:', parseError);
        return res.status(500).json({
          error: 'Invalid correction engine response',
          session_id: sessionId,
          suggestions: [],
          suggestion_count: 0,
        });
      }
    });
  } catch (error) {
    console.error('Error in correction suggestions route:', error);
    return res.status(500).json({
      error: 'Server error generating corrections',
      session_id: sessionId,
      suggestions: [],
      suggestion_count: 0,
    });
  }
});

export default router;
