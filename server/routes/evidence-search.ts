/**
 * Evidence Search API
 * Exposes the existing evidence gathering and semantic search services
 * as HTTP endpoints for the Evidence Search UI.
 */
import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/evidence-search/search
 * Search for evidence across the knowledge base.
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const type = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Try semantic search first
    let results: any[] = [];

    try {
      // Use the semantic search service if available
      const { semanticSearchService } = await import('../services/semantic-search-service');
      if (semanticSearchService) {
        const searchResults = await semanticSearchService.search(query, limit);
        results = (searchResults || []).map((r: any) => ({
          id: r.document?.id || r.id,
          title: r.document?.title || r.title || 'Untitled',
          type: r.document?.type || type || 'document',
          source: 'semantic_search',
          content: r.document?.content?.substring(0, 200) || '',
          relevanceScore: r.score || 0,
        }));
      }
    } catch (err) {
      console.warn('Semantic search unavailable, using basic search:', err);
    }

    // If semantic search returned nothing, try basic text search on vault documents
    if (results.length === 0) {
      try {
        const { db } = await import('../db');
        if (db) {
          // Basic text search on artifacts
          const { concept2cureArtifacts } = await import('../../shared/schema');
          const { ilike, or } = await import('drizzle-orm');

          const artifacts = await db
            .select({
              id: concept2cureArtifacts.artifactId,
              title: concept2cureArtifacts.title,
              type: concept2cureArtifacts.type,
              category: concept2cureArtifacts.category,
              ctdSection: concept2cureArtifacts.ctdSection,
              status: concept2cureArtifacts.status,
              createdAt: concept2cureArtifacts.createdAt,
            })
            .from(concept2cureArtifacts)
            .where(
              or(
                ilike(concept2cureArtifacts.title, `%${query}%`),
                ilike(concept2cureArtifacts.content, `%${query}%`)
              )
            )
            .limit(limit);

          results = artifacts.map(a => ({
            id: a.id,
            title: a.title,
            type: a.type || 'document',
            source: 'concept2cure_artifacts',
            ctdSection: a.ctdSection,
            status: a.status,
            relevanceScore: 0.7,
            createdAt: a.createdAt,
          }));
        }
      } catch (dbErr) {
        console.warn('Database search failed:', dbErr);
      }
    }

    return res.json({
      success: true,
      data: {
        query,
        results,
        total: results.length,
        searchType: results.length > 0 ? 'semantic' : 'basic',
      },
    });
  } catch (error: any) {
    console.error('Evidence search failed:', error);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

/**
 * GET /api/evidence-search/gather/:productId
 * Gather evidence for a specific product/project.
 */
router.get('/gather/:productId', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const sectionCode = req.query.section as string | undefined;

    let evidence: any[] = [];
    try {
      const { gatherEvidence } = await import('../src/services/reg/evidence');
      evidence = await gatherEvidence(productId, sectionCode);
    } catch (err) {
      console.warn('Evidence gathering service unavailable:', err);
    }

    return res.json({
      success: true,
      data: { productId, sectionCode, evidence, count: evidence.length },
    });
  } catch (error: any) {
    console.error('Evidence gathering failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to gather evidence' });
  }
});

export default router;
