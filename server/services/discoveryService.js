/**
 * Discovery Service
 *
 * Provides unified discovery capabilities for literature search and predicate device search
 * across CER and 510(k) modules using vector search with OpenAI-powered fallbacks.
 */

import path from 'path';
import fs from 'fs';
import { pool } from '../utils/database.js';
import { ai } from '../lib/unified-ai-client';

// Initialize OpenAI client
// Setup IEEE API connection
const IEEE_API_KEY = process.env.IEEE_API_KEY;

// Utility functions
async function vectorizeQuery(text) {
  try {
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return embedding.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate text embedding for search');
  }
}

async function performVectorSearch(embedding, type = 'literature', limit = 20) {
  try {
    const table = type === 'literature' ? 'literature_vectors' : 'predicate_devices';
    const query = `
      SELECT id, title, authors, publication_date, journal, similarity(embedding, $1) as similarity
      FROM ${table}
      ORDER BY embedding <-> $1
      LIMIT $2;
    `;

    const result = await pool.query(query, [embedding, limit]);
    return result.rows;
  } catch (error) {
    console.error(`Error performing vector search for ${type}:`, error);
    throw new Error(`Failed to perform ${type} vector search`);
  }
}

async function searchIEEE(query, filters = {}) {
  if (!IEEE_API_KEY) {
    throw new Error('IEEE API key not configured');
  }

  try {
    const baseUrl = 'https://ieeexploreapi.ieee.org/api/v1/search/articles';

    // Build filter parameters
    const params = new URLSearchParams({
      apikey: IEEE_API_KEY,
      format: 'json',
      max_records: 25,
      start_record: 1,
      sort_order: 'desc',
      sort_field: 'article_number',
      querytext: query,
    });

    // Add optional filters
    if (filters.yearStart && filters.yearEnd) {
      params.append('start_year', filters.yearStart);
      params.append('end_year', filters.yearEnd);
    }

    if (filters.contentType) {
      params.append('content_type', filters.contentType);
    }

    const response = await fetch(`${baseUrl}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`IEEE API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.articles || [];
  } catch (error) {
    console.error('Error searching IEEE:', error);
    return [];
  }
}

async function searchPubMed(query, filters = {}) {
  try {
    // PubMed API endpoints
    const searchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
    const fetchUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

    // Build base parameters
    const params = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmode: 'json',
      retmax: 20,
      api_key: process.env.PUBMED_API_KEY || '',
    });

    // Add date filters if provided
    if (filters.yearStart && filters.yearEnd) {
      params.append('mindate', filters.yearStart);
      params.append('maxdate', filters.yearEnd);
      params.append('datetype', 'pdat');
    }

    // Step 1: Search for PMIDs
    const searchResponse = await fetch(`${searchUrl}?${params.toString()}`);
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      return [];
    }

    // Step 2: Fetch article details for these PMIDs
    const fetchParams = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'xml',
      api_key: process.env.PUBMED_API_KEY || '',
    });

    const fetchResponse = await fetch(`${fetchUrl}?${fetchParams.toString()}`);
    const articleXml = await fetchResponse.text();

    // Basic XML parsing to extract article information
    // In a production environment, use a proper XML parser
    const articles = [];
    const articleMatches = articleXml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const articleXml of articleMatches) {
      // Extract basic information
      const pmid = (articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/) || [])[1];
      const title = (articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/) || [])[1];
      const journal = (articleXml.match(/<Title>(.*?)<\/Title>/) || [])[1];
      const year = (articleXml.match(/<Year>(.*?)<\/Year>/) || [])[1];
      const month = (articleXml.match(/<Month>(.*?)<\/Month>/) || [])[1];
      const day = (articleXml.match(/<Day>(.*?)<\/Day>/) || [])[1];

      // Extract authors
      const authorMatches = articleXml.match(/<Author[\s\S]*?<\/Author>/g) || [];
      const authors = authorMatches
        .map(author => {
          const lastName = (author.match(/<LastName>(.*?)<\/LastName>/) || [])[1] || '';
          const initials = (author.match(/<Initials>(.*?)<\/Initials>/) || [])[1] || '';
          return `${lastName} ${initials}`.trim();
        })
        .join(', ');

      // Create date string
      let date = '';
      if (year) {
        date = year;
        if (month) {
          date = `${date}-${month.padStart(2, '0')}`;
          if (day) {
            date = `${date}-${day.padStart(2, '0')}`;
          }
        }
      }

      articles.push({
        id: pmid,
        pmid,
        title: title || 'Unknown Title',
        authors: authors || 'Unknown Authors',
        journal: journal || 'Unknown Journal',
        publication_date: date || 'Unknown Date',
        source: 'PubMed',
      });
    }

    return articles;
  } catch (error) {
    console.error('Error searching PubMed:', error);
    return [];
  }
}

