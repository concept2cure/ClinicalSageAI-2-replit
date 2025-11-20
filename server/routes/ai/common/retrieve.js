/**
 * Retrieval API route for TrialSage
 *
 * This module provides an API endpoint to retrieve relevant context from the vault
 * based on similarity search using embeddings.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { OpenAI } = require('openai');

const router = express.Router();

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Path to embeddings file
const EMBEDDINGS_FILE = path.join(__dirname, '../../../brain/embeddings.json');

// Load embeddings
let embeddingsIndex = [];
try {
  if (fs.existsSync(EMBEDDINGS_FILE)) {
    const raw = fs.readFileSync(EMBEDDINGS_FILE, 'utf8');
    embeddingsIndex = JSON.parse(raw);
    console.log(`Loaded ${embeddingsIndex.length} embeddings from ${EMBEDDINGS_FILE}`);
  } else {
    console.warn(`Embeddings file not found at ${EMBEDDINGS_FILE}. Run vaultIndexer.js first.`);
  }
} catch (error) {
  console.error('Error loading embeddings:', error);
}

// Helper: cosine similarity
function cosineSim(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return dot / (magA * magB);
}

/**
 * Retrieves context based on a query
 */
async function retrieveContext(query, k = 5) {
  // Check if embeddings are loaded
  if (embeddingsIndex.length === 0) {
    throw new Error('No embeddings available. Run the indexer first.');
  }

  // 1) Get query embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: query,
  });
  const queryEmb = embeddingResponse.data[0].embedding;

  // 2) Score each chunk
  const scores = embeddingsIndex.map(item => {
    return {
      docId: item.docId,
      chunkId: item.chunkId,
      text: item.text,
      score: cosineSim(queryEmb, item.embedding),
    };
  });

  // 3) Sort and return top-k
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k);
}

/**
 * POST /api/ai/retrieve
 * Body: { query: string, k?: number }
 * Response: [{ docId, chunkId, text, score }, ...]
 */
router.post('/', async (req, res) => {
  try {
    const { query, k } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    const topChunks = await retrieveContext(query, k ?? 5);

    res.json({
      success: true,
      chunks: topChunks,
    });
  } catch (err) {
    console.error('Error in /api/ai/retrieve:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
