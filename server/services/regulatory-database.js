/**
 * Regulatory Database Service
 *
 * This service provides access to comprehensive regulatory data across global authorities,
 * including regulations, guidance documents, standards, and submission requirements.
 * It serves as the central knowledge base for the TrialSage platform's regulatory intelligence.
 */

import { db } from '../db.js';
import { ai } from '../lib/unified-ai-client';

// Initialize OpenAI client
// Cache for regulatory data
const regulationCache = new Map();
const guidanceCache = new Map();
const standardsCache = new Map();

/**
 * Get regulations by regulatory authority
 * @param {string} authority - Regulatory authority code
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Regulations data
 */
export async function getRegulationsByAuthority(authority, options = {}) {
  const cacheKey = `${authority}-${JSON.stringify(options)}`;

  // Check cache first
  if (regulationCache.has(cacheKey)) {
    return regulationCache.get(cacheKey);
  }

  try {
    // Build query based on options
    let query = `
      SELECT r.*, a.name as authority_name
      FROM regulations r
      JOIN regulatory_authorities a ON r.authority = a.code
      WHERE r.authority = $1
    `;

    const queryParams = [authority];

    // Add filters
    if (options.category) {
      query += ' AND r.category = $2';
      queryParams.push(options.category);
    }

    if (options.effectiveDate) {
      query += ' AND r.effective_date <= $' + (queryParams.length + 1);
      queryParams.push(options.effectiveDate);
    }

    // Add sorting
    query += ' ORDER BY r.effective_date DESC, r.name';

    // Add limit if specified
    if (options.limit) {
      query += ' LIMIT $' + (queryParams.length + 1);
      queryParams.push(options.limit);
    }

    const result = await db.query(query, queryParams);

    // Cache the results
    regulationCache.set(cacheKey, result.rows);

    return result.rows;
  } catch (error) {
    console.error(`Error getting regulations for authority ${authority}:`, error);
    throw error;
  }
}

/**
 * Get regulatory guidance documents
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Guidance documents
 */
export async function getRegulatoryGuidance(options = {}) {
  const cacheKey = JSON.stringify(options);

  // Check cache first
  if (guidanceCache.has(cacheKey)) {
    return guidanceCache.get(cacheKey);
  }

  try {
    // Build query based on options
    let query = `
      SELECT g.*, a.name as authority_name
      FROM guidance_documents g
      JOIN regulatory_authorities a ON g.authority = a.code
      WHERE 1=1
    `;

    const queryParams = [];

    // Add filters
    if (options.authority) {
      queryParams.push(options.authority);
      query += ` AND g.authority = $${queryParams.length}`;
    }

    if (options.category) {
      queryParams.push(options.category);
      query += ` AND g.category = $${queryParams.length}`;
    }

    if (options.topic) {
      queryParams.push(`%${options.topic}%`);
      query += ` AND (g.title ILIKE $${queryParams.length} OR g.description ILIKE $${queryParams.length})`;
    }

    if (options.publishedAfter) {
      queryParams.push(options.publishedAfter);
      query += ` AND g.published_date >= $${queryParams.length}`;
    }

    // Add sorting
    query += ' ORDER BY g.published_date DESC';

    // Add limit if specified
    if (options.limit) {
      queryParams.push(options.limit);
      query += ` LIMIT $${queryParams.length}`;
    }

    const result = await db.query(query, queryParams);

    // Cache the results
    guidanceCache.set(cacheKey, result.rows);

    return result.rows;
  } catch (error) {
    console.error('Error getting regulatory guidance:', error);
    throw error;
  }
}

/**
 * Get regulatory standards
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Standards data
 */
