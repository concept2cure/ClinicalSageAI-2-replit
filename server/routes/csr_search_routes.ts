// CSR Search API Routes
// Direct implementation of CSR search functionality in Express

import { Router, Request, Response } from 'express';
import { csrSearchService } from '../services/csr-search-service';

const router = Router();

// Initialize CSR Search Service when the server starts
(async () => {
  await csrSearchService.initialize();
})();

// Fast in-memory search endpoint
router.get('/fast-query', async (req: Request, res: Response) => {
  try {
    const { query_text, indication, phase, outcome, min_sample_size, limit } = req.query;

    const results = await csrSearchService.searchCSRs({
      query_text: query_text as string,
      indication: indication as string,
      phase: phase as string,
      outcome: outcome as string,
      min_sample_size: min_sample_size ? parseInt(min_sample_size as string) : undefined,
      limit: limit ? parseInt(limit as string) : 10,
    });

    res.json({
      csrs: results.csrs,
      results_count: results.results_count,
      search_type: 'fast',
    });
  } catch (error: any) {
    console.error('Error in fast CSR search:', error);

    // If OpenAI quota exceeded, return basic search results
    if (error.status === 429 || error.code === 'insufficient_quota') {
      console.log('OpenAI quota exceeded, returning basic search results');

      // Return basic results from the 779 CSRs in memory
      const basicResults = csrSearchService.getBasicResults(
        query_text as string,
        parseInt(limit as string) || 10
      );

      res.json({
        csrs: basicResults.csrs,
        results_count: basicResults.results_count,
        search_type: 'basic_fallback',
        message: 'Basic search results (AI features temporarily unavailable)',
      });
    } else {
      res.status(500).json({
        error: 'Search failed',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
});

// Standard search endpoint (same implementation, kept for API compatibility)
router.get('/query', async (req: Request, res: Response) => {
  try {
    const { query_text, indication, phase, outcome, min_sample_size, limit } = req.query;

    const results = await csrSearchService.searchCSRs({
      query_text: query_text as string,
      indication: indication as string,
      phase: phase as string,
      outcome: outcome as string,
      min_sample_size: min_sample_size ? parseInt(min_sample_size as string) : undefined,
      limit: limit ? parseInt(limit as string) : 10,
    });

    res.json({
      csrs: results.csrs,
      results_count: results.results_count,
      search_type: 'standard',
    });
  } catch (error: any) {
    console.error('Error in standard CSR search:', error);

    // If OpenAI quota exceeded, return basic search results
    if (error.status === 429 || error.code === 'insufficient_quota') {
      console.log('OpenAI quota exceeded, returning basic search results');

      // Return basic results from the 779 CSRs in memory
      const basicResults = csrSearchService.getBasicResults(
        query_text as string,
        parseInt(limit as string) || 10
      );

      res.json({
        csrs: basicResults.csrs,
        results_count: basicResults.results_count,
        search_type: 'basic_fallback',
        message: 'Basic search results (AI features temporarily unavailable)',
      });
    } else {
      res.status(500).json({
        error: 'Search failed',
        message: error.message || 'An unexpected error occurred',
      });
    }
  }
});

// Get CSR by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const csr = await csrSearchService.getCSRById(id);

    if (!csr) {
      return res.status(404).json({
        error: 'Not found',
        message: `CSR with ID ${id} not found`,
      });
    }

    res.json(csr);
  } catch (error: any) {
    console.error(`Error getting CSR ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Retrieval failed',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

// Get CSR stats
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const stats = await csrSearchService.getStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Error getting CSR stats:', error);
    res.status(500).json({
      error: 'Stats retrieval failed',
      message: error.message || 'An unexpected error occurred',
    });
  }
});

export const csrSearchRouter = router;
