/**
 * Embedding Backfill Script for Lumen Cortex
 *
 * Runs embeddings on atoms that don't have them yet.
 * Use with caution - this will consume OpenAI API credits.
 */

import pg from 'pg';
import OpenAI from 'openai';

const BATCH_SIZE = 20;
const MAX_ATOMS = 100; // Limit for this run

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    console.log('═══════════════════════════════════════');
    console.log('     LUMEN CORTEX EMBEDDING BACKFILL');
    console.log('═══════════════════════════════════════\n');

    // Get count of atoms without embeddings
    const { rows: countRows } = await pool.query(`
      SELECT COUNT(*) as count FROM lumen_data_atoms WHERE embedding IS NULL
    `);
    const totalPending = parseInt(countRows[0].count, 10);
    console.log(`📊 Atoms without embeddings: ${totalPending}`);
    console.log(`📊 Processing limit: ${MAX_ATOMS}\n`);

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
        console.log('✅ All atoms have embeddings!');
        break;
      }

      console.log(`Processing batch of ${atoms.length} atoms...`);

      // Build texts for embedding
      const texts = atoms.map(atom => {
        const parts = [];
        if (atom.title) parts.push(`Title: ${atom.title}`);
        if (atom.atom_type) parts.push(`Type: ${atom.atom_type}`);
        parts.push(atom.content?.slice(0, 8000) || '');
        return parts.join('\n\n');
      });

      try {
        // Generate embeddings
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts,
          dimensions: 1536,
        });

        // Update each atom with its embedding
        for (let i = 0; i < atoms.length; i++) {
          const embedding = response.data[i].embedding;
          const embeddingStr = `[${embedding.join(',')}]`;

          await pool.query(
            `
            UPDATE lumen_data_atoms
            SET
              embedding = $1::vector,
              embedding_model = 'text-embedding-3-small',
              embedding_updated_at = NOW()
            WHERE id = $2
          `,
            [embeddingStr, atoms[i].id]
          );
        }

        processed += atoms.length;
        console.log(`  ✅ Embedded ${processed}/${Math.min(MAX_ATOMS, totalPending)} atoms`);
      } catch (batchError) {
        console.error('  ❌ Batch error:', batchError);
        errors += atoms.length;
        processed += atoms.length;
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n═══════════════════════════════════════');
    console.log('         BACKFILL COMPLETE');
    console.log('═══════════════════════════════════════');
    console.log(`   Processed: ${processed}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Remaining: ${totalPending - processed}`);
    console.log('═══════════════════════════════════════\n');
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
