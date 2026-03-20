/**
 * Literature Retrieval Service for Clinical Evaluation Reports
 *
 * This service provides integration with medical literature databases
 * to retrieve relevant publications for clinical evaluation reports.
 *
 * Features:
 * - PubMed API integration with robust error handling
 * - Local caching to reduce duplicate API calls
 * - Smart batching to handle large datasets
 * - Relevance scoring with AI analysis
 */

import OpenAI from 'openai';

// SECURITY: OpenAI calls must go through the backend API gateway.
// Direct client-side calls with API keys are forbidden in production.
const openai = null; // Removed: never expose API keys in the browser bundle

// PubMed API base URL
const PUBMED_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// PubMed rate limits - 3 requests per second with API key
const RATE_LIMIT_DELAY = 350; // ms between requests (slightly conservative)

// Enhanced persistent cache with localStorage backup
const cache = {
  searches: new Map(),
  summaries: new Map(),
  fullTexts: new Map(),
  reviews: new Map(),

  // TTL for cache items (24 hours)
  TTL: 24 * 60 * 60 * 1000,

  // Maximum cache size limits to prevent memory issues
  MAX_ITEMS: {
    searches: 200,
    summaries: 500,
    fullTexts: 100,
    reviews: 300,
  },

  // Initialize cache from localStorage if available
  init() {
    try {
      const storedCache = localStorage.getItem('literature_cache');
      if (storedCache) {
        const parsed = JSON.parse(storedCache);

        // Restore each cache type
        Object.keys(parsed).forEach(cacheType => {
          if (this[cacheType] instanceof Map) {
            const entries = parsed[cacheType];
            entries.forEach(([key, value]) => {
              this[cacheType].set(key, value);
            });
            console.log(`Restored ${this[cacheType].size} items to ${cacheType} cache`);
          }
        });
      }
    } catch (error) {
      console.warn('Failed to restore cache from localStorage:', error);
      // Clear potentially corrupted cache
      localStorage.removeItem('literature_cache');
    }

    // Set up periodic cleanup
    setInterval(() => this.cleanup(), 30 * 60 * 1000); // Every 30 minutes
  },

  // Save cache to localStorage
  persist() {
    try {
      const serialized = {
        searches: [...this.searches.entries()],
        summaries: [...this.summaries.entries()],
        fullTexts: [...this.fullTexts.entries()],
        reviews: [...this.reviews.entries()],
      };

      localStorage.setItem('literature_cache', JSON.stringify(serialized));
    } catch (error) {
      console.warn('Failed to persist cache to localStorage:', error);
      // If storage quota exceeded, clear oldest items
      if (error.name === 'QuotaExceededError') {
        this.prune();
        this.persist(); // Try again after pruning
      }
    }
  },

  // Helper to get item with TTL check
  get(map, key) {
    const item = map.get(key);
    if (!item) return null;

    // Check if item is expired
    if (Date.now() - item.timestamp > this.TTL) {
      map.delete(key);
      this.persist();
      return null;
    }

    // Update access time to implement LRU behavior
    item.lastAccessed = Date.now();
    map.set(key, item);

    return item.data;
  },

  // Helper to set item with timestamp
  set(map, key, value) {
    // Check if we need to prune before adding
    if (map.size >= this.MAX_ITEMS[this.getMapName(map)]) {
      this.pruneMap(map);
    }

    map.set(key, {
      data: value,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
    });

    // Persist to localStorage after significant changes
    if (map.size % 10 === 0) {
      this.persist();
    }
  },

  // Get map name from map object
  getMapName(map) {
    if (map === this.searches) return 'searches';
    if (map === this.summaries) return 'summaries';
    if (map === this.fullTexts) return 'fullTexts';
    if (map === this.reviews) return 'reviews';
    return 'unknown';
  },

  // Remove expired items from all caches
  cleanup() {
    const now = Date.now();
    let removed = 0;

    [this.searches, this.summaries, this.fullTexts, this.reviews].forEach(map => {
      map.forEach((value, key) => {
        if (now - value.timestamp > this.TTL) {
          map.delete(key);
          removed++;
        }
      });
    });

    if (removed > 0) {
      console.log(`Cache cleanup: removed ${removed} expired items`);
      this.persist();
    }
  },

  // Prune specific map when it reaches size limit (uses LRU strategy)
  pruneMap(map) {
    // Sort by last accessed time (oldest first)
    const entries = [...map.entries()];
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Remove oldest 20% of items
    const removeCount = Math.max(1, Math.floor(entries.length * 0.2));
    for (let i = 0; i < removeCount; i++) {
      if (i < entries.length) {
        map.delete(entries[i][0]);
      }
    }

    console.log(`Pruned ${removeCount} items from ${this.getMapName(map)} cache`);
  },

  // Prune all caches when storage is full
  prune() {
    [this.searches, this.summaries, this.fullTexts, this.reviews].forEach(map => {
      this.pruneMap(map);
    });
  },
};