export async function getRegulatoryStandards(options = {}) {
  const cacheKey = JSON.stringify(options);

  // Check cache first
  if (standardsCache.has(cacheKey)) {
    return standardsCache.get(cacheKey);
  }

  try {
    // Build query based on options
    let query = `
      SELECT s.*, o.name as organization_name
      FROM regulatory_standards s
      JOIN standards_organizations o ON s.organization = o.code
      WHERE 1=1
    `;

    const queryParams = [];

    // Add filters
    if (options.organization) {
      queryParams.push(options.organization);
      query += ` AND s.organization = $${queryParams.length}`;
    }

    if (options.category) {
      queryParams.push(options.category);
      query += ` AND s.category = $${queryParams.length}`;
    }

    if (options.status) {
      queryParams.push(options.status);
      query += ` AND s.status = $${queryParams.length}`;
    }

    // Add sorting
    query += ' ORDER BY s.effective_date DESC';

    // Add limit if specified
    if (options.limit) {
      queryParams.push(options.limit);
      query += ` LIMIT $${queryParams.length}`;
    }

    const result = await db.query(query, queryParams);

    // Cache the results
    standardsCache.set(cacheKey, result.rows);

    return result.rows;
  } catch (error) {
    console.error('Error getting regulatory standards:', error);
    throw error;
  }
}

/**
 * Get submission requirements for a specific authority and product type
 * @param {string} authority - Regulatory authority code
 * @param {string} productType - Product type code
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Submission requirements
 */
export async function getSubmissionRequirements(authority, productType, options = {}) {
  try {
    // Get requirements from database
    const requirementsQuery = await db.query(
      `
      SELECT r.*, a.name as authority_name, pt.name as product_type_name
      FROM submission_requirements r
      JOIN regulatory_authorities a ON r.authority = a.code
      JOIN product_types pt ON r.product_type = pt.code
      WHERE r.authority = $1 AND r.product_type = $2
    `,
      [authority, productType]
    );

    if (requirementsQuery.rows.length === 0) {
      return null;
    }

    // Get sections and documents
    const sectionsQuery = await db.query(
      `
      SELECT s.*, dt.name as document_type_name
      FROM submission_sections s
      LEFT JOIN document_types dt ON s.document_type = dt.code
      WHERE s.authority = $1 AND s.product_type = $2
      ORDER BY s.sequence
    `,
      [authority, productType]
    );

    // Structure the response
    const requirements = requirementsQuery.rows[0];
    requirements.sections = sectionsQuery.rows;

    return requirements;
  } catch (error) {
    console.error(`Error getting submission requirements for ${authority}/${productType}:`, error);
    throw error;
  }
}

/**
 * Search regulatory database
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results
 */
