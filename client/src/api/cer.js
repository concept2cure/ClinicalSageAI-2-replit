import axios from 'axios';
import FDA510kService from '../services/FDA510kService';

const API_BASE_URL = '/api/cer';
const LITERATURE_SEARCH_URL = '/api/literature';
const PUBMED_API_URL = '/api/pubmed';
const IEEE_API_URL = '/api/ieee';
const DISCOVERY_API_URL = '/api/discovery';

/**
 * Post a new device profile using the unified device profile API
 *
 * @param {Object} data - The device profile data to save
 * @returns {Promise<Object>} - The saved device profile
 */
export const postDeviceProfile = async data => {
  try {
    // Use the new unified DeviceProfileAPI to create a device profile
    const deviceProfile = await FDA510kService.DeviceProfileAPI.create(data);
    return deviceProfile;
  } catch (error) {
    console.error('Error posting device profile:', error);
    throw error;
  }
};

/**
 * Get all device profiles, optionally filtered by organization using the unified device profile API
 *
 * @param {string} organizationId - Optional organization ID filter
 * @returns {Promise<Array>} - Array of device profiles
 */
export const getDeviceProfiles = async organizationId => {
  try {
    // Use the new unified DeviceProfileAPI to list device profiles
    const deviceProfiles = await FDA510kService.DeviceProfileAPI.list(organizationId);
    return deviceProfiles;
  } catch (error) {
    console.error('Error getting device profiles:', error);
    throw error;
  }
};

/**
 * Get a device profile by ID using the unified device profile API
 *
 * @param {string} id - The device profile ID
 * @returns {Promise<Object>} - The device profile
 */
export const getDeviceProfileById = async id => {
  try {
    // Use the new unified DeviceProfileAPI to get a device profile
    const deviceProfile = await FDA510kService.DeviceProfileAPI.get(id);
    return deviceProfile;
  } catch (error) {
    console.error(`Error getting device profile ID ${id}:`, error);
    throw error;
  }
};

/**
 * Update a device profile using the unified device profile API
 *
 * @param {string} id - The device profile ID
 * @param {Object} data - The updated device profile data
 * @returns {Promise<Object>} - The updated device profile
 */
export const updateDeviceProfile = async (id, data) => {
  try {
    // Use the new unified DeviceProfileAPI to update a device profile
    const deviceProfile = await FDA510kService.DeviceProfileAPI.update(id, data);
    return deviceProfile;
  } catch (error) {
    console.error(`Error updating device profile ID ${id}:`, error);
    throw error;
  }
};

/**
 * Delete a device profile using the unified device profile API
 *
 * @param {number} id - The device profile ID to delete
 * @returns {Promise<boolean>} - True if successful
 */
export const deleteDeviceProfile = async id => {
  try {
    // Use the new unified DeviceProfileAPI to delete a device profile
    const success = await FDA510kService.DeviceProfileAPI.delete(id);
    return success;
  } catch (error) {
    console.error(`Error deleting device profile ID ${id}:`, error);
    throw error;
  }
};

/**
 * Search for literature across multiple sources
 *
 * @param {string} query - The search query
 * @param {Object} filters - Search filters (year range, types, etc.)
 * @returns {Promise<Array>} - Array of literature results
 */
export const searchLiterature = async (query, filters = {}) => {
  try {
    const response = await axios.post(LITERATURE_SEARCH_URL, {
      query,
      filters,
    });
    return response.data;
  } catch (error) {
    console.error('Error searching literature:', error);
    throw error;
  }
};

/**
 * Search PubMed for medical literature
 *
 * @param {string} query - The search query
 * @param {Object} filters - Search filters
 * @returns {Promise<Array>} - Array of PubMed results
 */
export const searchPubMed = async (query, filters = {}) => {
  try {
    const response = await axios.post(`${PUBMED_API_URL}/search`, {
      query,
      filters,
    });
    return response.data;
  } catch (error) {
    console.error('Error searching PubMed:', error);
    throw error;
  }
};

/**
 * Get PubMed article details by PMID
 *
 * @param {string} pmid - The PubMed ID
 * @returns {Promise<Object>} - The article details
 */
export const getPubMedArticle = async pmid => {
  try {
    const response = await axios.get(`${PUBMED_API_URL}/article/${pmid}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting PubMed article ID ${pmid}:`, error);
    throw error;
  }
};

/**
 * Search IEEE Xplore for technical literature
 *
 * @param {string} query - The search query
 * @param {Object} filters - Search filters
 * @returns {Promise<Array>} - Array of IEEE Xplore results
 */
