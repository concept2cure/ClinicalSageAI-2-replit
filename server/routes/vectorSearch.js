/**
 * Vector Search Routes
 * Enhanced document retrieval with regulatory metadata
 */

import express from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Database connection
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Enhanced vector search with regulatory metadata
 */
router.post('/api/vector-search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Generate embedding for the query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Perform vector similarity search with enhanced metadata
    const result = await dbPool.query(
      `
      SELECT 
        id, doc_id, doc_title, chunk_index, content,
        ectd_section, page_number, doc_type, region_tag,
        embedding <=> $1::vector as similarity_score
      FROM document_chunks 
      ORDER BY embedding <=> $1::vector
      LIMIT 5
    `,
      [JSON.stringify(queryEmbedding)]
    );

    // Format results with enhanced regulatory metadata
    const formattedResults = result.rows.map(row => ({
      doc_id: row.doc_id,
      doc_title: row.doc_title,
      content: row.content,
      chunk_index: row.chunk_index,
      ectd_section: row.ectd_section,
      page_number: row.page_number,
      doc_type: row.doc_type,
      region_tag: row.region_tag,
      similarity_score: row.similarity_score,
    }));

    res.json({
      success: true,
      query,
      results: formattedResults,
      total: formattedResults.length,
    });
  } catch (error) {
    console.error('Vector search error:', error);
    res.status(500).json({
      error: 'Vector search failed',
      details: error.message,
    });
  }
});

/**
 * Health check for vector database
 */
router.get('/api/vector-health', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT COUNT(*) as total FROM document_chunks');
    const totalChunks = result.rows[0].total;

    res.json({
      status: 'healthy',
      total_chunks: parseInt(totalChunks),
      enhanced_schema: true,
      metadata_fields: ['ectd_section', 'page_number', 'doc_type', 'region_tag'],
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

export default router;
