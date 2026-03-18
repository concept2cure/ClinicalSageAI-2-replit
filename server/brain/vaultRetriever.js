/**
 * Vault Retriever Service
 *
 * This module provides functions to retrieve relevant context from indexed documents
 * in the TrialSage Vault using embedding-based similarity search.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_DIR = path.join(__dirname, '../../server/vault');
const METADATA_PATH = path.join(VAULT_DIR, 'metadata.json');
const EMBEDDINGS_DIR = path.join(VAULT_DIR, 'embeddings');

// Cache for document metadata and embeddings
let documentsCache = null;
let embeddingsCache = {};

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    normA += vec1[i] * vec1[i];
    normB += vec2[i] * vec2[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Load document metadata
 */
async function loadDocuments() {
  try {
    if (documentsCache) {
      return documentsCache;
    }

    const metadataContent = await fs.readFile(METADATA_PATH, 'utf-8');
    documentsCache = JSON.parse(metadataContent);
    return documentsCache;
  } catch (err) {
    console.error('Error loading document metadata:', err);
    return { documents: [] };
  }
}

/**
 * Load embeddings for a document
 */
async function loadEmbeddings(docId) {
  try {
    if (embeddingsCache[docId]) {
      return embeddingsCache[docId];
    }

    const embeddingPath = path.join(EMBEDDINGS_DIR, `${docId}.json`);
    const embeddingContent = await fs.readFile(embeddingPath, 'utf-8');
    const embeddings = JSON.parse(embeddingContent);
    embeddingsCache[docId] = embeddings;
    return embeddings;
  } catch (err) {
    console.error(`Error loading embeddings for document ${docId}:`, err);
    return { chunks: [] };
  }
}

/**
 * Retrieve relevant context based on query using vector similarity search
 */
export async function retrieveContext(query, k = 5) {
  try {
    // Import OpenAI for embeddings
    const { getOpenAIClient } = await import('../services/openai-client');
    const { getPool } = await import('../db.ts');

    let openai;
    try {
      openai = getOpenAIClient();
    } catch {
      console.warn('No OpenAI API key found, using fallback');
      return mockRetrieveContext(query, k);
    }
    const pool = getPool();

    try {
      // Generate embedding for query using OpenAI
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query,
      });

      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Use PostgreSQL with pgvector for similarity search
      const result = await pool.query(
        `
        SELECT
          doc_id as "docId",
          doc_title as "docTitle",
          content as text,
          chunk_index as "chunkId",
          ectd_section,
          doc_type,
          1 - (embedding <=> $1::vector) as score
        FROM document_chunks
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
        [JSON.stringify(queryEmbedding), k]
      );

      return result.rows.map(row => ({
        docId: row.docId,
        docTitle: row.docTitle,
        chunkId: row.chunkId,
        text: row.text,
        score: row.score,
        ectdSection: row.ectd_section,
        docType: row.doc_type,
      }));
    } catch (dbError) {
      console.error('Database query error:', dbError);
      return mockRetrieveContext(query, k);
    }
  } catch (err) {
    console.error('Error retrieving context:', err);
    return mockRetrieveContext(query, k);
  }
}

/**
 * Fallback mock retrieval for testing
 */
function mockRetrieveContext(query, k) {
  return [
    {
      docId: 'mock-doc-1',
      chunkId: 'chunk-1',
      text: 'This is a sample context chunk for testing the retrieval system. It contains information about clinical safety data that might be relevant to your query.',
      score: 0.92,
    },
    {
      docId: 'mock-doc-2',
      chunkId: 'chunk-2',
      text: 'Clinical studies must include comprehensive safety assessments, including adverse event monitoring, laboratory evaluations, and vital sign measurements.',
      score: 0.85,
    },
    {
      docId: 'mock-doc-3',
      chunkId: 'chunk-3',
      text: 'The safety profile of the investigational product should be characterized based on preclinical data and any available clinical data from earlier phase studies.',
      score: 0.79,
    },
  ].slice(0, k);
}

export default {
  retrieveContext,
};