export const searchIEEE = async (query, filters = {}) => {
  try {
    const response = await axios.post(`${IEEE_API_URL}/search`, {
      query,
      filters,
    });
    return response.data;
  } catch (error) {
    console.error('Error searching IEEE Xplore:', error);
    throw error;
  }
};

/**
 * Save selected literature for a CER
 *
 * @param {string} cerProjectId - The CER project ID
 * @param {Array} articles - The selected literature articles
 * @returns {Promise<Object>} - The saved literature data
 */
export const saveLiteratureSelection = async (cerProjectId, articles) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/literature/${cerProjectId}`, {
      articles,
    });
    return response.data;
  } catch (error) {
    console.error('Error saving literature selection:', error);
    throw error;
  }
};

/**
 * Get saved literature for a CER project
 *
 * @param {string} cerProjectId - The CER project ID
 * @returns {Promise<Array>} - Array of saved literature
 */
export const getSavedLiterature = async cerProjectId => {
  try {
    const response = await axios.get(`${API_BASE_URL}/literature/${cerProjectId}`);
    return response.data;
  } catch (error) {
    console.error(`Error getting saved literature for CER ID ${cerProjectId}:`, error);
    throw error;
  }
};

/**
 * Search literature using the unified discovery service with semantic search capabilities
 *
 * This enhanced implementation provides vector-based semantic search with multiple fallback mechanisms
 * to ensure reliable literature retrieval even if the primary vector search fails.
 *
 * @param {string} query - The search query
 * @param {Object} options - Search options (limit, module context)
 * @returns {Promise<Array>} - Array of literature results
 */
export const searchUnifiedLiterature = async (query, options = { limit: 10, module: 'cer' }) => {
  // Validate input
  if (!query || query.trim().length === 0) {
    console.warn('Empty query provided to searchUnifiedLiterature');
    return [];
  }

  // Track attempt timings for observability/debugging
  const startTime = Date.now();
  let attemptedApproaches = [];

  // Configure timeout for vector search to ensure responsiveness
  const VECTOR_SEARCH_TIMEOUT = 5000; // 5 seconds timeout for vector search

  try {
    console.log('Initiating semantic literature search:', { query, options });

    // First attempt: Vector-based semantic search through unified discovery service
    attemptedApproaches.push('vector_search');
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Vector search timeout')), VECTOR_SEARCH_TIMEOUT);
      });

      // Create vector search promise
      const vectorSearchPromise = axios.post('/api/discovery/literature-search', {
        query,
        limit: options.limit || 10,
        module: options.module || 'cer',
        useVectorSearch: true, // Flag to explicitly request vector semantic search
      });

      // Race the vector search against the timeout
      const response = await Promise.race([vectorSearchPromise, timeoutPromise]);

      // Check if we have valid results
      if (response?.data?.results && response.data.results.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Vector search successful in ${timeElapsed}ms with ${response.data.results.length} results`
        );

        // Annotate results with metadata about how they were retrieved
        const enhancedResults = response.data.results.map(result => ({
          ...result,
          retrievalMethod: 'semantic_vector',
          searchType: 'semantic',
          queryMatchScore: result.similarity || 0.85,
        }));

        return enhancedResults;
      } else {
        console.log('Vector search returned no results, falling back...');
      }
    } catch (vectorError) {
      // Log vector search failure
      console.warn('Vector semantic search failed:', vectorError.message);
      // Continue to next approach
    }

    // Second attempt: Keyword-enhanced semantic search through discovery service
    attemptedApproaches.push('keyword_enhanced');
    try {
      const response = await axios.post('/api/discovery/literature-search', {
        query,
        limit: options.limit || 10,
        module: options.module || 'cer',
        useVectorSearch: false,
        enhanceWithKeywords: true, // Flag to use keyword enhancement
      });

      if (response?.data?.results && response.data.results.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Keyword-enhanced search successful in ${timeElapsed}ms with ${response.data.results.length} results`
        );

        // Annotate results with metadata
        const enhancedResults = response.data.results.map(result => ({
          ...result,
          retrievalMethod: 'keyword_enhanced',
          searchType: 'hybrid',
          queryMatchScore: result.relevance || 0.75,
        }));

        return enhancedResults;
      } else {
        console.log('Keyword-enhanced search returned no results, falling back...');
      }
    } catch (keywordError) {
      console.warn('Keyword-enhanced search failed:', keywordError.message);
      // Continue to next approach
    }

    // Third attempt: Traditional literature search API
    attemptedApproaches.push('traditional_api');
    try {
      console.log('Falling back to traditional literature search');
      const results = await searchLiterature(query);

      if (results && results.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Traditional literature search successful in ${timeElapsed}ms with ${results.length} results`
        );

        // Annotate results with metadata
        const enhancedResults = results.map(result => ({
          ...result,
          retrievalMethod: 'traditional_api',
          searchType: 'keyword',
          queryMatchScore: 0.7, // Default score for traditional search
        }));

        return enhancedResults;
      } else {
        console.log('Traditional search returned no results, falling back...');
      }
    } catch (traditionalError) {
      console.warn('Traditional literature search failed:', traditionalError.message);
      // Continue to final approach
    }

    // Final attempt: Direct database sources (PubMed, IEEE)
    attemptedApproaches.push('direct_sources');
    try {
      console.log('Falling back to direct source APIs (PubMed, IEEE)');

      // Try to fetch from multiple sources in parallel
      const [pubmedResults, ieeeResults] = await Promise.allSettled([
        searchPubMed(query).catch(err => {
          console.warn('PubMed search error in fallback:', err.message);
          return [];
        }),
        searchIEEE(query).catch(err => {
          console.warn('IEEE search error in fallback:', err.message);
          return [];
        }),
      ]);

      // Combine results from successful queries
      const combinedResults = [
        ...(pubmedResults.status === 'fulfilled' ? pubmedResults.value : []),
        ...(ieeeResults.status === 'fulfilled' ? ieeeResults.value : []),
      ];

      if (combinedResults.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Direct source search successful in ${timeElapsed}ms with ${combinedResults.length} results`
        );

        // Annotate results with metadata and sort by most recent
        const enhancedResults = combinedResults
          .map(result => ({
            ...result,
            retrievalMethod: 'direct_source',
            searchType: 'direct',
            queryMatchScore: 0.6, // Lower base score for direct source results
          }))
          .sort((a, b) => {
            // Sort by publication date if available, most recent first
            const dateA = a.publication_date || a.publicationDate || '1900';
            const dateB = b.publication_date || b.publicationDate || '1900';
            return dateB.localeCompare(dateA);
          });

        // Limit to requested number
        return enhancedResults.slice(0, options.limit || 10);
      }
    } catch (directError) {
      console.error('Direct source search failed:', directError.message);
    }

    // If we get here, all approaches failed
    console.error(`All literature search approaches failed for query: "${query}"`);
    console.log('Attempted approaches:', attemptedApproaches.join(', '));

    // Return empty array as graceful fallback
    return [];
  } catch (error) {
    // Capture overall error metrics
    const timeElapsed = Date.now() - startTime;
    console.error(`Literature search failed after ${timeElapsed}ms:`, error);
    console.error('Attempted approaches:', attemptedApproaches.join(', '));

    // Return empty array instead of throwing to improve UX resilience
    return [];
  }
};

/**
 * Find predicate devices using the unified discovery service with comprehensive
 * error handling and fallback mechanisms for production reliability
 *
 * @param {string} deviceDescription - The device description to search for predicates
 * @param {Object} options - Search options (limit, module context)
 * @returns {Promise<Array>} - Array of predicate device results
 */
export const findPredicateDevices = async (
  deviceDescription,
  options = { limit: 8, module: '510k' }
) => {
  // Validate input
  if (!deviceDescription || deviceDescription.trim().length === 0) {
    console.warn('Empty device description provided to findPredicateDevices');
    return [];
  }

  // Track metrics for observability
  const startTime = Date.now();
  let attemptedApproaches = [];

  // Configure timeout for semantic search to ensure responsiveness
  const SEMANTIC_SEARCH_TIMEOUT = 8000; // 8 seconds timeout for semantic search

  try {
    console.log('Initiating predicate device search:', { deviceDescription, options });

    // First approach: Unified discovery service with semantic matching
    attemptedApproaches.push('unified_semantic');
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Semantic predicate search timeout')),
          SEMANTIC_SEARCH_TIMEOUT
        );
      });

      // Build query parameters for semantic search
      const semanticQueryParams = new URLSearchParams({
        query: deviceDescription,
        limit: options.limit || 8,
        context: options.module || '510k',
        semantic: 'true', // Explicit flag for semantic search
      });

      // Create semantic search promise
      const semanticSearchPromise = axios.get(
        `${DISCOVERY_API_URL}/predicates?${semanticQueryParams.toString()}`
      );

      // Race the semantic search against the timeout
      const response = await Promise.race([semanticSearchPromise, timeoutPromise]);

      // Check if we have valid results
      if (response?.data?.data && response.data.data.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Semantic predicate search successful in ${timeElapsed}ms with ${response.data.data.length} results`
        );

        // Enhance results with metadata about how they were retrieved
        const enhancedResults = response.data.data.map(result => ({
          ...result,
          retrievalMethod: 'semantic',
          matchScore: result.similarity || result.score || 0.8,
          matchType: 'semantic',
        }));

        return enhancedResults;
      } else {
        console.log('Semantic predicate search returned no results, falling back...');
      }
    } catch (semanticError) {
      console.warn('Semantic predicate search failed:', semanticError.message);
      // Continue to next approach
    }

    // Second approach: Keyword-based search through unified discovery service
    attemptedApproaches.push('unified_keyword');
    try {
      // Build query parameters for keyword search
      const keywordQueryParams = new URLSearchParams({
        query: deviceDescription,
        limit: options.limit || 8,
        context: options.module || '510k',
        semantic: 'false', // Explicit flag to disable semantic search
        method: 'keyword',
      });

      // Call the GET endpoint with keyword parameters
      const response = await axios.get(
        `${DISCOVERY_API_URL}/predicates?${keywordQueryParams.toString()}`
      );

      // Check if we have valid results
      if (response?.data?.data && response.data.data.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Keyword predicate search successful in ${timeElapsed}ms with ${response.data.data.length} results`
        );

        // Enhance results with metadata
        const enhancedResults = response.data.data.map(result => ({
          ...result,
          retrievalMethod: 'keyword',
          matchScore: result.score || 0.7,
          matchType: 'keyword',
        }));

        return enhancedResults;
      } else {
        console.log('Keyword predicate search returned no results, falling back...');
      }
    } catch (keywordError) {
      console.warn('Keyword predicate search failed:', keywordError.message);
      // Continue to next approach
    }

    // Third approach: Direct FDA 510k database search
    attemptedApproaches.push('fda_510k_direct');
    try {
      console.log('Attempting direct FDA 510k database search');

      // Extract key terms from device description for more targeted search
      const keyTerms = extractKeyTerms(deviceDescription);

      // Query direct FDA 510k endpoint
      const response = await axios.get('/api/fda510k/search', {
        params: {
          terms: keyTerms.join(','),
          limit: options.limit || 8,
        },
      });

      if (response?.data && response.data.length > 0) {
        const timeElapsed = Date.now() - startTime;
        console.log(
          `Direct FDA 510k search successful in ${timeElapsed}ms with ${response.data.length} results`
        );

        // Format results to match expected structure
        const formattedResults = response.data.map(result => ({
          id: result.k_number || `fda-510k-${result.id || Date.now()}`,
          name: result.device_name || 'Unknown Device',
          manufacturer: result.applicant || 'Unknown Manufacturer',
          description: result.statement_or_summary || result.device_description || '',
          decisionDate: result.decision_date || result.date_received || '',
          type: '510k',
          status: result.decision_code || 'UNKNOWN',
          retrievalMethod: 'direct_fda',
          matchScore: 0.6, // Lower confidence for direct search results
          matchType: 'direct',
        }));

        return formattedResults;
      } else {
        console.log('Direct FDA 510k search returned no results, falling back...');
      }
    } catch (fdaError) {
      console.warn('Direct FDA 510k search failed:', fdaError.message);
      // Fall through to cached results
    }

    // Final fallback: Check for cached predicate devices
    attemptedApproaches.push('local_cache');
    try {
      const cachedPredicates = localStorage.getItem('recent_predicate_devices');

      if (cachedPredicates) {
        const parsedCache = JSON.parse(cachedPredicates);

        if (Array.isArray(parsedCache) && parsedCache.length > 0) {
          const timeElapsed = Date.now() - startTime;
          console.log(
            `Using cached predicates as fallback in ${timeElapsed}ms with ${parsedCache.length} results`
          );

          // Mark results as coming from cache
          const cachedResults = parsedCache.map(result => ({
            ...result,
            retrievalMethod: 'cache',
            matchScore: 0.5, // Lowest confidence for cached results
            matchType: 'cache',
            isCached: true,
          }));

          return cachedResults;
        }
      }
    } catch (cacheError) {
      console.warn('Error accessing cached predicates:', cacheError.message);
    }

    // If we get here, all search approaches failed
    console.error(`All predicate device search approaches failed for: "${deviceDescription}"`);
    console.log('Attempted approaches:', attemptedApproaches.join(', '));

    // Return empty array for consistent response
    return [];
  } catch (error) {
    // Capture overall error metrics
    const timeElapsed = Date.now() - startTime;
    console.error(`Predicate device search failed after ${timeElapsed}ms:`, error);
    console.error('Attempted approaches:', attemptedApproaches.join(', '));

    // Return empty array for consistent response
    return [];
  }
};

/**
 * Helper function to extract key terms from a device description for targeted search
 * @private
 * @param {string} description - The device description text
 * @returns {string[]} - Array of key terms
 */
function extractKeyTerms(description) {
  if (!description) return [];

  // Remove common stop words and punctuation
  const cleanDescription = description
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s{2,}/g, ' ');

  // Common medical/device stop words to filter out
  const stopWords = [
    'the',
    'and',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'this',
    'that',
    'these',
    'those',
    'with',
    'for',
    'device',
    'medical',
    'system',
    'designed',
    'used',
    'uses',
    'using',
    'includes',
    'consisting',
    'consists',
    'method',
    'functionality',
    'function',
    'provides',
    'provide',
  ];

  // Split into words and filter
  const words = cleanDescription
    .split(' ')
    .filter(word => word.length > 2) // Only words longer than 2 chars
    .filter(word => !stopWords.includes(word));

  // Count word frequency
  const wordFrequency = {};
  words.forEach(word => {
    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
  });

  // Sort by frequency and take top terms
  const sortedTerms = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0]);

  // Return top 5 terms or fewer if not available
  return sortedTerms.slice(0, 5);
}

/**
 * Generate a literature review from selected articles
 *
 * @param {string} deviceName - The device name for context
 * @param {Array} literatureReferences - Array of selected literature references
 * @param {Object} options - Additional options for generation
 * @param {string} options.manufacturer - The manufacturer name
 * @param {string} options.modelNumber - The device model number
 * @param {boolean} options.useEnhancedGeneration - Whether to use enhanced AI generation
 * @returns {Promise<Object>} - The generated literature review content
 */
export const generateLiteratureReview = async (deviceName, literatureReferences, options = {}) => {
  const { manufacturer = '', modelNumber = '', useEnhancedGeneration = true } = options;

  // Import the error handling utility
  const errorHandling = await import('../utils/errorHandling');

  // Timeout for API request in milliseconds (2 minutes)
  const API_TIMEOUT = 120000;

  // Create a fallback function that generates a basic literature review
  // when the main API call fails or times out
  const fallbackLiteratureReviewGenerator = async (
    deviceName,
    literatureReferences,
    originalError
  ) => {
    console.log('Using fallback literature review generator');

    // Extract key information from references for the fallback generator
    const extractedInfo = literatureReferences.map(ref => ({
      title: ref.title,
      authors: ref.authors,
      year: ref.year,
      journal: ref.journal,
      abstract: ref.abstract?.substring(0, 200) || '',
      id: ref.id,
    }));

    // Structure basic literature review
    const fallbackReview = {
      content:
        `# Literature Review for ${deviceName || 'Medical Device'}\n\n` +
        `## Introduction\n\nThis literature review summarizes findings from ${literatureReferences.length} ` +
        `scientific articles relevant to ${deviceName || 'the device'}${manufacturer ? ' manufactured by ' + manufacturer : ''}.\n\n` +
        `## Methodology\n\nA literature search was conducted across medical and scientific databases. ` +
        `${literatureReferences.length} relevant articles were selected for this review.\n\n` +
        `## Summary of Findings\n\n` +
        literatureReferences
          .map(
            ref =>
              `- **${ref.title}** (${ref.authors}, ${ref.year}): ${ref.abstract?.substring(0, 150)}...`
          )
          .join('\n\n') +
        `\n\n## Conclusion\n\nBased on the literature reviewed, additional analysis is recommended.`,
      error: {
        original: originalError?.message || 'Unknown error',
        type: 'fallback_generated',
        timestamp: new Date().toISOString(),
      },
      metadata: {
        generatedWithFallback: true,
        sourceCount: literatureReferences.length,
        generationTimestamp: new Date().toISOString(),
        generationMethod: 'basic',
      },
    };

    return { review: fallbackReview };
  };

  try {
    // Wrap the API call with timeout
    const apiCallWithTimeout = errorHandling.withTimeout(
      axios.post(`${API_BASE_URL}/generate-literature-review`, {
        deviceName,
        manufacturer,
        modelNumber,
        literatureReferences,
        useEnhancedGeneration,
      }),
      API_TIMEOUT,
      'Literature review generation timed out'
    );

    // Execute the API call with error handling and fallback
    const response = await errorHandling.withErrorHandling(
      async () => {
        const result = await apiCallWithTimeout;
        return result.data;
      },
      {
        fallback: (deviceNameArg, literatureRefsArg) =>
          fallbackLiteratureReviewGenerator(
            deviceNameArg,
            literatureRefsArg,
            new Error('API call failed')
          ),
        retries: 1,
        retryDelay: 2000,
        onError: error => {
          console.error('Error in literature review generation:', error);
          // You could add analytics tracking here
        },
      }
    )(deviceName, literatureReferences);

    return response;
  } catch (error) {
    // Format error for consistent handling
    const formattedError = errorHandling.formatErrorForDisplay(error, {
      friendlyMessages: {
        ...errorHandling.defaultFriendlyMessages,
        timeout:
          'The literature review is taking longer than expected to generate. Please try again with fewer articles.',
      },
    });

    console.error('Literature review generation failed:', formattedError);

    // Try the fallback generator as a last resort
    try {
      return await fallbackLiteratureReviewGenerator(deviceName, literatureReferences, error);
    } catch (fallbackError) {
      console.error('Even fallback generation failed:', fallbackError);
      throw new Error(`Failed to generate literature review: ${formattedError.message}`);
    }
  }
};

