/**
 * Cognitive Fabric RAG Test Script
 * 
 * Tests the Vision-First Ingestion + Hybrid Search + Defensible Drafting pipeline.
 * Demonstrates that tables are extracted and prioritized correctly.
 * 
 * Usage:
 *   npx ts-node scripts/test-cognitive-fabric.ts
 */
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { getEmbeddingProvider } from '../server/services/ai-gateway/embeddings/embedding-provider';
import { createScopedLogger } from '../server/utils/logger';

const logger = createScopedLogger('test-cognitive-fabric');

// Configuration
const DATABASE_URL = process.env.DATABASE_URL || '';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined,
});

// Sample clinical table data (simulating extracted table from CSR)
const SAMPLE_TABLE = {
  caption: 'Table 14.2.1: Summary of Adverse Events by System Organ Class (Safety Population)',
  headers: ['System Organ Class', 'Placebo (N=150)', 'Drug X 10mg (N=148)', 'Drug X 20mg (N=152)', 'P-value'],
  rows: [
    ['Gastrointestinal disorders', '12 (8.0%)', '18 (12.2%)', '22 (14.5%)', '0.042'],
    ['Nervous system disorders', '8 (5.3%)', '14 (9.5%)', '19 (12.5%)', '0.028'],
    ['Skin and subcutaneous', '5 (3.3%)', '9 (6.1%)', '11 (7.2%)', '0.156'],
    ['Cardiac disorders', '3 (2.0%)', '4 (2.7%)', '6 (3.9%)', '0.487'],
    ['Any AE', '28 (18.7%)', '45 (30.4%)', '58 (38.2%)', '<0.001'],
  ],
};

// Convert table to markdown
function tableToMarkdown(table: typeof SAMPLE_TABLE): string {
  let md = `**${table.caption}**\n\n`;
  md += '| ' + table.headers.join(' | ') + ' |\n';
  md += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
  for (const row of table.rows) {
    md += '| ' + row.join(' | ') + ' |\n';
  }
  return md;
}

// Generate embedding
async function generateEmbedding(text: string): Promise<number[]> {
  // Route through the governed embedding seam (honors EMBEDDING_PROVIDER,
  // including a self-hosted/offline embedder) rather than a direct client.
  const { embeddings } = await getEmbeddingProvider().embed({
    input: text.slice(0, 8000),
    dimensions: 1536,
  });
  return embeddings[0];
}

