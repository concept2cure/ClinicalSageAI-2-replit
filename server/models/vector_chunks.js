/**
 * Vector Chunks Database Model
 *
 * Production-grade PostgreSQL schema for enhanced vector search
 * with regulatory metadata and intelligent classification.
 */

import { getPool } from '../db.ts';

// Use canonical database connection
const pool = getPool();

/**
 * Initialize vector chunks table with proper indexes
 */
export async function initializeVectorDatabase() {
  const client = await pool.connect();

  try {
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');

    // Create enhanced vector chunks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vector_chunks (
        id SERIAL PRIMARY KEY,
        doc_id VARCHAR(255) NOT NULL,
        doc_title TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        ectd_section VARCHAR(50),
        doc_type VARCHAR(100),
        region_tag TEXT[],
        page_number INTEGER,
        chunk_index INTEGER NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        compliance_score FLOAT DEFAULT 0.0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create drafting tasks table for asynchronous processing
    await client.query(`
      CREATE TABLE IF NOT EXISTS drafting_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id VARCHAR(255) NOT NULL,
        ectd_section VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
        draft_content TEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on project_id and status for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_drafting_tasks_project_id
      ON drafting_tasks(project_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_drafting_tasks_status
      ON drafting_tasks(status)
    `);

    // Create indexes for optimal search performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vector_chunks_embedding
      ON vector_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);

    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_doc_id ON vector_chunks(doc_id)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_ectd_section ON vector_chunks(ectd_section)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_doc_type ON vector_chunks(doc_type)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_region_tag ON vector_chunks USING GIN(region_tag)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_compliance_score ON vector_chunks(compliance_score)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_vector_chunks_upload_date ON vector_chunks(upload_date)'
    );

    console.log('Vector database initialized successfully');
  } catch (error) {
    console.error('Vector database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Insert vector chunks with regulatory metadata
 */
export async function insertVectorChunks(chunks) {
  const client = await pool.connect();

  try {
    const insertQuery = `
      INSERT INTO vector_chunks (
        doc_id, doc_title, content, embedding, ectd_section,
        doc_type, region_tag, page_number, chunk_index,
        compliance_score, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    const results = [];
    for (const chunk of chunks) {
      const result = await client.query(insertQuery, [
        chunk.doc_id,
        chunk.doc_title,
        chunk.content,
        JSON.stringify(chunk.embedding),
        chunk.ectd_section,
        chunk.doc_type,
        chunk.region_tag,
        chunk.page_number,
        chunk.chunk_index,
        chunk.compliance_score || 0.0,
        JSON.stringify(chunk.metadata || {}),
      ]);
      results.push(result.rows[0]);
    }

    return results;
  } catch (error) {
    console.error('Insert vector chunks error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Advanced vector similarity search with regulatory filtering
 */
export async function vectorSimilaritySearch(params) {
  const {
    query_embedding,
    limit = 10,
    similarity_threshold = 0.7,
    ectd_section,
    doc_type,
    region,
    include_metadata = true,
  } = params;

  const client = await pool.connect();

  try {
    let whereConditions = [`(embedding <=> $1) < $2`];
    let queryParams = [JSON.stringify(query_embedding), 1 - similarity_threshold];
    let paramIndex = 3;

    // Add regulatory filters
    if (ectd_section) {
      whereConditions.push(`ectd_section = $${paramIndex}`);
      queryParams.push(ectd_section);
      paramIndex++;
    }

    if (doc_type) {
      whereConditions.push(`doc_type = $${paramIndex}`);
      queryParams.push(doc_type);
      paramIndex++;
    }

    if (region) {
      whereConditions.push(`$${paramIndex} = ANY(region_tag)`);
      queryParams.push(region);
      paramIndex++;
    }

    const searchQuery = `
      SELECT
        id, doc_id, doc_title, content, ectd_section, doc_type,
        region_tag, page_number, chunk_index, compliance_score,
        ${include_metadata ? 'metadata,' : ''}
        (1 - (embedding <=> $1)) as similarity_score,
        upload_date
      FROM vector_chunks
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY embedding <=> $1
      LIMIT $${paramIndex}
    `;

    queryParams.push(limit);

    const result = await client.query(searchQuery, queryParams);

    return {
      results: result.rows,
      total: result.rowCount,
      query_params: params,
    };
  } catch (error) {
    console.error('Vector similarity search error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get document chunks for analysis
 */
export async function getDocumentChunks(docId) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
      SELECT
        id, content, ectd_section, doc_type, region_tag,
        page_number, chunk_index, compliance_score, metadata
      FROM vector_chunks
      WHERE doc_id = $1
      ORDER BY chunk_index
    `,
      [docId]
    );

    return result.rows;
  } catch (error) {
    console.error('Get document chunks error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Calculate regulatory compliance score for document chunks
 */
export async function calculateComplianceScore(docId, submissionType, region) {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `
      SELECT
        AVG(compliance_score) as overall_compliance,
        COUNT(*) as total_chunks,
        COUNT(CASE WHEN compliance_score >= 0.8 THEN 1 END) as high_compliance_chunks,
        COUNT(CASE WHEN compliance_score < 0.5 THEN 1 END) as low_compliance_chunks,
        array_agg(DISTINCT ectd_section) as sections_covered,
        array_agg(DISTINCT doc_type) as document_types
      FROM vector_chunks
      WHERE doc_id = $1
    `,
      [docId]
    );

    const stats = result.rows[0];

    return {
      compliance_score: {
        overall: Math.round(stats.overall_compliance * 100),
        categories: {
          content_quality: Math.round(stats.overall_compliance * 100),
          regulatory_alignment: Math.round(
            (stats.high_compliance_chunks / stats.total_chunks) * 100
          ),
          metadata_completeness: Math.round(
            ((stats.total_chunks - stats.low_compliance_chunks) / stats.total_chunks) * 100
          ),
        },
      },
      statistics: {
        total_chunks: stats.total_chunks,
        high_compliance_chunks: stats.high_compliance_chunks,
        low_compliance_chunks: stats.low_compliance_chunks,
        sections_covered: stats.sections_covered,
        document_types: stats.document_types,
      },
      recommendations: generateComplianceRecommendations(stats, submissionType, region),
    };
  } catch (error) {
    console.error('Calculate compliance score error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Generate compliance recommendations based on analysis
 */
function generateComplianceRecommendations(stats, submissionType, region) {
  const recommendations = [];

  if (stats.overall_compliance < 0.7) {
    recommendations.push({
      priority: 'High',
      action: 'Improve overall document quality and regulatory alignment',
      impact: 'Critical for submission approval',
    });
  }

  if (stats.low_compliance_chunks > stats.total_chunks * 0.2) {
    recommendations.push({
      priority: 'Medium',
      action: 'Review and enhance low-scoring document sections',
      impact: 'May delay regulatory review',
    });
  }

  if (region === 'FDA' && !stats.sections_covered.includes('2.5')) {
    recommendations.push({
      priority: 'High',
      action: 'Include required FDA clinical overview section 2.5',
      impact: 'Mandatory for FDA submissions',
    });
  }

  return recommendations;
}

// Initialize the database when module loads
initializeVectorDatabase().catch(console.error);

/**
 * Create a new drafting task
 */
export async function createDraftingTask(projectId, ectdSection) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      INSERT INTO drafting_tasks (project_id, ectd_section, status)
      VALUES ($1, $2, 'PENDING')
      RETURNING id, project_id, ectd_section, status, created_at
    `,
      [projectId, ectdSection]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Update drafting task status and content
 */
export async function updateDraftingTask(taskId, status, draftContent = null, errorMessage = null) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      UPDATE drafting_tasks
      SET status = $2, draft_content = $3, error_message = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `,
      [taskId, status, draftContent, errorMessage]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Get drafting task by ID
 */
export async function getDraftingTask(taskId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      SELECT * FROM drafting_tasks WHERE id = $1
    `,
      [taskId]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

export { pool };