/**
 * Save a generated literature review to a CER project
 *
 * @param {string} cerProjectId - The CER project ID
 * @param {Object} reviewData - The generated review data
 * @param {Object} options - Additional options
 * @param {boolean} options.validateBeforeSave - Whether to validate the review before saving
 * @param {boolean} options.addComplianceData - Whether to add compliance metadata
 * @returns {Promise<Object>} - The result of saving the review
 */
export const saveGeneratedLiteratureReview = async (cerProjectId, reviewData, options = {}) => {
  const { validateBeforeSave = true, addComplianceData = true } = options;

  // Import error handling utility
  const errorHandling = await import('../utils/errorHandling');

  // Add compliance and validation metadata if requested
  const prepareReviewData = async data => {
    let enhancedData = { ...data };

    if (addComplianceData) {
      try {
        // Add timestamp and version info
        enhancedData.metadata = {
          ...(enhancedData.metadata || {}),
          savedAt: new Date().toISOString(),
          version: '2.0',
          validated: validateBeforeSave,
        };
      } catch (error) {
        console.warn('Error adding compliance data:', error);
        // Continue with saving even if metadata enhancement fails
      }
    }

    return enhancedData;
  };

  // Create offline storage fallback function
  const saveToLocalStorageFallback = async (projectId, data) => {
    try {
      // Prepare data with compliance info
      const preparedData = await prepareReviewData(data);

      // Store in localStorage for offline resilience
      const storageKey = `cer_literature_review_${projectId}`;
      const savedReviews = JSON.parse(localStorage.getItem(storageKey) || '[]');

      // Add new review with pending sync flag
      savedReviews.push({
        ...preparedData,
        _pendingSync: true,
        _savedAt: new Date().toISOString(),
      });

      // Keep only the last 5 to avoid storage limits
      const trimmedReviews = savedReviews.slice(-5);
      localStorage.setItem(storageKey, JSON.stringify(trimmedReviews));

      console.log('Literature review saved to local storage as fallback');

      return {
        success: true,
        savedLocally: true,
        pendingSync: true,
        data: preparedData,
      };
    } catch (error) {
      console.error('Failed to save to local storage:', error);
      throw new Error('Failed to save literature review to both server and local storage');
    }
  };

  try {
    // First, optionally apply validation and prepare review data
    const preparedReviewData = await prepareReviewData(reviewData);

    // Wrap the API call with timeout and error handling
    const apiCallWithTimeout = errorHandling.withTimeout(
      axios.post(`${API_BASE_URL}/literature-review/${cerProjectId}`, {
        reviewData: preparedReviewData,
      }),
      30000, // 30 second timeout
      'Literature review save operation timed out'
    );

    // Execute API call with automatic retries and fallback
    const response = await errorHandling.withErrorHandling(
      async () => {
        const result = await apiCallWithTimeout;
        return result.data;
      },
      {
        fallback: () => saveToLocalStorageFallback(cerProjectId, preparedReviewData),
        retries: 2,
        retryDelay: 1000,
        onError: error => {
          console.error('Error saving literature review:', error);
        },
      }
    )();

    return response;
  } catch (error) {
    // Format the error for display
    const formattedError = errorHandling.formatErrorForDisplay(error, {
      friendlyMessages: {
        network:
          'Unable to save the literature review due to network issues. The review has been saved locally and will sync when connection is restored.',
        server:
          'The server encountered an issue while saving the literature review. Please try again later.',
        default: 'There was a problem saving the literature review.',
      },
    });

    console.error('Failed to save literature review:', formattedError);

    // Try local storage as last resort
    try {
      return await saveToLocalStorageFallback(cerProjectId, reviewData);
    } catch (fallbackError) {
      throw new Error(`Failed to save literature review: ${formattedError.message}`);
    }
  }
};