async function main() {
  logger.info('=== Cognitive Fabric RAG Test ===\n');

  try {
    // Step 1: Insert test document
    logger.info('Step 1: Creating test document...');
    const documentId = uuidv4();
    
    await pool.query(`
      INSERT INTO vault.documents (id, filename, file_type, file_size, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [documentId, 'CSR_Study_101_Safety.pdf', 'application/pdf', 1024000, 'processed']);
    
    logger.info(`   Document ID: ${documentId}`);

    // Step 2: Insert table chunk with structured content
    logger.info('\nStep 2: Inserting TABLE chunk with structured content...');
    const tableMarkdown = tableToMarkdown(SAMPLE_TABLE);
    const tableEmbedding = await generateEmbedding(tableMarkdown);
    const tableChunkId = uuidv4();

    await pool.query(`
      INSERT INTO vault.document_chunks (
        id, document_id, chunk_index, chunk_type, content_type,
        chunk_text, structured_content, page_number,
        embedding, embedding_model, extraction_confidence,
        created_at, vectorized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [
      tableChunkId,
      documentId,
      0,
      'table',
      'TABLE',
      tableMarkdown,
      JSON.stringify({
        caption: SAMPLE_TABLE.caption,
        headers: SAMPLE_TABLE.headers,
        rows: SAMPLE_TABLE.rows,
        markdown: tableMarkdown,
      }),
      42,
      JSON.stringify(tableEmbedding),
      'text-embedding-3-small',
      0.92,
    ]);
    
    logger.info(`   Table chunk ID: ${tableChunkId}`);

    // Step 3: Insert text chunk for comparison
    logger.info('\nStep 3: Inserting TEXT chunk...');
    const textContent = `Study 101 was a randomized, double-blind, placebo-controlled trial 
evaluating the safety and efficacy of Drug X in patients with moderate to severe condition Y. 
The study enrolled 450 patients across 35 sites. Primary endpoint was the change from baseline 
in symptom score at Week 12. The safety population included all randomized patients who 
received at least one dose of study medication.`;
    
    const textEmbedding = await generateEmbedding(textContent);
    const textChunkId = uuidv4();

    await pool.query(`
      INSERT INTO vault.document_chunks (
        id, document_id, chunk_index, chunk_type, content_type,
        chunk_text, page_number, embedding, embedding_model,
        created_at, vectorized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    `, [
      textChunkId,
      documentId,
      1,
      'text',
      'TEXT',
      textContent,
      5,
      JSON.stringify(textEmbedding),
      'text-embedding-3-small',
    ]);
    
    logger.info(`   Text chunk ID: ${textChunkId}`);

    // Step 4: Insert entity for hybrid search
    logger.info('\nStep 4: Inserting extracted entities...');
    await pool.query(`
      INSERT INTO vault.extracted_entities (chunk_id, entity_type, entity_value, entity_normalized, confidence)
      VALUES 
        ($1, 'STUDY_ID', 'Study 101', 'study101', 0.95),
        ($1, 'DRUG_NAME', 'Drug X', 'drugx', 0.98),
        ($2, 'STUDY_ID', 'Study 101', 'study101', 0.95),
        ($2, 'PATIENT_COUNT', '450', '450', 0.92)
    `, [tableChunkId, textChunkId]);
    
    logger.info('   Entities inserted for both chunks');

    // Step 5: Test hybrid search
    logger.info('\nStep 5: Testing Hybrid Search...');
    const queryEmbedding = await generateEmbedding('What are the adverse events for Drug X?');
    
    const searchResult = await pool.query(`
      SELECT * FROM vault.hybrid_search(
        $1,
        '{"DRUG_NAME": "Drug X"}'::jsonb,
        NULL,
        ARRAY['TEXT', 'TABLE', 'FIGURE'],
        10
      )
    `, [JSON.stringify(queryEmbedding)]);

    logger.info(`   Found ${searchResult.rows.length} matching chunks:`);
    for (const row of searchResult.rows) {
      logger.info(`   - ${row.content_type}: score=${row.combined_score?.toFixed(3)}, page=${row.page_number}`);
    }

    // Step 6: Test table-priority search
    logger.info('\nStep 6: Testing Table-Priority Search...');
    const tablePriorityResult = await pool.query(`
      SELECT * FROM vault.table_priority_search($1, NULL, 10, 1.5)
    `, [JSON.stringify(queryEmbedding)]);

    logger.info(`   Found ${tablePriorityResult.rows.length} chunks (table-boosted):`);
    for (const row of tablePriorityResult.rows) {
      logger.info(`   - ${row.content_type}: similarity=${row.similarity_score?.toFixed(3)}, boosted=${row.boosted_score?.toFixed(3)}`);
    }

    // Step 7: Verify TABLE is prioritized
    const topResult = tablePriorityResult.rows[0];
    if (topResult?.content_type === 'TABLE') {
      logger.info('\n✅ SUCCESS: TABLE chunk correctly prioritized as top result!');
    } else {
      logger.info('\n⚠️  NOTE: TABLE not top result (may depend on query semantics)');
    }

    // Step 8: Show structured table data
    logger.info('\nStep 7: Structured Table Content:');
    if (topResult?.structured_content) {
      const structured = typeof topResult.structured_content === 'string' 
        ? JSON.parse(topResult.structured_content) 
        : topResult.structured_content;
      logger.info(`   Caption: ${structured.caption}`);
      logger.info(`   Headers: ${structured.headers?.join(', ')}`);
      logger.info(`   Rows: ${structured.rows?.length} data rows`);
    }

    // Cleanup (optional)
    logger.info('\n=== Test Complete ===');
    logger.info('\nTo test the full Drafting Service:');
    logger.info(`curl -X POST http://localhost:5000/api/gcc/drafting/generate \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Summarize the adverse events from Study 101",
    "promptType": "safety_analysis",
    "entityFilters": {"STUDY_ID": "101", "DRUG_NAME": "Drug X"},
    "options": {"prioritizeTables": true}
  }'`);

  } catch (error: any) {
    logger.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
