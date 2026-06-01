#!/usr/bin/env node
/**
 * verify-rag-corpus.mjs
 *
 * Reports how populated the RAG corpus actually is: row counts, how many rows
 * carry embeddings, embedding-model/dimension distribution, and document
 * processing status. The point is to answer "is the sophisticated retrieval
 * pipeline pointed at real data, or at empty tables?" — a question the code
 * alone cannot answer.
 *
 * Read-only. Connects with the same env vars as the app
 * (DATABASE_URL | NEON_DATABASE_URL | DATABASE_NEON_NEW_SECRET).
 *
 * Usage:
 *   node scripts/verify-rag-corpus.mjs
 */

import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_NEON_NEW_SECRET;

if (!connectionString) {
  console.error(
    'No database URL found. Set DATABASE_URL, NEON_DATABASE_URL, or DATABASE_NEON_NEW_SECRET.'
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 2 });

/** Run a query, returning rows; on error return null so callers can degrade. */
async function safeQuery(sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    return { __error: err.message };
  }
}

/** True when a table (optionally schema-qualified) exists. */
async function tableExists(qualifiedName) {
  const rows = await safeQuery('SELECT to_regclass($1) AS reg', [qualifiedName]);
  return Array.isArray(rows) && rows[0] && rows[0].reg !== null;
}

function fmt(n) {
  return Number(n).toLocaleString('en-US');
}

async function reportEmbeddingTable(label, table, embeddingCol = 'embedding') {
  if (!(await tableExists(table))) {
    console.log(`  ${label.padEnd(34)} table not present (${table})`);
    return;
  }

  const totalRows = await safeQuery(`SELECT count(*)::bigint AS c FROM ${table}`);
  if (totalRows.__error) {
    console.log(`  ${label.padEnd(34)} error: ${totalRows.__error}`);
    return;
  }
  const total = totalRows[0].c;

  const embedded = await safeQuery(
    `SELECT count(*)::bigint AS c FROM ${table} WHERE ${embeddingCol} IS NOT NULL`
  );
  const embeddedCount = embedded.__error ? 'n/a' : embedded[0].c;

  const pct =
    embeddedCount !== 'n/a' && Number(total) > 0
      ? ` (${((Number(embeddedCount) / Number(total)) * 100).toFixed(1)}%)`
      : '';

  console.log(
    `  ${label.padEnd(34)} rows=${fmt(total).padStart(10)}   embedded=${String(
      embeddedCount === 'n/a' ? 'n/a' : fmt(embeddedCount)
    ).padStart(10)}${pct}`
  );
}

async function main() {
  console.log('\nRAG corpus verification');
  console.log('═'.repeat(72));

  console.log('\nEmbedding-bearing tables:');
  await reportEmbeddingTable('lumen_data_atoms', 'lumen_data_atoms');
  await reportEmbeddingTable('vault.document_chunks', 'vault.document_chunks');
  await reportEmbeddingTable('knowledge_entries', 'knowledge_entries');
  await reportEmbeddingTable('rag_chunks', 'rag_chunks');
  await reportEmbeddingTable('document_vectors', 'document_vectors');
  await reportEmbeddingTable('csr_studies', 'csr_studies');
  await reportEmbeddingTable('csr_sections', 'csr_sections');
  await reportEmbeddingTable('csr_endpoints', 'csr_endpoints');
  await reportEmbeddingTable('academic_embeddings', 'academic_embeddings', 'vector');

  // Embedding model / dimension distribution for the primary atoms table.
  if (await tableExists('lumen_data_atoms')) {
    console.log('\nlumen_data_atoms embedding models:');
    const models = await safeQuery(
      `SELECT COALESCE(embedding_model, '(none)') AS model, count(*)::bigint AS c
         FROM lumen_data_atoms
        GROUP BY 1 ORDER BY 2 DESC`
    );
    if (models.__error) {
      console.log(`  (embedding_model column unavailable: ${models.__error})`);
    } else {
      for (const r of models) console.log(`  ${String(r.model).padEnd(28)} ${fmt(r.c)}`);
    }
  }

  // Vault document processing pipeline status.
  if (await tableExists('vault.documents')) {
    console.log('\nvault.documents processing status:');
    const statuses = await safeQuery(
      `SELECT COALESCE(processing_status::text, '(null)') AS status, count(*)::bigint AS c
         FROM vault.documents
        GROUP BY 1 ORDER BY 2 DESC`
    );
    if (statuses.__error) {
      console.log(`  (unavailable: ${statuses.__error})`);
    } else if (statuses.length === 0) {
      console.log('  no documents');
    } else {
      for (const r of statuses) console.log(`  ${String(r.status).padEnd(28)} ${fmt(r.c)}`);
    }
  }

  console.log('\n' + '═'.repeat(72));
  console.log('Done. "embedded" near zero means the pipeline is retrieving over an empty corpus.\n');
}

main()
  .catch(err => {
    console.error('verify-rag-corpus failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