/**
 * Generate a preview of a CER document
 *
 * @param {Object} cerData - The CER data including device profile and sections
 * @returns {Promise<Object>} - The preview document
 */
export const generateCERPreview = async cerData => {
  try {
    const response = await axios.post('/api/document-assembly/preview', {
      cerData,
    });
    return response.data;
  } catch (error) {
    console.error('Error generating CER preview:', error);
    throw error;
  }
};

/**
 * Generate a complete CER document and save it
 *
 * @param {Object} cerData - The CER data including device profile and sections
 * @param {boolean} enhance - Whether to enhance the document with AI
 * @returns {Promise<Object>} - The result of the operation
 */
/**
 * Compare a device with selected predicate devices
 *
 * @param {Object} deviceDescription - The device to compare
 * @param {Array} selectedPredicates - Array of selected predicate devices
 * @returns {Promise<Object>} - The predicate device comparison data
 */
export const comparePredicateDevices = async (deviceDescription, selectedPredicates) => {
  // Import error handling utility
  const errorHandling = await import('../utils/errorHandling');

  try {
    // Timeout for API request in milliseconds (2 minutes)
    const API_TIMEOUT = 120000;

    const response = await errorHandling.withTimeout(
      axios.post(`${DISCOVERY_API_URL}/predicate-comparison`, {
        deviceDescription,
        selectedPredicates,
      }),
      API_TIMEOUT,
      'Predicate device comparison timed out'
    );

    return response.data;
  } catch (error) {
    console.error('Error comparing predicate devices:', error);

    // Return error object with informative message
    return {
      success: false,
      error: {
        message: error.message || 'Failed to generate predicate device comparison',
        details: error.response?.data?.message || 'Unknown error occurred',
      },
    };
  }
};

