import express from 'express';
import { z } from 'zod';
import semanticEmbeddingService from '../services/semanticEmbeddingService.js';
import { db } from '../db/index.js';
import { documentVectors } from '../../shared/schema.ts';
import { eq, sql } from 'drizzle-orm';

const router = express.Router();

/**
 * Semantic Search API Routes
 * Implements Phase 3 RAG capabilities with pgvector
 */

// Validation schemas
const generateEmbeddingSchema = z.object({
  componentId: z.number().int().positive(),
  organizationId: z.number().int().positive()
});

const generateDocumentEmbeddingsSchema = z.object({
  documentId: z.number().int().positive(),
  organizationId: z.number().int().positive()
});

const semanticSearchSchema = z.object({
  query: z.string().min(1).max(5000),
  organizationId: z.number().int().positive(),
  limit: z.number().int().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7),
  moduleContext: z.string().optional(),
  tags: z.array(z.string()).optional()
});

/**
 * POST /api/semantic/embeddings/component
 * Generate embeddings for a specific component
 */
router.post('/embeddings/component', async (req, res) => {
  try {
    const validation = generateEmbeddingSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      });
    }
    
    const { componentId, organizationId } = validation.data;
    
    const result = await semanticEmbeddingService.generateComponentEmbeddings(
      componentId,
      organizationId
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Error generating component embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/semantic/embeddings/document
 * Generate embeddings for all components in a document
 */
router.post('/embeddings/document', async (req, res) => {
  try {
    // Early null guard for organizationId
    if (!req.body.organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required. Please select an organization from the top navigation bar.'
      });
    }

    const validation = generateDocumentEmbeddingsSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      });
    }
    
    const { documentId, organizationId } = validation.data;
    
    const result = await semanticEmbeddingService.generateDocumentEmbeddings(
      documentId,
      organizationId
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Error generating document embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/semantic/search
 * Perform semantic similarity search
 */
router.post('/search', async (req, res) => {
  try {
    // Early null guard for organizationId
    if (!req.body.organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization ID is required. Please select an organization from the top navigation bar.'
      });
    }

    const validation = semanticSearchSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.errors
      });
    }
    
    const { query, organizationId, limit, threshold, moduleContext, tags } = validation.data;
    
    // Perform semantic search
    const searchResult = await semanticEmbeddingService.semanticSearch(
      query,
      organizationId,
      limit,
      threshold
    );
    
    // Apply additional filters if provided
    if (searchResult.success && (moduleContext || tags)) {
      searchResult.results = searchResult.results.filter(result => {
        if (moduleContext && result.module_context !== moduleContext) {
          return false;
        }
        if (tags && tags.length > 0) {
          const resultTags = result.metadata?.tags || [];
          if (!tags.some(tag => resultTags.includes(tag))) {
            return false;
          }
        }
        return true;
      });
      searchResult.total_results = searchResult.results.length;
    }
    
    res.json(searchResult);
    
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/semantic/embeddings/stats
 * Get statistics about stored embeddings
 */
router.get('/embeddings/stats', async (req, res) => {
  try {
    const organizationId = parseInt(req.query.organizationId);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required'
      });
    }
    
    // Get embedding statistics
    const stats = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT component_id) as unique_components,
        COUNT(*) as total_embeddings,
        AVG(chunk_size) as avg_chunk_size,
        COUNT(DISTINCT module_context) as unique_modules,
        MAX(created_at) as last_embedding_created,
        SUM(access_count) as total_accesses
      FROM document_vectors
      WHERE organization_id = ${organizationId}
    `);
    
    // Get top accessed embeddings
    const topAccessed = await db.execute(sql`
      SELECT 
        dv.id,
        dv.chunk_text,
        dv.access_count,
        dv.module_context,
        c.udi
      FROM document_vectors dv
      LEFT JOIN components c ON dv.component_id = c.id
      WHERE dv.organization_id = ${organizationId}
      ORDER BY dv.access_count DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      statistics: stats[0] || {},
      top_accessed: topAccessed
    });
    
  } catch (error) {
    console.error('Error fetching embedding stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/semantic/embeddings/component/:componentId
 * Delete embeddings for a specific component
 */
router.delete('/embeddings/component/:componentId', async (req, res) => {
  try {
    const componentId = parseInt(req.params.componentId);
    const organizationId = parseInt(req.query.organizationId);
    
    if (!componentId || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'componentId and organizationId are required'
      });
    }
    
    const result = await semanticEmbeddingService.deleteComponentEmbeddings(
      componentId,
      organizationId
    );
    
    res.json(result);
    
  } catch (error) {
    console.error('Error deleting embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/semantic/reindex
 * Reindex all components for an organization (batch operation)
 */
router.post('/reindex', async (req, res) => {
  try {
    const organizationId = parseInt(req.body.organizationId);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required'
      });
    }
    
    // Get all components for the organization
    const components = await db.execute(sql`
      SELECT id FROM components 
      WHERE organization_id = ${organizationId}
      ORDER BY created_at ASC
    `);
    
    const results = {
      total_components: components.length,
      processed: 0,
      failed: 0,
      embeddings_created: 0
    };
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < components.length; i += batchSize) {
      const batch = components.slice(i, i + batchSize);
      
      const batchPromises = batch.map(component => 
        semanticEmbeddingService.generateComponentEmbeddings(
          component.id,
          organizationId
        )
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          results.processed++;
          results.embeddings_created += result.value.embeddings_created || 0;
        } else {
          results.failed++;
        }
      });
    }
    
    res.json({
      success: true,
      ...results
    });
    
  } catch (error) {
    console.error('Error reindexing components:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;