async function searchFDA510K(query, filters = {}) {
  try {
    const baseUrl = 'https://api.fda.gov/device/510k.json';

    // Build query parameters
    const params = new URLSearchParams({
      search: `device_name:"${query}" OR product_code:"${query}"`,
      limit: 20,
    });

    // Add any applicable filters
    if (filters.yearStart && filters.yearEnd) {
      params.set(
        'search',
        `${params.get('search')} AND decision_date:[${filters.yearStart}-01-01 TO ${filters.yearEnd}-12-31]`
      );
    }

    const response = await fetch(`${baseUrl}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`FDA API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    return results.map(item => ({
      id: item.k_number,
      title: item.device_name,
      manufacturer: item.applicant,
      clearance_date: item.decision_date,
      product_code: item.product_code,
      source: 'FDA',
      similarity: 0.9, // Default high similarity for exact matches
      type: 'predicate',
    }));
  } catch (error) {
    console.error('Error searching FDA 510(k) database:', error);
    return [];
  }
}

async function fallbackPredicateSearch(query, deviceContext = '') {
  try {
    // Use OpenAI to handle cases where structured data is unavailable
    const aiResult = await ai.chat({
      model: 'gpt-4o', // Use the latest model for best results
      messages: [
        {
          role: 'system',
          content:
            "You are a medical device regulatory expert with extensive knowledge of FDA 510(k) cleared devices. Based on the query, provide information about relevant predicate devices that might exist for a 510(k) submission. Include real device names, manufacturers, and product codes where possible. Format your response as JSON with an array of 'devices' containing: id (string), title (string), manufacturer (string), clearance_date (string in YYYY-MM-DD format), product_code (string), description (string), and similarity (number between 0-1).",
        },
        {
          role: 'user',
          content: deviceContext
            ? `Find predicate devices similar to: ${query}\n\nDevice context: ${deviceContext}`
            : `Find predicate devices similar to: ${query}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      const result = JSON.parse(aiResult.content);

      if (Array.isArray(result.devices)) {
        return result.devices.map(device => ({
          ...device,
          source: 'AI-Generated',
          type: 'predicate',
          id: device.id || `ai-predicatedevice-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        }));
      }

      return [];
    } catch (parseError) {
      console.error('Failed to parse AI predicate device response:', parseError);

      // Try with a simplified prompt if parsing failed
      const fallbackCompletion = await ai.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              "You are a medical device expert. Create a JSON response with an array called 'devices' containing 5 predicate device examples. Each device should have these fields: id, title, manufacturer, clearance_date, product_code, and similarity.",
          },
          {
            role: 'user',
            content: `Find predicate devices for: ${query}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      try {
        const fallbackResult = JSON.parse(fallbackCompletion.choices[0].message.content);

        if (Array.isArray(fallbackResult.devices)) {
          return fallbackResult.devices.map(device => ({
            ...device,
            source: 'AI-Generated (fallback)',
            type: 'predicate',
            id:
              device.id || `ai-predicatedevice-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          }));
        }
      } catch (finalError) {
        console.error('Final fallback parsing also failed:', finalError);
      }

      return [];
    }
  } catch (error) {
    console.error('Error in AI fallback search:', error);
    // Don't throw, return empty array
    return [];
  }
}