export const generateAndSaveCER = async (cerData, enhance = true) => {
  // Import error handling utility
  const errorHandling = await import('../utils/errorHandling');

  try {
    // Try to use the document assembly service first
    try {
      const options = { enhance };

      const assemblyResponse = await errorHandling.withTimeout(
        axios.post(`/api/document-assembly/cer`, { cerData, options }),
        60000, // 1 minute timeout
        'Document assembly timed out'
      );

      return assemblyResponse.data;
    } catch (assemblyError) {
      console.warn(
        'Document assembly service failed, falling back to legacy endpoint:',
        assemblyError
      );

      // Fall back to the legacy endpoint
      const response = await axios.post('/api/document-assembly/generate', {
        cerData,
        enhance,
      });

      return response.data;
    }
  } catch (error) {
    console.error('Error generating CER document:', error);

    // Format error for display
    const formattedError = errorHandling.formatErrorForDisplay(error, {
      friendlyMessages: {
        network:
          'Unable to connect to the document generation service. Please check your internet connection and try again.',
        timeout:
          'The document generation is taking longer than expected. Please try again with fewer sections or contact support.',
        server: 'Our document generation service is experiencing issues. Please try again later.',
        default:
          'An error occurred while generating your document. Please try again or contact support.',
      },
    });

    throw new Error(formattedError.message || error.message);
  }
};