// Initialize cache from localStorage
cache.init();

/**
 * Search PubMed for relevant literature based on device and keywords
 *
 * @param {Object} deviceData - Device information to inform the search
 * @param {Array} keywords - Additional keywords to include in the search
 * @param {number} maxResults - Maximum number of results to return
 * @param {Object} options - Additional options like force refresh
 * @returns {Promise<Array>} Array of literature references
 */
export const searchPubMedLiterature = async (
  deviceData,
  keywords = [],
  maxResults = 20,
  options = {}
) => {
  try {
    // Build search parameters
    const deviceTerms = [
      deviceData.name,
      deviceData.type,
      deviceData.manufacturer,
      deviceData.model,
      deviceData.category,
      ...(deviceData.indications || []),
    ].filter(Boolean);

    // Combine with keywords and filter out empty strings
    const allTerms = [...deviceTerms, ...keywords].filter(term => term && term.trim().length > 0);

    if (allTerms.length === 0) {
      console.warn('No valid search terms provided for PubMed search');
      return [];
    }

    // Create search query - using AND for more relevant results between device terms and keywords
    // This ensures we get papers that mention both the device AND at least one keyword
    let deviceTermsQuery = deviceTerms.length > 0 ? `(${deviceTerms.join(' OR ')})` : '';
    let keywordsQuery = keywords.length > 0 ? `(${keywords.join(' OR ')})` : '';

    // Build final query based on what we have
    let searchQuery;
    if (deviceTermsQuery && keywordsQuery) {
      searchQuery = `${deviceTermsQuery} AND ${keywordsQuery}`;
    } else {
      searchQuery = deviceTermsQuery || keywordsQuery;
    }

    // Add medical device specific terms to improve relevance
    searchQuery +=
      ' AND ("medical device" OR "clinical evaluation" OR safety OR performance OR "clinical data")';

    // Create a cache key based on the query and result count
    const cacheKey = `${searchQuery}_${maxResults}`;

    // Check cache first unless force refresh is requested
    if (!options.forceRefresh) {
      const cachedResults = cache.get(cache.searches, cacheKey);
      if (cachedResults) {
        console.log('Using cached PubMed search results');
        return cachedResults;
      }
    }

    // Search PubMed with exponential backoff for retries
    const maxRetries = 3;
    let attempt = 0;
    let searchData;

    while (attempt < maxRetries) {
      try {
        // Add API key if available (higher rate limits)
        const apiKeyParam = import.meta.env.VITE_PUBMED_API_KEY
          ? `&api_key=${import.meta.env.VITE_PUBMED_API_KEY}`
          : '';

        const searchUrl = `${PUBMED_API_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=${maxResults}${apiKeyParam}&retmode=json`;

        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
          throw new Error(
            `PubMed search failed: ${searchResponse.statusText} (${searchResponse.status})`
          );
        }

        searchData = await searchResponse.json();
        break; // Success, exit retry loop
      } catch (error) {
        attempt++;
        console.error(`PubMed search attempt ${attempt} failed:`, error);

        if (attempt >= maxRetries) {
          throw error; // Re-throw if we've exhausted retries
        }

        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Check if we have results
    const pmids = searchData?.esearchresult?.idlist || [];
    if (pmids.length === 0) {
      console.log('No PubMed results found for query');
      return [];
    }

    // Fetch details for each PMID with batching for large result sets
    const batchSize = 50; // PubMed recommends max 50 IDs per request
    let allResults = [];

    for (let i = 0; i < pmids.length; i += batchSize) {
      const batchPmids = pmids.slice(i, i + batchSize);

      // Check cache for this batch
      const batchKey = batchPmids.join(',');
      let batchResults = cache.get(cache.summaries, batchKey);

      if (!batchResults || options.forceRefresh) {
        try {
          // Add API key if available
          const apiKeyParam = import.meta.env.VITE_PUBMED_API_KEY
            ? `&api_key=${import.meta.env.VITE_PUBMED_API_KEY}`
            : '';

          const summaryUrl = `${PUBMED_API_BASE}/esummary.fcgi?db=pubmed&id=${batchPmids.join(',')}${apiKeyParam}&retmode=json`;

          // Respect rate limits
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
          }

          const summaryResponse = await fetch(summaryUrl);
          if (!summaryResponse.ok) {
            throw new Error(
              `PubMed summary retrieval failed: ${summaryResponse.statusText} (${summaryResponse.status})`
            );
          }

          const summaryData = await summaryResponse.json();

          // Process and format the literature references
          batchResults = batchPmids
            .map(pmid => {
              const article = summaryData.result[pmid];
              if (!article) return null;

              return {
                id: pmid,
                title: article.title || 'Untitled',
                authors: article.authors
                  ? article.authors.map(author => author.name).join(', ')
                  : 'Unknown',
                journal: article.fulljournalname || article.source || 'Unknown Journal',
                publicationDate: article.pubdate || 'Unknown',
                abstract: article.abstract || 'Abstract not available',
                url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                relevance: null, // To be calculated
                keyFindings: [], // To be populated with AI analysis
                retrievedAt: new Date().toISOString(),
              };
            })
            .filter(Boolean);

          // Cache this batch
          cache.set(cache.summaries, batchKey, batchResults);
        } catch (error) {
          console.error(`Error retrieving batch of PMIDs (${i}-${i + batchSize}):`, error);
          // Continue with other batches but log the error
          batchResults = []; // Empty for this batch
        }
      }

      allResults = [...allResults, ...batchResults];
    }

    if (allResults.length === 0) {
      console.warn('Found PMIDs but failed to retrieve article details');
      return [];
    }

    // Use OpenAI to assess the relevance of papers to the device
    const enrichedResults = await assessLiteratureRelevance(allResults, deviceData);

    // Cache the final results
    cache.set(cache.searches, cacheKey, enrichedResults);

    return enrichedResults;
  } catch (error) {
    console.error('Error searching PubMed literature:', error);

    // Return a user-friendly error that can be displayed in the UI
    throw new Error(
      `Literature search failed: ${error.message}. Please check your search terms and try again.`
    );
  }
};