// Main service functions
const discoveryService = {
  /**
   * Unified literature search function
   * Works for both CER and 510(k) contexts
   */
  async searchLiterature(query, filters = {}, context = 'cer') {
    try {
      console.log(`Searching literature for: "${query}" with context: ${context}`);

      // Initialize results array and tracking metrics
      let results = [];
      let searchStats = {
        vectorSearch: { attempted: false, successful: false, resultsCount: 0 },
        ieeeSearch: { attempted: false, successful: false, resultsCount: 0 },
        pubmedSearch: { attempted: false, successful: false, resultsCount: 0 },
        aiSearch: { attempted: false, successful: false, resultsCount: 0 },
      };

      // Tier 1: Vector search with pgvector (primary method)
      try {
        searchStats.vectorSearch.attempted = true;
        const embedding = await vectorizeQuery(query);
        const vectorResults = await performVectorSearch(embedding, 'literature');
        if (vectorResults && vectorResults.length > 0) {
          results = vectorResults;
          searchStats.vectorSearch.successful = true;
          searchStats.vectorSearch.resultsCount = vectorResults.length;
          console.log(`Vector search successful: ${vectorResults.length} results`);
        }
      } catch (error) {
        console.warn('Vector search failed, falling back to API searches:', error.message);
        // Don't throw - continue to fallbacks
      }

      // Tier 2: IEEE Search (first fallback)
      if (results.length < 10) {
        try {
          searchStats.ieeeSearch.attempted = true;
          const ieeeResults = await searchIEEE(query, filters);

          if (ieeeResults && ieeeResults.length > 0) {
            // Transform IEEE results to match our format
            const transformedResults = ieeeResults.map(article => ({
              id:
                article.article_number || `ieee-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              title: article.title || 'Unknown Title',
              authors: article.authors?.authors?.map(a => a.full_name).join(', ') || 'Unknown',
              publication_date: article.publication_date || 'Unknown',
              journal: article.publisher || 'IEEE',
              source: 'IEEE',
              url: article.html_url,
              abstract: article.abstract || '',
              similarity: 0.85, // Default similarity for API results
            }));

            results = [...results, ...transformedResults];
            searchStats.ieeeSearch.successful = true;
            searchStats.ieeeSearch.resultsCount = transformedResults.length;
            console.log(`IEEE search successful: ${transformedResults.length} results`);
          }
        } catch (error) {
          console.warn('IEEE search failed:', error.message);
          // Don't throw - continue to next fallback
        }
      }

      // Tier 3: PubMed Search (second fallback, run regardless for comprehensive results)
      try {
        searchStats.pubmedSearch.attempted = true;
        const pubmedResults = await searchPubMed(query, filters);

        if (pubmedResults && pubmedResults.length > 0) {
          // Remove duplicates before adding PubMed results
          const existingIds = new Set(results.map(r => r.id?.toString()));
          const uniquePubmedResults = pubmedResults.filter(
            article => !existingIds.has(article.id?.toString())
          );

          results = [...results, ...uniquePubmedResults];
          searchStats.pubmedSearch.successful = true;
          searchStats.pubmedSearch.resultsCount = uniquePubmedResults.length;
          console.log(`PubMed search successful: ${uniquePubmedResults.length} unique results`);
        }
      } catch (error) {
        console.warn('PubMed search failed:', error.message);
        // Don't throw - continue to final fallback
      }

      // Tier 4: AI Fallback (final resilience layer)
      if (results.length === 0) {
        try {
          searchStats.aiSearch.attempted = true;
          // Extract key terms from the query to improve search quality
          const keyTermsPrompt = await ai.chat({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'Extract 3-5 key medical/scientific terms from this query for literature search. Return only the terms separated by commas.',
              },
              {
                role: 'user',
                content: query,
              },
            ],
          });

          const keyTerms = keyTermsPrompt.choices[0].message.content;

          // Generate AI-based literature results
          const aiResult = await ai.chat({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  "You are a medical literature expert. Based on the query, provide information about relevant medical literature that might exist. Focus on high-quality, peer-reviewed articles relevant to medical devices and clinical research. Format your response as JSON with an array of 'articles' containing: id (string), title (string), authors (string), publication_date (string in YYYY-MM-DD format where possible), journal (string), abstract (string), and similarity (number between 0-1).",
              },
              {
                role: 'user',
                content: `Find medical literature related to: ${query}\nKey terms to focus on: ${keyTerms}`,
              },
            ],
            response_format: { type: 'json_object' },
          });

          try {
            const aiResult = JSON.parse(aiResult.content);

            if (Array.isArray(aiResult.articles)) {
              const aiGeneratedResults = aiResult.articles.map(article => ({
                ...article,
                source: 'AI-Generated',
                type: 'literature',
                id: article.id || `ai-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
              }));

              results = aiGeneratedResults;
              searchStats.aiSearch.successful = true;
              searchStats.aiSearch.resultsCount = aiGeneratedResults.length;
              console.log(`AI fallback search successful: ${aiGeneratedResults.length} results`);
            }
          } catch (parseError) {
            console.error('Failed to parse AI response:', parseError);
            // Still don't throw - return whatever we have
          }
        } catch (error) {
          console.error('AI fallback search failed:', error);
          // Last fallback failed, but we still shouldn't throw
        }
      }

      // Apply filters
      let filteredResults = results;

      if (filters.yearStart && filters.yearEnd) {
        filteredResults = filteredResults.filter(article => {
          const year = parseInt(article.publication_date?.substring(0, 4));
          return !isNaN(year) && year >= filters.yearStart && year <= filters.yearEnd;
        });
      }

      if (filters.peerReviewedOnly) {
        filteredResults = filteredResults.filter(
          article => article.source !== 'AI-Generated' && article.source !== 'ArXiv'
        );
      }

      // Sort by similarity or date
      if (filters.sortBy === 'date') {
        filteredResults.sort((a, b) => {
          return (
            new Date(b.publication_date || '1900-01-01') -
            new Date(a.publication_date || '1900-01-01')
          );
        });
      } else {
        // Default sort by similarity/relevance
        filteredResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      }

      // Add a flag based on context
      const formattedResults = filteredResults.map(item => ({
        ...item,
        context: context,
        type: 'literature',
      }));

      return formattedResults;
    } catch (error) {
      console.error('Error in searchLiterature:', error);
      throw new Error(`Literature search failed: ${error.message}`);
    }
  },

  /**
   * Search for predicate devices
   * Primarily used in 510(k) context but available to both
   */
  async searchPredicateDevices(query, filters = {}) {
    try {
      console.log(`Searching predicate devices for: "${query}"`);

      // Initialize results array and tracking metrics
      let results = [];
      let searchStats = {
        vectorSearch: { attempted: false, successful: false, resultsCount: 0 },
        fdaSearch: { attempted: false, successful: false, resultsCount: 0 },
        aiSearch: { attempted: false, successful: false, resultsCount: 0 },
      };

      // Extract device key terms for better search
      let deviceKeyTerms = query;
      try {
        // Use a lightweight approach to extract key terms first
        const keyTermsRegex = /(?:for|device|predicate|similar to)\s+(.+?)(?:\.|$)/i;
        const matches = query.match(keyTermsRegex);
        if (matches && matches[1]) {
          deviceKeyTerms = matches[1].trim();
        }
      } catch (error) {
        console.warn('Failed to extract device key terms, using original query');
      }

      // Tier 1: Vector search with pgvector (primary method)
      try {
        searchStats.vectorSearch.attempted = true;
        const embedding = await vectorizeQuery(deviceKeyTerms || query);
        const vectorResults = await performVectorSearch(embedding, 'predicates');

        if (vectorResults && vectorResults.length > 0) {
          results = vectorResults;
          searchStats.vectorSearch.successful = true;
          searchStats.vectorSearch.resultsCount = vectorResults.length;
          console.log(`Vector search successful for predicates: ${vectorResults.length} results`);
        }
      } catch (error) {
        console.warn('Vector search failed for predicates, falling back to API:', error.message);
        // Continue to fallbacks
      }

      // Tier 2: FDA 510(k) database search (direct API fallback)
      try {
        searchStats.fdaSearch.attempted = true;
        const fdaResults = await searchFDA510K(deviceKeyTerms || query, filters);

        if (fdaResults && fdaResults.length > 0) {
          // Remove duplicates before adding FDA results
          const existingIds = new Set(results.map(r => r.id?.toString()));
          const uniqueFdaResults = fdaResults.filter(
            device => !existingIds.has(device.id?.toString())
          );

          results = [...results, ...uniqueFdaResults];
          searchStats.fdaSearch.successful = true;
          searchStats.fdaSearch.resultsCount = uniqueFdaResults.length;
          console.log(`FDA 510(k) search successful: ${uniqueFdaResults.length} unique results`);
        }
      } catch (error) {
        console.warn('FDA 510(k) search failed:', error.message);
        // Continue to final fallback
      }

      // Tier 3: AI fallback (final resilience layer)
      if (results.length === 0) {
        try {
          searchStats.aiSearch.attempted = true;

          // First extract device classification and key attributes to improve search
          const deviceAnalysisPrompt = await ai.chat({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a medical device regulatory expert. Extract the device type, classification (I, II, or III if mentioned), and key technical attributes from this query. Format your response as a comma-separated list of terms.',
              },
              {
                role: 'user',
                content: query,
              },
            ],
          });

          const deviceAnalysis = deviceAnalysisPrompt.choices[0].message.content;

          // Use the enhanced fallback predicate search with additional context
          const aiResults = await fallbackPredicateSearch(query, deviceAnalysis);

          if (aiResults && aiResults.length > 0) {
            results = aiResults;
            searchStats.aiSearch.successful = true;
            searchStats.aiSearch.resultsCount = aiResults.length;
            console.log(`AI fallback predicate search successful: ${aiResults.length} results`);
          }
        } catch (error) {
          console.error('AI fallback predicate search failed:', error);
          // Last fallback, still don't throw
        }
      }

      // Apply filters
      let filteredResults = results;

      if (filters.yearStart && filters.yearEnd) {
        filteredResults = filteredResults.filter(device => {
          const year = parseInt(device.clearance_date?.substring(0, 4));
          return !isNaN(year) && year >= filters.yearStart && year <= filters.yearEnd;
        });
      }

      // Deduplicate results based on device name and manufacturer
      const uniqueDevices = new Map();
      filteredResults.forEach(device => {
        const key = `${device.title?.toLowerCase() || ''}|${device.manufacturer?.toLowerCase() || ''}`;
        // Keep the result with the highest similarity score
        if (
          !uniqueDevices.has(key) ||
          (device.similarity || 0) > (uniqueDevices.get(key).similarity || 0)
        ) {
          uniqueDevices.set(key, device);
        }
      });

      // Convert back to array and sort by similarity (relevance)
      const finalResults = Array.from(uniqueDevices.values());
      finalResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

      // Add search stats as metadata
      const resultWithMetadata = {
        results: finalResults,
        metadata: {
          query: query,
          enhancedQuery: deviceKeyTerms !== query ? deviceKeyTerms : undefined,
          totalResults: finalResults.length,
          searchStats: searchStats,
        },
      };

      return finalResults;
    } catch (error) {
      console.error('Error in searchPredicateDevices:', error);
      // Even in the outer catch block, try to return something useful
      const fallbackResults = [];
      try {
        // Last-ditch effort: try a simple AI fallback if everything else failed
        const aiResults = await fallbackPredicateSearch(query);
        if (aiResults && aiResults.length > 0) {
          return aiResults;
        }
      } catch (finalError) {
        console.error('Final fallback also failed:', finalError);
      }

      // If we absolutely can't get results, return empty array instead of throwing
      return fallbackResults;
    }
  },

  /**
   * Process uploaded literature file
   * Extracts text, generates embeddings, and stores in database
   */
  async processLiteratureFile(fileBuffer, filename) {
    try {
      console.log(`Processing literature file: ${filename}`);

      // Extract text from PDF
      let extractedText = 'Error extracting text';

      try {
        // Use OpenAI to extract structured information from PDF
        const base64 = fileBuffer.toString('base64');

        const aiResult = await ai.chat({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are a medical literature extraction expert. Extract key information from this PDF into a structured format including title, authors, publication date, journal, abstract, and key findings. Format as JSON.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract key information from this medical literature PDF',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        });

        const extractedData = JSON.parse(aiResult.content);
        extractedText = JSON.stringify(extractedData);

        // Generate embedding
        const embedding = await vectorizeQuery(
          `${extractedData.title} ${extractedData.abstract || ''}`
        );

        // Store in database
        const query = `
          INSERT INTO literature_vectors (
            title, authors, publication_date, journal, abstract, full_text, filename, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id;
        `;

        const values = [
          extractedData.title || 'Unknown Title',
          extractedData.authors || 'Unknown Authors',
          extractedData.publication_date || new Date().toISOString().split('T')[0],
          extractedData.journal || 'Unknown Journal',
          extractedData.abstract || '',
          extractedText,
          filename,
          embedding,
        ];

        const result = await pool.query(query, values);

        return {
          success: true,
          id: result.rows[0].id,
          metadata: extractedData,
        };
      } catch (error) {
        console.error('Error processing literature file:', error);
        throw new Error(`Failed to process literature file: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in processLiteratureFile:', error);
      throw new Error(`Literature file processing failed: ${error.message}`);
    }
  },

  /**
   * Generate literature review from selected articles
   */
  async generateLiteratureReview(selectedArticles, deviceDescription, context = 'cer') {
    try {
      console.log(
        `Generating literature review for ${selectedArticles.length} articles in ${context} context`
      );

      const articleDetails = selectedArticles
        .map(
          (article, index) =>
            `Article ${index + 1}: "${article.title}" by ${article.authors} (${article.publication_date || 'unknown date'})`
        )
        .join('\n');

      // Use different prompts based on context
      let systemPrompt = '';

      if (context === '510k') {
        systemPrompt = `You are a medical device regulatory expert specializing in 510(k) submissions. Your task is to create a comprehensive literature review section that focuses on demonstrating substantial equivalence to predicate devices and satisfying FDA requirements. The review should emphasize safety, effectiveness, and technological characteristics compared to predicates.`;
      } else {
        // Default CER context
        systemPrompt = `You are a medical device regulatory expert specializing in Clinical Evaluation Reports (CERs) under EU MDR. Your task is to create a comprehensive literature review section that establishes the current state of knowledge about the device's safety and performance compared to alternatives. The review should emphasize clinical data, post-market experience, and benefit-risk determinations.`;
      }

      const aiResult = await ai.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Generate a comprehensive literature review for the following medical device:\n\n${deviceDescription}\n\nBased on these selected articles:\n${articleDetails}\n\nThe review should be well-structured with sections including Introduction, Methods, Results, Analysis, and Conclusion. Include appropriate citations in IEEE format.`,
          },
        ],
      });

      const review = aiResult.content;

      // Store the generated review
      const query = `
        INSERT INTO literature_reviews (
          device_description, context, articles_count, content, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING id;
      `;

      const values = [deviceDescription, context, selectedArticles.length, review];

      const result = await pool.query(query, values);

      return {
        success: true,
        id: result.rows[0].id,
        review: review,
        articleCount: selectedArticles.length,
      };
    } catch (error) {
      console.error('Error in generateLiteratureReview:', error);
      throw new Error(`Literature review generation failed: ${error.message}`);
    }
  },

  /**
   * Generate a predicate device comparison report
   */
  async generatePredicateComparison(selectedPredicates, deviceDescription) {
    try {
      console.log(
        `Generating enhanced predicate comparison for ${selectedPredicates.length} devices`
      );

      // Step 1: Enhance predicate devices with additional regulatory data when available
      const enhancedPredicates = await Promise.all(
        selectedPredicates.map(async device => {
          try {
            // Try to get additional FDA data for this predicate if it has a k_number
            if (device.k_number) {
              try {
                const fdaResponse = await fetch(
                  `https://api.fda.gov/device/510k.json?search=k_number:"${device.k_number}"&limit=1`
                );
                if (fdaResponse.ok) {
                  const fdaData = await fdaResponse.json();
                  if (fdaData.results && fdaData.results.length > 0) {
                    const fdaDevice = fdaData.results[0];
                    // Enhance device with additional FDA data
                    return {
                      ...device,
                      product_code: fdaDevice.product_code || device.product_code,
                      device_class: fdaDevice.device_class || device.device_class,
                      advisory_committee: fdaDevice.advisory_committee || device.advisory_committee,
                      regulatory_enhanced: true,
                    };
                  }
                }
              } catch (fdaError) {
                console.warn(
                  `Could not fetch additional FDA data for ${device.k_number}:`,
                  fdaError.message
                );
                // Continue with original device data
              }
            }
            return device;
          } catch (enhanceError) {
            console.warn(`Error enhancing predicate device:`, enhanceError.message);
            return device; // Return original device if enhancement fails
          }
        })
      );

      // Step 2: Format detailed predicate information for more comprehensive comparison
      const predicateDetails = enhancedPredicates
        .map((device, index) => {
          const details = [
            `Predicate ${index + 1}: "${device.title || device.device_name}" by ${device.manufacturer || device.applicant_100} (${device.clearance_date || device.decision_date || 'unknown date'})`,
            `K Number: ${device.k_number || 'N/A'}`,
            `Product Code: ${device.product_code || 'N/A'}`,
            `Device Class: ${device.device_class || 'N/A'}`,
          ];

          // Add any additional details that are available
          if (device.advisory_committee)
            details.push(`Advisory Committee: ${device.advisory_committee}`);
          if (device.intended_use) details.push(`Intended Use: ${device.intended_use}`);

          return details.join('\n');
        })
        .join('\n\n');

      // Step 3: Generate a more comprehensive comparison with structured sections
      const aiResult = await ai.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a senior medical device regulatory expert specializing in 510(k) submissions and FDA compliance.
            Your task is to create a comprehensive predicate device comparison that demonstrates substantial equivalence according to FDA requirements.

            Include these specific sections in your analysis:
            1. Tabular Comparison - A detailed table comparing key characteristics
            2. Intended Use Comparison - Analysis of intended use similarities/differences
            3. Technological Characteristics - Detailed analysis of technologies used
            4. Performance Data Comparison - Analysis of performance specifications
            5. Safety Considerations - Safety-related comparison points
            6. Risk Analysis - Any differential risks between subject and predicate devices
            7. Substantial Equivalence Conclusion - Summary determination with regulatory rationale

            Use proper FDA regulatory terminology and focus on the aspects most critical for FDA reviewers.`,
          },
          {
            role: 'user',
            content: `Generate an enhanced predicate device comparison report for the following medical device:

            SUBJECT DEVICE INFORMATION:
            ${JSON.stringify(deviceDescription, null, 2)}

            PREDICATE DEVICE INFORMATION:
            ${predicateDetails}

            REQUIREMENTS:
            1. Create a comprehensive HTML comparison table with these columns: Feature/Characteristic, Subject Device, Predicate Device(s), Substantial Equivalence
            2. For multiple predicates, include each predicate in its own column
            3. Include a thorough analysis section after the table discussing key similarities and differences
            4. Highlight any potential regulatory concerns or advantages in the comparison
            5. Provide a clear substantial equivalence determination with regulatory justification
            6. Format the output in clean, properly formatted HTML that can be directly embedded in documents`,
          },
        ],
      });

      const comparison = aiResult.content;

      // Step 4: Enhance with scientific literature references if available
      let enhancedComparison = comparison;
      try {
        // Get device keywords for literature search
        const keywordsCompletion = await ai.chat({
          model: 'gpt-3.5-turbo', // Use smaller model for efficiency
          messages: [
            {
              role: 'system',
              content:
                'Extract 3-5 key medical/technical terms from this device description for literature search. Return only the terms separated by commas.',
            },
            {
              role: 'user',
              content: JSON.stringify(deviceDescription),
            },
          ],
        });

        const searchTerms = keywordsCompletion.choices[0].message.content;

        // Search for relevant literature to support the comparison
        let literatureResults = [];
        try {
          // Try PubMed search if API key is available
          if (process.env.PUBMED_API_KEY) {
            literatureResults = await this.searchLiterature(searchTerms, {}, '510k');
          }
        } catch (litError) {
          console.warn('Literature search failed:', litError.message);
        }

        // If we have literature results, enhance the comparison with references
        if (literatureResults.length > 0) {
          const referencesCompletion = await ai.chat({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a medical device regulatory documentation expert. Your task is to enhance the provided predicate device comparison with relevant scientific literature references from the provided literature.',
              },
              {
                role: 'user',
                content: `Enhance this predicate device comparison with relevant scientific literature references:

                COMPARISON DOCUMENT:
                ${comparison}

                AVAILABLE LITERATURE REFERENCES:
                ${JSON.stringify(literatureResults.slice(0, 5), null, 2)}

                Add a "Scientific Literature Support" section at the end with proper citations to these references where they support the comparison points. Only reference literature that is directly relevant to the devices being compared.`,
              },
            ],
          });

          enhancedComparison = referencesCompletion.choices[0].message.content;
        }
      } catch (literatureError) {
        console.warn('Literature enhancement failed:', literatureError.message);
        // Continue with the original comparison
      }

      // Step 5: Store the enhanced comparison
      const query = `
        INSERT INTO predicate_comparisons (
          device_description, predicates_count, content, enhanced_content, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING id;
      `;

      const values = [
        JSON.stringify(deviceDescription),
        enhancedPredicates.length,
        comparison,
        enhancedComparison,
      ];

      const result = await pool.query(query, values);

      // Return the comprehensive comparison data
      return {
        success: true,
        id: result.rows[0].id,
        comparison: enhancedComparison,
        predicateCount: enhancedPredicates.length,
        predicates: enhancedPredicates.map(p => ({
          id: p.id || p.k_number,
          title: p.title || p.device_name,
          manufacturer: p.manufacturer || p.applicant_100,
          k_number: p.k_number,
        })),
        analysisDate: new Date().toISOString(),
        regulatoryContext: 'FDA 510(k) Substantial Equivalence',
        format: 'html',
      };
    } catch (error) {
      console.error('Error in generatePredicateComparison:', error);
      throw new Error(`Enhanced predicate comparison generation failed: ${error.message}`);
    }
  },

  /**
   * Get all saved literature reviews
   */
  async getSavedReviews() {
    try {
      const query = `
        SELECT id, device_description, context, articles_count,
               created_at, LEFT(content, 200) as preview
        FROM literature_reviews
        ORDER BY created_at DESC;
      `;

      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error in getSavedReviews:', error);
      throw new Error(`Failed to retrieve saved reviews: ${error.message}`);
    }
  },

  /**
   * Get a specific saved review by ID
   */
  async getReviewById(id) {
    try {
      const query = `
        SELECT * FROM literature_reviews WHERE id = $1;
      `;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        throw new Error('Review not found');
      }

      return result.rows[0];
    } catch (error) {
      console.error(`Error in getReviewById for ID ${id}:`, error);
      throw new Error(`Failed to retrieve review: ${error.message}`);
    }
  },

  /**
   * Create SQL tables if they don't exist
   */
  async ensureTablesExist() {
    try {
      // Create literature vectors table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS literature_vectors (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          authors TEXT,
          publication_date DATE,
          journal TEXT,
          abstract TEXT,
          full_text TEXT,
          filename TEXT,
          embedding VECTOR(1536),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create predicate devices table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS predicate_devices (
          id SERIAL PRIMARY KEY,
          k_number TEXT,
          device_name TEXT NOT NULL,
          manufacturer TEXT,
          clearance_date DATE,
          product_code TEXT,
          device_description TEXT,
          embedding VECTOR(1536),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create literature reviews table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS literature_reviews (
          id SERIAL PRIMARY KEY,
          device_description TEXT NOT NULL,
          context TEXT DEFAULT 'cer',
          articles_count INTEGER,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create predicate comparisons table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS predicate_comparisons (
          id SERIAL PRIMARY KEY,
          device_description TEXT NOT NULL,
          predicates_count INTEGER,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('All required tables exist or were created');
      return true;
    } catch (error) {
      console.error('Error ensuring tables exist:', error);
      throw new Error(`Failed to create required database tables: ${error.message}`);
    }
  },
};

// Export the service
export default discoveryService;
