/**
 * Evidence Vault API Routes
 *
 * S3-backed document storage with vectorization pipeline for semantic search.
 * Supports hybrid search combining full-text and vector similarity.
 */
import { Router, Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getRequestDbClient } from '../../middleware/tenantContext';
import auditService from '../../services/auditService';

const router = Router();

type Queryable = Pool | PoolClient;

const isPool = (db: Queryable): db is Pool => 'connect' in db;

// File upload configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

/**
 * POST /api/vault/documents
 * Upload a document to the Evidence Vault
 */
router.post('/documents', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const { programId, projectId, title, documentType, classification, tags } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    if (!programId || !title) {
      return res.status(400).json({ success: false, error: 'programId and title are required' });
    }

    // Generate S3 key
    const s3Key = `vault/${programId}/${projectId || 'general'}/${uuidv4()}/${file.originalname}`;

    // Insert document record (S3 upload would happen here in production)
    const result = await dbClient.query(
      `
      INSERT INTO vault.documents (
        program_id, project_id, title, document_type, classification,
        file_name, file_type, file_size, s3_bucket, s3_key, s3_version,
        checksum_sha256, tags, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        encode(sha256($12::bytea), 'hex'), $13, $14
      ) RETURNING *
    `,
      [
        programId,
        projectId || null,
        title,
        documentType || 'general',
        classification || 'internal',
        file.originalname,
        file.mimetype,
        file.size,
        process.env.S3_BUCKET || 'clinical-sage-vault',
        s3Key,
        '1',
        file.buffer,
        tags ? JSON.parse(tags) : null,
        req.body.userId || null,
      ]
    );

    // Queue for vectorization
    await dbClient.query(
      `
      INSERT INTO vault.processing_queue (document_id, processing_type, priority)
      VALUES ($1, 'vectorize', 'normal')
    `,
      [result.rows[0].id]
    );

    void auditService.logAction({
      tenantId: (req as any).user?.organizationId ?? null,
      userId: (req as any).user?.id ?? null,
      action: 'vault.upload',
      resourceType: 'vault_document',
      resourceId: String(result.rows[0].id),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        programId: programId ?? null,
        projectId: projectId ?? null,
        title,
        documentType: documentType ?? null,
        classification: classification ?? null,
        size: file.size,
        mime: file.mimetype,
      },
    });

    res.status(201).json({
      success: true,
      document: result.rows[0],
      message: 'Document uploaded and queued for vectorization',
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/vault/documents
 * List documents with filtering
 */
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const {
      programId,
      projectId,
      documentType,
      classification,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (programId) {
      whereClause += ` AND program_id = $${paramIndex++}`;
      params.push(programId);
    }
    if (projectId) {
      whereClause += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    if (documentType) {
      whereClause += ` AND document_type = $${paramIndex++}`;
      params.push(documentType);
    }
    if (classification) {
      whereClause += ` AND classification = $${paramIndex++}`;
      params.push(classification);
    }
    if (search) {
      whereClause += ` AND (title ILIKE $${paramIndex} OR content_text ILIKE $${paramIndex++})`;
      params.push(`%${search}%`);
    }

    params.push(limit, offset);

    const result = await dbClient.query(
      `
      SELECT
        id, program_id, project_id, title, document_type, classification,
        file_name, file_type, file_size, version, status,
        is_vectorized, chunk_count, tags, created_at, updated_at
      FROM vault.documents
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `,
      params
    );

    const countResult = await dbClient.query(
      `
      SELECT COUNT(*) as total FROM vault.documents ${whereClause}
    `,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      documents: result.rows,
    });
  } catch (error: any) {
    console.error('Error listing documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/vault/documents/:id
 * Get document details
 */
router.get('/documents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { includeChunks = 'false' } = req.query;
    const dbClient = getRequestDbClient(req);

    const result = await dbClient.query(
      `
      SELECT * FROM vault.documents WHERE id = $1
    `,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const document = result.rows[0];

    if (includeChunks === 'true' && document.is_vectorized) {
      const chunksResult = await dbClient.query(
        `
        SELECT id, chunk_index, content, token_count, page_number, section_reference
        FROM vault.document_chunks
        WHERE document_id = $1
        ORDER BY chunk_index
      `,
        [id]
      );
      document.chunks = chunksResult.rows;
    }

    res.json({ success: true, document });
  } catch (error: any) {
    console.error('Error fetching document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/vault/search/semantic
 * Semantic search using vector embeddings
 */
router.post('/search/semantic', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const { query, embedding, programId, limit = 10, threshold = 0.7 } = req.body;

    if (!embedding || !Array.isArray(embedding)) {
      return res.status(400).json({
        success: false,
        error: 'embedding array is required (1536 dimensions)',
      });
    }

    const result = await dbClient.query(
      `
      SELECT * FROM vault.semantic_search($1::vector(1536), $2, $3, $4::float)
    `,
      [JSON.stringify(embedding), programId || null, limit, threshold]
    );

    // Log the search
    await dbClient.query(
      `
      INSERT INTO vault.search_queries (query_text, query_type, program_id, result_count, execution_ms)
      VALUES ($1, 'semantic', $2, $3, 0)
    `,
      [query, programId, result.rowCount]
    );

    res.json({
      success: true,
      query,
      resultCount: result.rowCount,
      results: result.rows,
    });
  } catch (error: any) {
    console.error('Error in semantic search:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/vault/search/fulltext
 * Full-text search using PostgreSQL tsvector
 */
router.post('/search/fulltext', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const { query, programId, limit = 20 } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const result = await dbClient.query(
      `
      SELECT * FROM vault.full_text_search($1, $2, $3)
    `,
      [query, programId || null, limit]
    );

    // Log the search
    await dbClient.query(
      `
      INSERT INTO vault.search_queries (query_text, query_type, program_id, result_count, execution_ms)
      VALUES ($1, 'fulltext', $2, $3, 0)
    `,
      [query, programId, result.rowCount]
    );

    res.json({
      success: true,
      query,
      resultCount: result.rowCount,
      results: result.rows,
    });
  } catch (error: any) {
    console.error('Error in full-text search:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/vault/search/hybrid
 * Hybrid search combining semantic and full-text
 */
router.post('/search/hybrid', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const {
      query,
      embedding,
      programId,
      limit = 10,
      semanticWeight = 0.7,
      fulltextWeight = 0.3,
    } = req.body;

    if (!query || !embedding) {
      return res.status(400).json({
        success: false,
        error: 'query and embedding are required',
      });
    }

    const result = await dbClient.query(
      `
      SELECT * FROM vault.hybrid_search(
        $1, $2::vector(1536), $3, $4, $5::float, $6::float
      )
    `,
      [query, JSON.stringify(embedding), programId || null, limit, semanticWeight, fulltextWeight]
    );

    // Log the search
    await dbClient.query(
      `
      INSERT INTO vault.search_queries (query_text, query_type, program_id, result_count, execution_ms)
      VALUES ($1, 'hybrid', $2, $3, 0)
    `,
      [query, programId, result.rowCount]
    );

    res.json({
      success: true,
      query,
      resultCount: result.rowCount,
      weights: { semantic: semanticWeight, fulltext: fulltextWeight },
      results: result.rows,
    });
  } catch (error: any) {
    console.error('Error in hybrid search:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/vault/queue
 * Get documents pending vectorization
 */
router.get('/queue', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const { status = 'pending', limit = 50 } = req.query;

    const result = await dbClient.query(
      `
      SELECT
        pq.*,
        d.title,
        d.file_name,
        d.file_size
      FROM vault.processing_queue pq
      JOIN vault.documents d ON d.id = pq.document_id
      WHERE pq.status = $1
      ORDER BY
        CASE pq.priority
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        pq.created_at
      LIMIT $2
    `,
      [status, limit]
    );

    res.json({
      success: true,
      count: result.rowCount,
      queue: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/vault/documents/:id/chunks
 * Store document chunks after vectorization
 */
router.post('/documents/:id/chunks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { chunks } = req.body;
    const db = getRequestDbClient(req);

    if (!chunks || !Array.isArray(chunks)) {
      return res.status(400).json({ success: false, error: 'chunks array is required' });
    }

    const client = isPool(db) ? await db.connect() : db;
    const ownsClient = isPool(db);
    try {
      await client.query('BEGIN');

      // Delete existing chunks
      await client.query('DELETE FROM vault.document_chunks WHERE document_id = $1', [id]);

      // Insert new chunks
      for (const chunk of chunks) {
        await client.query(
          `
          INSERT INTO vault.document_chunks (
            document_id, chunk_index, content, embedding,
            token_count, page_number, section_reference
          ) VALUES ($1, $2, $3, $4::vector(1536), $5, $6, $7)
        `,
          [
            id,
            chunk.index,
            chunk.content,
            chunk.embedding ? JSON.stringify(chunk.embedding) : null,
            chunk.tokenCount || 0,
            chunk.pageNumber || null,
            chunk.sectionReference || null,
          ]
        );
      }

      // Update document status
      await client.query(
        `
        UPDATE vault.documents
        SET is_vectorized = true, chunk_count = $1, updated_at = NOW()
        WHERE id = $2
      `,
        [chunks.length, id]
      );

      // Mark queue item as completed
      await client.query(
        `
        UPDATE vault.processing_queue
        SET status = 'completed', completed_at = NOW()
        WHERE document_id = $1 AND status = 'processing'
      `,
        [id]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        documentId: id,
        chunksStored: chunks.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      if (ownsClient) {
        client.release();
      }
    }
  } catch (error: any) {
    console.error('Error storing chunks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/vault/stats
 * Get vault statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const result = await dbClient.query(`
      SELECT
        (SELECT COUNT(*) FROM vault.documents) as total_documents,
        (SELECT COUNT(*) FROM vault.documents WHERE is_vectorized = true) as vectorized_documents,
        (SELECT COUNT(*) FROM vault.document_chunks) as total_chunks,
        (SELECT COALESCE(SUM(file_size), 0) FROM vault.documents) as total_bytes,
        (SELECT COUNT(*) FROM vault.processing_queue WHERE status = 'pending') as pending_jobs,
        (SELECT COUNT(*) FROM vault.processing_queue WHERE status = 'processing') as processing_jobs,
        (SELECT COUNT(*) FROM vault.search_queries WHERE created_at > NOW() - INTERVAL '24 hours') as searches_24h
    `);

    res.json({
      success: true,
      stats: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error fetching vault stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/vault/documents/:id/vectorize
 * Manually trigger vectorization for a document
 */
router.post('/documents/:id/vectorize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority = 'high' } = req.body;
    const dbClient = getRequestDbClient(req);

    // Check if document exists
    const docResult = await dbClient.query(
      `
      SELECT id, title, is_vectorized FROM vault.documents WHERE id = $1
    `,
      [id]
    );

    if (docResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Add to processing queue
    await dbClient.query(
      `
      INSERT INTO vault.processing_queue (document_id, processing_type, priority)
      VALUES ($1, 'vectorize', $2)
      ON CONFLICT (document_id) WHERE status = 'pending' DO UPDATE SET priority = $2
    `,
      [id, priority]
    );

    res.json({
      success: true,
      message: 'Document queued for vectorization',
      documentId: id,
      priority,
    });
  } catch (error: any) {
    console.error('Error queueing vectorization:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/vault/worker/status
 * Get vectorization worker status
 */
router.get('/worker/status', async (req: Request, res: Response) => {
  try {
    const dbClient = getRequestDbClient(req);
    const result = await dbClient.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        MAX(completed_at) as last_completed,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_processing_seconds
      FROM vault.processing_queue
    `);

    res.json({
      success: true,
      status: result.rows[0],
    });
  } catch (error: any) {
    console.error('Error fetching worker status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
