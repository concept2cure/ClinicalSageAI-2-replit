/**
 * Embedding Backfill Script for Lumen Cortex
 *
 * Runs embeddings on atoms that don't have them yet. Routes through the governed
 * embedding seam (server/services/ai-gateway/embeddings) rather than a direct
 * OpenAI client, so the backfill honors EMBEDDING_PROVIDER — including a
 * self-hosted/offline embedder — and is not a gateway bypass.
 */

import pg from 'pg';
import { getEmbeddingProvider } from '../server/services/ai-gateway/embeddings/embedding-provider';
import { createScopedLogger } from '../server/utils/logger';

const logger = createScopedLogger('embed-atoms');

const BATCH_SIZE = 20;
const MAX_ATOMS = 100; // Limit for this run
const EMBEDDING_DIMENSIONS = 1536; // must match the lumen_data_atoms pgvector corpus

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  // Resolve the configured embedding provider (OpenAI by default; a self-hosted
  // OpenAI-compatible endpoint when EMBEDDING_PROVIDER=local). Auth/config errors
  // surface at call time, not here.
  const provider = getEmbeddingProvider();

  try {
    logger.info('═══════════════════════════════════════');
    logger.info('     LUMEN CORTEX EMBEDDING BACKFILL');
    logger.info('═══════════════════════════════════════\n');

    // Get count of atoms without embeddings
    const { rows: countRows } = await pool.query(`
      SELECT COUNT(*) as count FROM lumen_data_atoms WHERE embedding IS NULL
    `);
    const totalPending = parseInt(countRows[0].count, 10);
    logger.info(`📊 Atoms without embeddings: ${totalPending}`);
    logger.info(`📊 Processing limit: ${MAX_ATOMS}\n`);

    let processed = 0;
    let errors = 0;

    while (processed < MAX_ATOMS) {
      // Get batch of atoms without embeddings
      const { rows: atoms } = await pool.query(
        `
        SELECT id, content, title, atom_type
        FROM lumen_data_atoms
        WHERE embedding IS NULL
        ORDER BY created_at ASC
        LIMIT $1
      `,
        [BATCH_SIZE]
      );

      if (atoms.length === 0) {
        logger.info('✅ All atoms have embeddings!');
        break;
      }

      logger.info(`Processing batch of ${atoms.length} atoms...`);

      // Build texts for embedding
      const texts = atoms.map(atom => {
        const parts = [];
        if (atom.title) parts.push(`Title: ${atom.title}`);
        if (atom.atom_type) parts.push(`Type: ${atom.atom_type}`);
        parts.push(atom.content?.slice(0, 8000) || '');
        return parts.join('\n\n');
      });

      try {
        // Generate embeddings via the governed seam.
        const { embeddings, model } = await provider.embed({
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS,
        });

        // Update each atom with its embedding (record the model actually used).
        for (let i = 0; i < atoms.length; i++) {
          const embeddingStr = `[${embeddings[i].join(',')}]`;

          await pool.query(
            `
            UPDATE lumen_data_atoms
            SET
              embedding = $1::vector,
              embedding_model = $2,
              embedding_updated_at = NOW()
            WHERE id = $3
          `,
            [embeddingStr, model, atoms[i].id]
          );
        }

        processed += atoms.length;
        logger.info(`  ✅ Embedded ${processed}/${Math.min(MAX_ATOMS, totalPending)} atoms`);
      } catch (batchError) {
        logger.error('  ❌ Batch error:', batchError);
        errors += atoms.length;
        processed += atoms.length;
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info('\n═══════════════════════════════════════');
    logger.info('         BACKFILL COMPLETE');
    logger.info('═══════════════════════════════════════');
    logger.info(`   Processed: ${processed}`);
    logger.info(`   Errors: ${errors}`);
    logger.info(`   Remaining: ${totalPending - processed}`);
    logger.info('═══════════════════════════════════════\n');
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
