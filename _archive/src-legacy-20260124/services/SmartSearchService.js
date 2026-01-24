/**
 * Smart Search Service
 *
 * Advanced search capabilities for regulatory documents with AI-powered features.
 *
 * Enterprise features include:
 * - Semantic search across document content
 * - Tag-based filtering and faceted search
 * - Auto-linking to trial modules based on content analysis
 * - Recent and popular searches tracking
 * - Relevance scoring with multi-parameter ranking
 */

/**
 * Perform a smart search across documents
 *
 * @param {Object} queryParams - Search parameters
 * @param {string} queryParams.query - Search text
 * @param {Array<string>} [queryParams.tags] - Tags to filter by
 * @param {string} [queryParams.documentType] - Document type to filter by
 * @param {string} [queryParams.trialPhase] - Trial phase to filter by
 * @param {string} [queryParams.molecule] - Molecule to filter by
 * @param {string} [queryParams.trialId] - Trial ID to filter by
 * @param {boolean} [queryParams.semanticSearch] - Whether to use semantic search
 * @param {string} [queryParams.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Search results
 */
export async function smartSearch(queryParams) {
  try {
    // Build query parameters
    const params = new URLSearchParams();

    if (queryParams.query) params.append('query', queryParams.query);
    if (queryParams.tags && queryParams.tags.length)
      params.append('tags', queryParams.tags.join(','));
    if (queryParams.documentType) params.append('documentType', queryParams.documentType);
    if (queryParams.trialPhase) params.append('trialPhase', queryParams.trialPhase);
    if (queryParams.molecule) params.append('molecule', queryParams.molecule);
    if (queryParams.trialId) params.append('trialId', queryParams.trialId);
    if (queryParams.semanticSearch)
      params.append('semanticSearch', queryParams.semanticSearch.toString());
    if (queryParams.tenantId) params.append('tenantId', queryParams.tenantId);

    const response = await fetch(`/api/search/documents?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error searching documents: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Smart Search Service Error (smartSearch):', error);
    throw error;
  }
}

/**
 * Get search suggestions based on partial query
 *
 * @param {string} partialQuery - Partial search query
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Search suggestions
 */
export async function getSearchSuggestions(partialQuery, tenantId) {
  try {
    if (!partialQuery) return [];

    const params = new URLSearchParams();
    params.append('query', partialQuery);
    if (tenantId) params.append('tenantId', tenantId);

    const response = await fetch(`/api/search/suggestions?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting search suggestions: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Smart Search Service Error (getSearchSuggestions):', error);
    return [];
  }
}

/**
 * Get related documents for a given document
 *
 * @param {string} documentId - Document ID to find related documents for
 * @param {Object} [options] - Additional options
 * @param {number} [options.limit=5] - Maximum number of related documents to return
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Related documents
 */
export async function getRelatedDocuments(documentId, options = {}) {
  try {
    const params = new URLSearchParams();
    params.append('documentId', documentId);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.tenantId) params.append('tenantId', options.tenantId);

    const response = await fetch(`/api/search/related?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting related documents: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Smart Search Service Error (getRelatedDocuments):', error);
    return [];
  }
}

/**
 * Get trending search terms for the current tenant
 *
 * @param {string} [tenantId] - Tenant ID for multi-tenant isolation
 * @param {number} [limit=10] - Maximum number of trending terms to return
 * @returns {Promise<Array>} - Trending search terms
 */
export async function getTrendingSearchTerms(tenantId, limit = 10) {
  try {
    const params = new URLSearchParams();
    if (tenantId) params.append('tenantId', tenantId);
    params.append('limit', limit.toString());

    const response = await fetch(`/api/search/trending?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting trending search terms: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Smart Search Service Error (getTrendingSearchTerms):', error);
    return [];
  }
}

/**
 * Save a user search query for analytics and history
 *
 * @param {string} query - Search query
 * @param {Object} [options] - Additional options
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @param {string} [options.userId] - User ID who performed the search
 * @param {number} [options.resultCount] - Number of results returned
 * @returns {Promise<void>}
 */
export async function saveSearchQuery(query, options = {}) {
  try {
    await fetch('/api/search/save-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        tenantId: options.tenantId,
        userId: options.userId,
        resultCount: options.resultCount,
      }),
    });
  } catch (error) {
    console.error('Smart Search Service Error (saveSearchQuery):', error);
  }
}