/**
 * Generate a specific section for a CER
 *
 * @param {string} sectionKey - The section key/identifier
 * @param {Object} deviceProfile - The device profile
 * @param {Object} sectionData - Data specific to the section
 * @returns {Promise<Object>} - The generated section
 */
export const generateCERSection = async (sectionKey, deviceProfile, sectionData = {}) => {
  try {
    const response = await axios.post(`/api/document-assembly/section/${sectionKey}`, {
      deviceProfile,
      sectionData,
    });
    return response.data;
  } catch (error) {
    console.error(`Error generating CER section ${sectionKey}:`, error);
    throw error;
  }
};

/**
 * Assemble a complete CER document from sections and metadata
 *
 * @param {Object} cerData - Complete CER data including device profile and sections
 * @returns {Promise<Object>} - Assembly result with document paths and status
 */
export const assembleCERDocument = async cerData => {
  try {
    const response = await axios.post('/api/document-assembly/cer', {
      cerData,
    });

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.message || 'Failed to assemble CER document');
    }

    return response.data;
  } catch (error) {
    console.error('Error assembling CER document:', error);

    // Format error for display
    const errorHandling = {
      formatErrorForDisplay: (err, options = {}) => {
        const friendlyMessages = options.friendlyMessages || {};

        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          return { message: friendlyMessages.timeout || 'Request timed out' };
        } else if (!err.response || err.message.includes('Network Error')) {
          return { message: friendlyMessages.network || 'Network error' };
        } else if (err.response && err.response.status >= 500) {
          return { message: friendlyMessages.server || 'Server error' };
        }

        return { message: friendlyMessages.default || err.message };
      },
    };

    // Format error for display
    const formattedError = errorHandling.formatErrorForDisplay(error, {
      friendlyMessages: {
        network:
          'Unable to connect to the document assembly service. Please check your internet connection and try again.',
        timeout:
          'The document assembly is taking longer than expected. Please try again with fewer sections or contact support.',
        server: 'Our document assembly service is experiencing issues. Please try again later.',
        default:
          'An error occurred while assembling your document. Please try again or contact support.',
      },
    });

    throw new Error(formattedError.message || error.message);
  }
};