export async function searchRegulatoryDatabase(query, options = {}) {
  try {
    // Normalize options
    const searchOptions = {
      includeRegulations: options.includeRegulations !== false,
      includeGuidance: options.includeGuidance !== false,
      includeStandards: options.includeStandards !== false,
      includeRequirements: options.includeRequirements !== false,
      limit: options.limit || 50,
      authority: options.authority || null,
    };

    const results = {
      regulations: [],
      guidance: [],
      standards: [],
      requirements: [],
    };

    // Search regulations
    if (searchOptions.includeRegulations) {
      const regulationsQuery = `
        SELECT r.*, a.name as authority_name, 
               ts_rank(to_tsvector('english', r.name || ' ' || r.description), plainto_tsquery('english', $1)) as rank
        FROM regulations r
        JOIN regulatory_authorities a ON r.authority = a.code
        WHERE to_tsvector('english', r.name || ' ' || r.description) @@ plainto_tsquery('english', $1)
        ${searchOptions.authority ? 'AND r.authority = $2' : ''}
        ORDER BY rank DESC
        LIMIT $${searchOptions.authority ? '3' : '2'}
      `;

      const regulationsParams = [query];
      if (searchOptions.authority) {
        regulationsParams.push(searchOptions.authority);
      }
      regulationsParams.push(searchOptions.limit);

      const regulationsResult = await db.query(regulationsQuery, regulationsParams);
      results.regulations = regulationsResult.rows;
    }

    // Search guidance
    if (searchOptions.includeGuidance) {
      const guidanceQuery = `
        SELECT g.*, a.name as authority_name,
               ts_rank(to_tsvector('english', g.title || ' ' || g.description), plainto_tsquery('english', $1)) as rank
        FROM guidance_documents g
        JOIN regulatory_authorities a ON g.authority = a.code
        WHERE to_tsvector('english', g.title || ' ' || g.description) @@ plainto_tsquery('english', $1)
        ${searchOptions.authority ? 'AND g.authority = $2' : ''}
        ORDER BY rank DESC
        LIMIT $${searchOptions.authority ? '3' : '2'}
      `;

      const guidanceParams = [query];
      if (searchOptions.authority) {
        guidanceParams.push(searchOptions.authority);
      }
      guidanceParams.push(searchOptions.limit);

      const guidanceResult = await db.query(guidanceQuery, guidanceParams);
      results.guidance = guidanceResult.rows;
    }

    // Search standards
    if (searchOptions.includeStandards) {
      const standardsQuery = `
        SELECT s.*, o.name as organization_name,
               ts_rank(to_tsvector('english', s.name || ' ' || s.description), plainto_tsquery('english', $1)) as rank
        FROM regulatory_standards s
        JOIN standards_organizations o ON s.organization = o.code
        WHERE to_tsvector('english', s.name || ' ' || s.description) @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2
      `;

      const standardsResult = await db.query(standardsQuery, [query, searchOptions.limit]);
      results.standards = standardsResult.rows;
    }

    // Search requirements (more complex, simplified here)
    if (searchOptions.includeRequirements) {
      const requirementsQuery = `
        SELECT r.id, r.authority, r.product_type, a.name as authority_name, pt.name as product_type_name,
               ts_rank(to_tsvector('english', r.description), plainto_tsquery('english', $1)) as rank
        FROM submission_requirements r
        JOIN regulatory_authorities a ON r.authority = a.code
        JOIN product_types pt ON r.product_type = pt.code
        WHERE to_tsvector('english', r.description) @@ plainto_tsquery('english', $1)
        ${searchOptions.authority ? 'AND r.authority = $2' : ''}
        ORDER BY rank DESC
        LIMIT $${searchOptions.authority ? '3' : '2'}
      `;

      const requirementsParams = [query];
      if (searchOptions.authority) {
        requirementsParams.push(searchOptions.authority);
      }
      requirementsParams.push(searchOptions.limit);

      const requirementsResult = await db.query(requirementsQuery, requirementsParams);
      results.requirements = requirementsResult.rows;
    }

    return results;
  } catch (error) {
    console.error(`Error searching regulatory database for "${query}":`, error);
    throw error;
  }
}

/**
 * Get regulatory intelligence for a specific topic
 * @param {string} topic - Topic to analyze
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} - Regulatory intelligence
 */
