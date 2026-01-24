/**
 * Document Recommendation Service
 *
 * Intelligent document recommendation system based on user behavior patterns and content analysis.
 *
 * Enterprise features include:
 * - User behavior tracking and analysis
 * - Content-based recommendations
 * - Collaborative filtering for team-based suggestions
 * - Personalized document recommendations
 * - Multi-tenant isolated recommendations
 */

/**
 * Get personalized document recommendations for a user
 *
 * @param {Object} options - Recommendation options
 * @param {string} [options.userId] - User ID to get recommendations for
 * @param {number} [options.limit=5] - Maximum number of recommendations to return
 * @param {string} [options.context] - Current context (folder, document, or search query)
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Recommended documents
 */
export async function getPersonalizedRecommendations(options = {}) {
  try {
    const params = new URLSearchParams();

    if (options.userId) params.append('userId', options.userId);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.context) params.append('context', options.context);
    if (options.tenantId) params.append('tenantId', options.tenantId);

    const response = await fetch(`/api/recommendations/personalized?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting personalized recommendations: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Recommendation Service Error (getPersonalizedRecommendations):', error);
    return [];
  }
}

/**
 * Get content-based recommendations (similar documents)
 *
 * @param {string} documentId - Document ID to find similar content
 * @param {Object} [options] - Additional options
 * @param {number} [options.limit=5] - Maximum number of recommendations to return
 * @param {boolean} [options.includeContent=false] - Whether to include document content in results
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Similar documents
 */
export async function getSimilarDocuments(documentId, options = {}) {
  try {
    const params = new URLSearchParams();
    params.append('documentId', documentId);

    if (options.limit) params.append('limit', options.limit.toString());
    if (options.includeContent) params.append('includeContent', options.includeContent.toString());
    if (options.tenantId) params.append('tenantId', options.tenantId);

    const response = await fetch(`/api/recommendations/similar?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting similar documents: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Recommendation Service Error (getSimilarDocuments):', error);
    return [];
  }
}

/**
 * Get collaborative-filtered recommendations based on team behavior
 *
 * @param {Object} options - Options for collaborative recommendations
 * @param {string} options.userId - User ID to get recommendations for
 * @param {Array<string>} [options.teams] - Team IDs to include in the collaborative filtering
 * @param {number} [options.limit=5] - Maximum number of recommendations to return
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Recommended documents
 */
export async function getTeamRecommendations(options = {}) {
  try {
    if (!options.userId) {
      throw new Error('User ID is required for team recommendations');
    }

    const params = new URLSearchParams();
    params.append('userId', options.userId);

    if (options.teams && options.teams.length) params.append('teams', options.teams.join(','));
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.tenantId) params.append('tenantId', options.tenantId);

    const response = await fetch(`/api/recommendations/team?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting team recommendations: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Recommendation Service Error (getTeamRecommendations):', error);
    return [];
  }
}

/**
 * Get trending documents across organization
 *
 * @param {Object} [options] - Additional options
 * @param {string} [options.timeframe='week'] - Timeframe for trending (day, week, month)
 * @param {number} [options.limit=5] - Maximum number of trending documents to return
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Trending documents
 */
export async function getTrendingDocuments(options = {}) {
  try {
    const params = new URLSearchParams();

    if (options.timeframe) params.append('timeframe', options.timeframe);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.tenantId) params.append('tenantId', options.tenantId);

    const response = await fetch(`/api/recommendations/trending?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting trending documents: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Recommendation Service Error (getTrendingDocuments):', error);
    return [];
  }
}

/**
 * Log user interaction with document for recommendation engine
 *
 * @param {Object} interaction - Interaction data
 * @param {string} interaction.documentId - Document ID user interacted with
 * @param {string} interaction.userId - User ID who performed the interaction
 * @param {string} interaction.action - Type of interaction (view, download, edit, share)
 * @param {Object} [interaction.metadata] - Additional metadata about the interaction
 * @param {string} [interaction.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<void>}
 */
export async function logDocumentInteraction(interaction) {
  try {
    if (!interaction.documentId || !interaction.userId || !interaction.action) {
      throw new Error('Document ID, user ID, and action are required for logging interactions');
    }

    await fetch('/api/recommendations/log-interaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(interaction),
    });
  } catch (error) {
    console.error('Recommendation Service Error (logDocumentInteraction):', error);
  }
}

/**
 * Get recently viewed documents for a user
 *
 * @param {string} userId - User ID to get recent documents for
 * @param {Object} [options] - Additional options
 * @param {number} [options.limit=5] - Maximum number of recent documents to return
 * @param {string} [options.tenantId] - Tenant ID for multi-tenant isolation
 * @returns {Promise<Array>} - Recently viewed documents
 */
export async function getRecentlyViewedDocuments(userId, options = {}) {
  try {
    const params = new URLSearchParams();
    params.append('userId', userId);

    if (options.limit) params.append('limit', options.limit.toString());
    if (options.tenantId) params.append('tenantId', options.tenantId);

    const response = await fetch(`/api/recommendations/recent?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Error getting recently viewed documents: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Recommendation Service Error (getRecentlyViewedDocuments):', error);
    return [];
  }
}