/**
 * Use OpenAI to assess the relevance of literature to the device
 *
 * @param {Array} literatureItems - Array of literature items from PubMed
 * @param {Object} deviceData - Device information for context
 * @param {Object} options - Optional parameters like forceRefresh
 * @returns {Promise<Array>} Literature items with relevance scores and key findings
 */
export const assessLiteratureRelevance = async (literatureItems, deviceData, options = {}) => {
  // Early return for empty input
  if (!literatureItems || literatureItems.length === 0) {
    return [];
  }

  try {
    // Create a cache key based on the device data and literature items IDs
    const itemIds = literatureItems
      .map(item => item.id)
      .sort()
      .join(',');
    const deviceKey = `${deviceData.name || ''}_${deviceData.type || ''}_${deviceData.model || ''}`;
    const cacheKey = `relevance_${deviceKey}_${itemIds}`;

    // Check cache first unless force refresh is requested
    if (!options.forceRefresh) {
      const cachedAssessment = cache.get(cache.reviews, cacheKey);
      if (cachedAssessment) {
        console.log('Using cached relevance assessment');
        return cachedAssessment;
      }
    }

    // Prepare device information for context - include only what's needed to save tokens
    const deviceContext = {
      name: deviceData.name,
      type: deviceData.type,
      indications: deviceData.indications,
      description: deviceData.description,
      riskClass: deviceData.riskClass,
      intendedUse: deviceData.intendedUse,
    };

    // Process items in batches to avoid token limits
    // 5 items per batch is optimal for GPT-4o's context window
    const batchSize = 5;
    let processedItems = [];

    for (let i = 0; i < literatureItems.length; i += batchSize) {
      const batch = literatureItems.slice(i, i + batchSize);
      const batchItemIds = batch.map(item => item.id).join(',');
      const batchCacheKey = `relevance_batch_${deviceKey}_${batchItemIds}`;

      // Check batch cache
      let enhancedBatch = !options.forceRefresh ? cache.get(cache.reviews, batchCacheKey) : null;

      if (!enhancedBatch) {
        // Prepare minimum data needed for each literature item to save tokens
        const minimizedBatch = batch.map(item => ({
          id: item.id,
          title: item.title,
          abstract: item.abstract,
          journal: item.journal,
          publicationDate: item.publicationDate,
        }));

        // Set up retry logic for OpenAI calls
        let attempts = 0;
        const maxAttempts = 3;
        let success = false;
        let assessments = {};

        while (attempts < maxAttempts && !success) {
          try {
            // If not first attempt, use fallback model
            const modelToUse =
              attempts === 0
                ? 'gpt-4o' // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
                : 'gpt-4';

            console.log(
              `Assessing literature relevance (batch ${i / batchSize + 1}/${Math.ceil(literatureItems.length / batchSize)}) with ${modelToUse}`
            );

            const response = await openai.chat.completions.create({
              model: modelToUse,
              messages: [
                {
                  role: 'system',
                  content: `You are a regulatory medical device specialist evaluating research papers for inclusion in a Clinical Evaluation Report according to MEDDEV 2.7/1 Rev 4 and EU MDR guidelines. 
                  Carefully assess each paper's relevance to the specified medical device based on:
                  1. Device type similarity
                  2. Clinical application relevance 
                  3. Safety/performance data applicability
                  4. Publication date recency
                  5. Study quality and evidence level`,
                },
                {
                  role: 'user',
                  content: `Evaluate the following research papers for relevance to this medical device:
                  
                  Medical Device Information:
                  ${JSON.stringify(deviceContext, null, 2)}
                  
                  Papers to Evaluate:
                  ${JSON.stringify(minimizedBatch, null, 2)}
                  
                  For each paper, provide:
                  1. A relevance score from 0-100% to this specific device (higher = more relevant)
                  2. 2-3 key findings relevant to device safety or performance
                  3. A brief explanation of the relevance assessment
                  4. Evidence level classification (I-IV, where I is highest)
                  
                  Respond in JSON format with the paper ID as the key:
                  {
                    "12345678": {
                      "relevanceScore": 85,
                      "keyFindings": ["Finding 1", "Finding 2"],
                      "relevanceExplanation": "This study directly evaluates devices similar to the one specified...",
                      "evidenceLevel": "II"
                    },
                    ...
                  }`,
                },
              ],
              temperature: 0.2, // Lower temperature for more consistent assessments
              response_format: { type: 'json_object' },
            });

            // Parse and validate the response
            const responseText = response.choices[0].message.content;
            assessments = JSON.parse(responseText);

            // Verify we have assessments for all IDs
            const missingIds = batch.filter(item => !assessments[item.id]).map(item => item.id);
            if (missingIds.length > 0) {
              throw new Error(`Missing assessments for IDs: ${missingIds.join(', ')}`);
            }

            success = true;
          } catch (error) {
            attempts++;
            console.error(`Literature assessment attempt ${attempts} failed:`, error);

            // If last attempt, just use empty assessments but don't fail completely
            if (attempts >= maxAttempts) {
              console.warn('Exhausted retry attempts for literature assessment');
              assessments = batch.reduce((acc, item) => {
                acc[item.id] = {
                  relevanceScore: 50, // Default middle relevance
                  keyFindings: ['Could not automatically extract findings'],
                  relevanceExplanation: 'Automated assessment failed, manual review recommended',
                  evidenceLevel: 'Unknown',
                };
                return acc;
              }, {});
            } else {
              // Exponential backoff with jitter
              const delay = Math.min(
                1000 * Math.pow(2, attempts - 1) + Math.random() * 1000,
                10000
              );
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        // Merge assessments with original items
        enhancedBatch = batch.map(item => {
          const assessment = assessments[item.id] || {};

          return {
            ...item,
            relevance: assessment.relevanceScore || 0,
            keyFindings: assessment.keyFindings || [],
            relevanceExplanation: assessment.relevanceExplanation || 'No assessment available',
            evidenceLevel: assessment.evidenceLevel || 'Unknown',
            assessedAt: new Date().toISOString(),
          };
        });

        // Cache this batch result
        cache.set(cache.reviews, batchCacheKey, enhancedBatch);
      }

      processedItems = [...processedItems, ...enhancedBatch];

      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < literatureItems.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Sort by relevance (highest first)
    const sortedResults = processedItems.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

    // Cache the complete sorted results
    cache.set(cache.reviews, cacheKey, sortedResults);

    return sortedResults;
  } catch (error) {
    console.error('Error assessing literature relevance:', error);

    // Return original items if assessment fails, but add null values for expected fields
    return literatureItems.map(item => ({
      ...item,
      relevance: item.relevance || null,
      keyFindings: item.keyFindings || [],
      relevanceExplanation: item.relevanceExplanation || `Assessment failed: ${error.message}`,
      assessmentError: error.message,
    }));
  }
};

/**
 * Retrieve full text of a publication when available
 *
 * @param {string} pmid - PubMed ID of the publication
 * @returns {Promise<Object>} Full text details when available
 */
export const retrieveFullText = async pmid => {
  try {
    // First check if there's a free full text link
    const linksUrl = `${PUBMED_API_BASE}/elink.fcgi?dbfrom=pubmed&id=${pmid}&cmd=prlinks&retmode=json`;
    const linksResponse = await fetch(linksUrl);

    if (!linksResponse.ok) {
      throw new Error(`Failed to retrieve full text links: ${linksResponse.statusText}`);
    }

    const linksData = await linksResponse.json();
    const fullTextLinks = linksData?.linksets?.[0]?.linksetdbs?.find(
      db => db.linkname === 'pubmed_pmc'
    );

    if (fullTextLinks?.links?.[0]?.url) {
      // Found a direct link to full text
      return {
        pmid,
        fullTextUrl: fullTextLinks.links[0].url,
        source: 'PubMed Central',
        accessType: 'Free',
      };
    }

    // Try PMC database for free full text
    const pmcUrl = `${PUBMED_API_BASE}/efetch.fcgi?db=pmc&id=${pmid}&retmode=json`;
    const pmcResponse = await fetch(pmcUrl);

    if (pmcResponse.ok) {
      const pmcData = await pmcResponse.json();
      if (pmcData?.papers?.[0]?.url) {
        return {
          pmid,
          fullTextUrl: pmcData.papers[0].url,
          source: 'PubMed Central',
          accessType: 'Free',
        };
      }
    }

    // No free full text found
    return {
      pmid,
      fullTextUrl: null,
      source: null,
      accessType: 'Restricted',
      message: 'Full text access requires subscription or purchase',
    };
  } catch (error) {
    console.error(`Error retrieving full text for PMID ${pmid}:`, error);
    return {
      pmid,
      error: error.message,
      fullTextUrl: null,
      accessType: 'Error',
    };
  }
};

/**
 * Compile a comprehensive literature review section for CER
 *
 * @param {Array} relevantLiterature - Array of relevant literature items
 * @param {Object} deviceData - Device information for context
 * @returns {Promise<Object>} Comprehensive literature review section
 */
export const compileLiteratureReview = async (relevantLiterature, deviceData) => {
  try {
    // Get the top 10 most relevant articles
    const topLiterature = relevantLiterature
      .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
      .slice(0, 10);

    // Use OpenAI to compile a comprehensive literature review
    const response = await openai.chat.completions.create({
      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a medical literature expert compiling a literature review section for a Clinical Evaluation Report.
          Your task is to synthesize the provided literature into a comprehensive review that follows MEDDEV 2.7/1 Rev 4 guidelines.
          Focus on clinical evidence related to safety, performance, and benefit-risk determination.`,
        },
        {
          role: 'user',
          content: `Compile a comprehensive literature review section for a Clinical Evaluation Report based on these articles:
          
          Device Information:
          ${JSON.stringify(deviceData, null, 2)}
          
          Relevant Literature:
          ${JSON.stringify(topLiterature, null, 2)}
          
          The literature review should include:
          1. Search methodology summary
          2. Literature appraisal criteria used
          3. Summary of key findings across all papers
          4. Critical analysis of clinical evidence quality
          5. Identified gaps in the literature
          6. Implications for clinical safety and performance
          7. Conclusions supported by the literature
          
          Format this as a formal CER literature review section suitable for regulatory submission.
          Include proper citations when referencing specific papers.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 3000,
    });

    return {
      literatureReviewText: response.choices[0].message.content,
      includedReferences: topLiterature.map(item => ({
        id: item.id,
        title: item.title,
        authors: item.authors,
        journal: item.journal,
        publicationDate: item.publicationDate,
        relevance: item.relevance,
      })),
      totalReferencesReviewed: relevantLiterature.length,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Error compiling literature review:', error);
    throw new Error(`Failed to compile literature review: ${error.message}`);
  }
};

export default {
  searchPubMedLiterature,
  assessLiteratureRelevance,
  retrieveFullText,
  compileLiteratureReview,
};
