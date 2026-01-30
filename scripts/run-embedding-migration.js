#!/usr/bin/env node
/**
 * Run embedding migration
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
  logger.info('Running embedding migration...');

  try {
    // Add embedding columns (1536 dimensions for HNSW compatibility)
    // Note: pgvector HNSW index has 2000 dimension limit, using text-embedding-3-small
    await pool.query(`
      ALTER TABLE lumen_data_atoms
      ADD COLUMN IF NOT EXISTS embedding vector(1536),
      ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'text-embedding-3-small',
      ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP WITH TIME ZONE
    `);
    logger.info('✅ Added embedding columns (1536d for HNSW compatibility)');

    // Create HNSW index for fast similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lumen_atoms_embedding_hnsw
      ON lumen_data_atoms
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    logger.info('✅ Created HNSW index');

    // Create null embedding index for backfill
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lumen_atoms_embedding_null
      ON lumen_data_atoms (created_at)
      WHERE embedding IS NULL
    `);
    logger.info('✅ Created backfill index');

    // Create embedding jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS embedding_generation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        target_table TEXT NOT NULL DEFAULT 'lumen_data_atoms',
        filter_criteria JSONB,
        total_records INTEGER DEFAULT 0,
        processed_records INTEGER DEFAULT 0,
        failed_records INTEGER DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        model_name TEXT NOT NULL DEFAULT 'text-embedding-3-large',
        batch_size INTEGER DEFAULT 100,
        last_error TEXT,
        error_details JSONB,
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    logger.info('✅ Created embedding_generation_jobs table');

    // Verify columns
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lumen_data_atoms' AND column_name LIKE 'embedding%'
    `);
    logger.info('✅ Embedding columns verified:', cols.rows.map(r => r.column_name).join(', '));

    // Check atoms without embeddings
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) as with_embedding,
        COUNT(*) - COUNT(embedding) as without_embedding
      FROM lumen_data_atoms
    `);
    logger.info(
      `📊 Atoms: ${stats.rows[0].total} total, ${stats.rows[0].without_embedding} need embeddings`
    );
  } catch (error) {
    logger.error('Migration error:', error.message);
  }

  await pool.end();
}

runMigration();