/**
 * Assemble a 510(k) submission document
 *
 * @param {Object} submission510kData - Complete 510(k) submission data
 * @returns {Promise<Object>} - Assembly result with document paths and status
 */
export const assemble510kDocument = async submission510kData => {
  try {
    const response = await axios.post('/api/document-assembly/510k', {
      submission510kData,
    });

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.message || 'Failed to assemble 510(k) document');
    }

    return response.data;
  } catch (error) {
    console.error('Error assembling 510(k) document:', error);

    // Format error for display
    const errorHandling = {
      formatErrorForDisplay: (err, options = {}) => {
        const friendlyMessages = options.friendlyMessages || {};

        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          return { message: friendlyMessages.timeout || 'Request timed out' };
        } else if (!err.response || err.message.includes('Network Error')) {
          return { message: friendlyMessages.network || 'Network error' };
        } else if (err.response && err.response.status >= 500) {
          return { message: friendlyMessages.server || 'Server error' };
        }

        return { message: friendlyMessages.default || err.message };
      },
    };

    // Format error for display
    const formattedError = errorHandling.formatErrorForDisplay(error, {
      friendlyMessages: {
        network:
          'Unable to connect to the document assembly service. Please check your internet connection and try again.',
        timeout:
          'The document assembly is taking longer than expected. Please try again with fewer sections or contact support.',
        server: 'Our document assembly service is experiencing issues. Please try again later.',
        default:
          'An error occurred while assembling your document. Please try again or contact support.',
      },
    });

    throw new Error(formattedError.message || error.message);
  }
};

/**
 * Get the status of a document assembly operation
 *
 * @param {string} assemblyId - The assembly ID to check
 * @returns {Promise<Object>} - Assembly status information
 */
export const getAssemblyStatus = async assemblyId => {
  try {
    const response = await axios.get(`/api/document-assembly/status/${assemblyId}`);

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.message || 'Failed to get assembly status');
    }

    return response.data.status;
  } catch (error) {
    console.error('Error getting assembly status:', error);
    throw error;
  }
};

/**
 * List recent document assembly operations
 *
 * @param {Object} options - List options
 * @param {number} options.limit - Number of assemblies to return (default: 10)
 * @param {string} options.type - Filter by document type (cer, 510k)
 * @returns {Promise<Array>} - Array of assembly operations
 */
export const listAssemblies = async (options = {}) => {
  try {
    const { limit = 10, type } = options;

    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (type) params.append('type', type);

    const response = await axios.get(`/api/document-assembly/list?${params}`);

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.message || 'Failed to list assemblies');
    }

    return response.data.assemblies;
  } catch (error) {
    console.error('Error listing assemblies:', error);
    throw error;
  }
};
