
import { Router } from 'express';
import { foresightRAG } from '../services/foresight-rag-service';

const router = Router();

/**
 * POST /api/foresight/rag/query
 * Query the RAG system
 */
router.post('/query', async (req, res) => {
  try {
    const { query, context, maxTokens, temperature } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await foresightRAG.query({
      query,
      context,
      maxTokens,
      temperature,
    });

    res.json(result);
  } catch (error: any) {
    console.error('[ForesightRAG API] Error:', error);
    res.status(500).json({ 
      error: 'Failed to process RAG query',
      message: error.message 
    });
  }
});

/**
 * POST /api/foresight/rag/report
 * Generate regulatory intelligence report
 */
router.post('/report', async (req, res) => {
  try {
    const { topic, docType } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const report = await foresightRAG.generateReport(topic, docType);

    res.json({ report });
  } catch (error: any) {
    console.error('[ForesightRAG API] Report error:', error);
    res.status(500).json({ 
      error: 'Failed to generate report',
      message: error.message 
    });
  }
});

export default router;
