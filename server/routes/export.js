import express from 'express';

const router = express.Router();

/**
 * POST /api/export
 * CoAuthor.jsx uses this as a mock "convert document" endpoint.
 */
router.post('/', async (req, res) => {
  try {
    const { format = 'pdf', region = 'US', options = {}, metadata = {} } = req.body || {};

    // Keep response simple and stable: UI only needs response.ok + JSON.
    const exportId = `exp-${Date.now()}`;

    res.json({
      success: true,
      exportId,
      format,
      region,
      options,
      metadata,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

export default router;
