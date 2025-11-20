import { db } from '../db.js';
import HuggingFaceService from '../services/huggingface-service.js';

const hfService = new HuggingFaceService();

/**
 * Find clinical studies with similar goals using text search
 */
export async function findSimilarGoals(req, res) {
  try {
    const { query } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        error: 'Query text is required',
      });
    }

    // Generate embedding for the query using HF model
    const queryEmbedding = await hfService.getTextEmbedding(query);

    if (!queryEmbedding) {
      return res.status(500).json({
        error: 'Failed to generate embedding for query',
      });
    }

    // Retrieve trials from database with vector similarity search
    const similarTrials = await performVectorSearch(queryEmbedding);

    res.json({
      results: similarTrials,
    });
  } catch (error) {
    console.error('Error in similar goals search:', error);
    res.status(500).json({
      error: 'An error occurred while searching for similar studies',
    });
  }
}

/**
 * Match specific protocol elements to find similar studies
 */
export async function matchProtocol(req, res) {
  try {
    const { title, description, endpoints, criteria, matchThreshold = 0.7 } = req.body;

    // Create a combined text representation of the protocol
    const protocolText = [
      title || '',
      description || '',
      endpoints ? (Array.isArray(endpoints) ? endpoints.join('\n') : endpoints) : '',
      criteria ? (Array.isArray(criteria) ? criteria.join('\n') : criteria) : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!protocolText.trim()) {
      return res.status(400).json({
        error: 'Protocol details are required',
      });
    }

    // Generate embedding for protocol
    const protocolEmbedding = await hfService.getTextEmbedding(protocolText);

    if (!protocolEmbedding) {
      return res.status(500).json({
        error: 'Failed to generate embedding for protocol',
      });
    }

    // Find similar trials with higher threshold
    const similarTrials = await performVectorSearch(protocolEmbedding, 20, matchThreshold);

    // Extract protocol-specific elements for better matching
    const protocolElements = extractProtocolElements(protocolText);

    // Re-rank results based on additional criteria matching
    const rankedResults = rankProtocolMatches(similarTrials, protocolElements);

    res.json({
      results: rankedResults,
    });
  } catch (error) {
    console.error('Error in protocol matching:', error);
    res.status(500).json({
      error: 'An error occurred while matching protocol',
    });
  }
}

/**
 * Structured search for trials matching specific criteria
 */
export async function structuredSearch(req, res) {
  try {
    const { indication, phase, primaryEndpoint, sampleSize, includePlaceboControl } = req.body;

    // Validate required fields
    if (!indication || !phase) {
      return res.status(400).json({
        error: 'Indication and phase are required for structured search',
      });
    }

    // Build query for database
    let query = `
      SELECT 
        r.id, r.title, r.indication, r.phase, r.status, r.date, 
        r.sponsor, r.summary, r.fileName
      FROM csr_reports r
      JOIN csr_details d ON r.id = d.reportId
      WHERE 1=1
    `;

    const params = [];

    // Add filters
    if (indication) {
      query += ` AND LOWER(r.indication) LIKE $${params.length + 1}`;
      params.push(`%${indication.toLowerCase()}%`);
    }

    if (phase) {
      query += ` AND LOWER(r.phase) LIKE $${params.length + 1}`;
      params.push(`%${phase.toLowerCase()}%`);
    }

    if (primaryEndpoint) {
      // Search in primary_objective and endpoints array
      query += ` AND (
        LOWER(d.primaryObjective) LIKE $${params.length + 1}
        OR d.endpoint_primary LIKE $${params.length + 1}
      )`;
      params.push(`%${primaryEndpoint.toLowerCase()}%`);
    }

    if (sampleSize) {
      // Find trials with similar sample size (±30%)
      const minSize = Math.floor(sampleSize * 0.7);
      const maxSize = Math.ceil(sampleSize * 1.3);

      query += ` AND (
        CAST(d.sampleSize AS INTEGER) BETWEEN $${params.length + 1} AND $${params.length + 2}
      )`;
      params.push(minSize, maxSize);
    }

    if (includePlaceboControl !== undefined) {
      query += ` AND d.placeboControlled = $${params.length + 1}`;
      params.push(includePlaceboControl);
    }

    query += ` ORDER BY r.id DESC LIMIT 25`;

    // Execute query
    const result = await db.query(query, params);

    // Process results
    const trials = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      indication: row.indication,
      phase: row.phase,
      sponsor: row.sponsor,
      date: row.date,
      summary: row.summary,
      matchScore: 0.85, // Default match score for structured search
      fileName: row.fileName,
    }));

    res.json({
      results: trials,
    });
  } catch (error) {
    console.error('Error in structured search:', error);
    res.status(500).json({
      error: 'An error occurred during structured search',
    });
  }
}

/**
 * Helper function to perform vector similarity search
 */