export async function getRegulatoryIntelligence(topic, options = {}) {
  try {
    // First, get relevant regulations and guidance
    const searchResults = await searchRegulatoryDatabase(topic, {
      limit: 10,
      authority: options.authority,
    });

    // Use OpenAI to analyze and synthesize the information
    const prompt = `
      You are a regulatory intelligence expert analyzing information for the topic: ${topic}
      
      Relevant regulations:
      ${JSON.stringify(searchResults.regulations)}
      
      Relevant guidance:
      ${JSON.stringify(searchResults.guidance)}
      
      Relevant standards:
      ${JSON.stringify(searchResults.standards)}
      
      Based on this information, provide:
      1. A comprehensive regulatory analysis for this topic
      2. Key requirements and considerations
      3. Potential challenges and strategies
      4. Recommended approaches for compliance
      
      Format your response as a structured JSON object with appropriate sections.
    `;

    const aiResult = await ai.chat({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const analysis = JSON.parse(aiResult.content);

    // Return combined results
    return {
      topic,
      authority: options.authority,
      sources: {
        regulations: searchResults.regulations,
        guidance: searchResults.guidance,
        standards: searchResults.standards,
      },
      analysis,
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`Error getting regulatory intelligence for "${topic}":`, error);
    throw error;
  }
}

/**
 * Get regulatory updates since a given date
 * @param {Date} since - Date to get updates since
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Regulatory updates
 */
export async function getRegulatoryUpdates(since, options = {}) {
  try {
    const updates = {
      regulations: [],
      guidance: [],
      standards: [],
    };

    // Get regulation updates
    const regulationsQuery = `
      SELECT r.*, a.name as authority_name
      FROM regulations r
      JOIN regulatory_authorities a ON r.authority = a.code
      WHERE r.last_updated >= $1
      ${options.authority ? 'AND r.authority = $2' : ''}
      ORDER BY r.last_updated DESC
    `;

    const regulationsParams = [since];
    if (options.authority) {
      regulationsParams.push(options.authority);
    }

    const regulationsResult = await db.query(regulationsQuery, regulationsParams);
    updates.regulations = regulationsResult.rows;

    // Get guidance updates
    const guidanceQuery = `
      SELECT g.*, a.name as authority_name
      FROM guidance_documents g
      JOIN regulatory_authorities a ON g.authority = a.code
      WHERE g.published_date >= $1
      ${options.authority ? 'AND g.authority = $2' : ''}
      ORDER BY g.published_date DESC
    `;

    const guidanceParams = [since];
    if (options.authority) {
      guidanceParams.push(options.authority);
    }

    const guidanceResult = await db.query(guidanceQuery, guidanceParams);
    updates.guidance = guidanceResult.rows;

    // Get standards updates
    const standardsQuery = `
      SELECT s.*, o.name as organization_name
      FROM regulatory_standards s
      JOIN standards_organizations o ON s.organization = o.code
      WHERE s.last_updated >= $1
      ORDER BY s.last_updated DESC
    `;

    const standardsResult = await db.query(standardsQuery, [since]);
    updates.standards = standardsResult.rows;

    return {
      since,
      updates,
      metadata: {
        regulationCount: updates.regulations.length,
        guidanceCount: updates.guidance.length,
        standardsCount: updates.standards.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`Error getting regulatory updates since ${since}:`, error);
    throw error;
  }
}

/**
 * Clear regulatory database cache
 * @param {string} cacheType - Type of cache to clear
 */
export function clearRegulatoryCaches(cacheType = 'all') {
  if (cacheType === 'all' || cacheType === 'regulations') {
    regulationCache.clear();
  }

  if (cacheType === 'all' || cacheType === 'guidance') {
    guidanceCache.clear();
  }

  if (cacheType === 'all' || cacheType === 'standards') {
    standardsCache.clear();
  }
}

/**
 * Check if regulatory database is up to date
 * @returns {Promise<Object>} - Database status
 */
export async function checkRegulatoryDatabaseStatus() {
  try {
    // Check when database was last updated
    const statusQuery = await db.query(`
      SELECT 
        (SELECT MAX(last_updated) FROM regulations) as last_regulation_update,
        (SELECT MAX(published_date) FROM guidance_documents) as last_guidance_update,
        (SELECT MAX(last_updated) FROM regulatory_standards) as last_standards_update,
        (SELECT COUNT(*) FROM regulations) as regulation_count,
        (SELECT COUNT(*) FROM guidance_documents) as guidance_count,
        (SELECT COUNT(*) FROM regulatory_standards) as standards_count
    `);

    const status = statusQuery.rows[0];
    const now = new Date();

    // Check if database is up to date (all updated within last 30 days)
    const regulationAge = status.last_regulation_update
      ? (now - new Date(status.last_regulation_update)) / (1000 * 60 * 60 * 24)
      : null;

    const guidanceAge = status.last_guidance_update
      ? (now - new Date(status.last_guidance_update)) / (1000 * 60 * 60 * 24)
      : null;

    const standardsAge = status.last_standards_update
      ? (now - new Date(status.last_standards_update)) / (1000 * 60 * 60 * 24)
      : null;

    const isUpToDate =
      (regulationAge === null || regulationAge < 30) &&
      (guidanceAge === null || guidanceAge < 30) &&
      (standardsAge === null || standardsAge < 30);

    return {
      isUpToDate,
      lastUpdated: {
        regulations: status.last_regulation_update,
        guidance: status.last_guidance_update,
        standards: status.last_standards_update,
      },
      counts: {
        regulations: parseInt(status.regulation_count),
        guidance: parseInt(status.guidance_count),
        standards: parseInt(status.standards_count),
      },
      checksPerformed: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error checking regulatory database status:', error);
    throw error;
  }
}