async function performVectorSearch(embedding, limit = 10, threshold = 0.6) {
  try {
    // Query to find trials with similar embeddings using vector similarity
    const query = `
      SELECT 
        r.id, r.title, r.indication, r.phase, r.sponsor, 
        r.date, r.summary, r.fileName,
        d.primaryObjective, d.secondaryObjective, 
        d.sampleSize, d.endpoint_primary AS primaryEndpoint,
        d.endpoint_secondary AS secondaryEndpoints,
        d.inclusionCriteria,
        d.exclusionCriteria,
        1 - (r.embedding <=> $1::vector) AS similarity
      FROM csr_reports r
      LEFT JOIN csr_details d ON r.id = d.reportId
      WHERE r.embedding IS NOT NULL
      AND (1 - (r.embedding <=> $1::vector)) > $2
      ORDER BY similarity DESC
      LIMIT $3
    `;

    const result = await db.query(query, [JSON.stringify(embedding), threshold, limit]);

    // Process and format the results
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      indication: row.indication,
      phase: row.phase,
      sponsor: row.sponsor,
      date: row.date,
      summary: row.summary,
      matchScore: row.similarity,
      primaryObjective: row.primaryobjective,
      secondaryObjective: row.secondaryobjective,
      primaryEndpoints: row.primaryendpoint
        ? Array.isArray(row.primaryendpoint)
          ? row.primaryendpoint
          : [row.primaryendpoint]
        : [],
      secondaryEndpoints: row.secondaryendpoints
        ? Array.isArray(row.secondaryendpoints)
          ? row.secondaryendpoints
          : [row.secondaryendpoints]
        : [],
      sampleSize: row.samplesize,
      inclusionCriteria: row.inclusioncriteria
        ? Array.isArray(row.inclusioncriteria)
          ? row.inclusioncriteria
          : [row.inclusioncriteria]
        : [],
      exclusionCriteria: row.exclusioncriteria
        ? Array.isArray(row.exclusioncriteria)
          ? row.exclusioncriteria
          : [row.exclusioncriteria]
        : [],
      fileName: row.filename,
    }));
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Helper function to calculate cosine similarity between vectors
 */
function calculateCosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0;
  }

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
 * Extract key elements from protocol text
 */
function extractProtocolElements(protocolText) {
  // Simple extraction - in production this would use NER or structured extraction
  const lines = protocolText.split('\n');

  // Extract potential endpoints (lines with typical endpoint keywords)
  const endpoints = lines.filter(
    line =>
      line.toLowerCase().includes('endpoint') ||
      line.toLowerCase().includes('outcome') ||
      line.toLowerCase().includes('survival') ||
      line.toLowerCase().includes('response') ||
      line.toLowerCase().includes('safety') ||
      line.toLowerCase().includes('efficacy')
  );

  // Extract potential inclusion/exclusion criteria
  const criteria = lines.filter(
    line =>
      line.toLowerCase().includes('criteria') ||
      line.toLowerCase().includes('inclusion') ||
      line.toLowerCase().includes('exclusion') ||
      line.toLowerCase().includes('eligible') ||
      line.toLowerCase().includes('ages') ||
      line.toLowerCase().includes('patient')
  );

  return {
    endpoints,
    criteria,
    fullText: protocolText,
  };
}

/**
 * Re-rank matching results based on protocol-specific elements
 */
function rankProtocolMatches(trials, protocolElements) {
  return trials
    .map(trial => {
      let adjustedScore = trial.matchScore;

      // Check for endpoint matches
      if (trial.primaryEndpoints && protocolElements.endpoints.length > 0) {
        for (const endpoint of protocolElements.endpoints) {
          for (const trialEndpoint of trial.primaryEndpoints) {
            if (
              trialEndpoint &&
              endpoint &&
              trialEndpoint.toLowerCase().includes(endpoint.toLowerCase())
            ) {
              adjustedScore += 0.05; // Boost score for endpoint match
            }
          }
        }
      }

      // Check for criteria matches
      if (trial.inclusionCriteria && protocolElements.criteria.length > 0) {
        for (const criteria of protocolElements.criteria) {
          for (const trialCriteria of trial.inclusionCriteria) {
            if (
              trialCriteria &&
              criteria &&
              trialCriteria.toLowerCase().includes(criteria.toLowerCase())
            ) {
              adjustedScore += 0.03; // Boost score for criteria match
            }
          }
        }
      }

      // Cap maximum score at 1.0
      return {
        ...trial,
        matchScore: Math.min(adjustedScore, 1.0),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Register routes with Express app
 */
export function registerSimilarGoalsRoutes(app) {
  app.post('/api/similar-goals', findSimilarGoals);
  app.post('/api/similar-goals/protocol', matchProtocol);
  app.post('/api/similar-goals/structured', structuredSearch);
}

// Export the functions as a module
export default {
  findSimilarGoals,
  matchProtocol,
  structuredSearch,
  registerSimilarGoalsRoutes,
};
