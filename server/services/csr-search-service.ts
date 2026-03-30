// CSR Search Service
// This service connects to the deep semantic layer for intelligent CSR search

import fs from 'fs';
import path from 'path';
import { huggingFaceService } from '../huggingface-service';
import { performDeepCsrSearch, isOpenAIApiKeyAvailable } from '../deep-csr-analyzer';
import { generateSearchContextSummary } from '../openai-service';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('csr-search');

// Constants
const PROCESSED_CSR_DIR = path.join(process.cwd(), 'data/processed_csrs');

// Type definitions
interface CSRData {
  csr_id: string;
  title: string;
  indication: string;
  phase: string;
  outcome?: string;
  sample_size?: number;
  sponsor?: string;
  date?: string;
  embedding?: number[];
  // Any other properties in the CSR data
  [key: string]: any;
}

// In-memory storage for embeddings and data
let embeddingStore: CSRData[] = [];
let isInitialized = false;

export class CSRSearchService {
  /**
   * Initialize the search service and load embeddings
   */
  async initialize() {
    if (isInitialized) return;

    log.debug('🔍 Initializing CSR Search Service with Deep Semantic Integration...');

    // Create directory if it doesn't exist
    if (!fs.existsSync(PROCESSED_CSR_DIR)) {
      fs.mkdirSync(PROCESSED_CSR_DIR, { recursive: true });
      log.debug(`Created directory: ${PROCESSED_CSR_DIR}`);
    }

    // Load CSR data into memory
    await this.loadEmbeddings();

    isInitialized = true;
    log.debug(`✅ CSR Search Service initialized with ${embeddingStore.length} CSRs`);

    // Log availability of semantic search capabilities
    const semanticSearchAvailable = isOpenAIApiKeyAvailable();
    if (semanticSearchAvailable) {
      log.debug('✅ Deep semantic search capabilities are available');
    } else {
      log.warn('⚠️ Deep semantic search is NOT available (missing OPENAI_API_KEY)');
    }
  }

  /**
   * Load all CSR embeddings into memory
   */
  async loadEmbeddings() {
    embeddingStore = [];

    try {
      const files = fs.readdirSync(PROCESSED_CSR_DIR);

      for (const filename of files) {
        if (filename.endsWith('.json')) {
          const filePath = path.join(PROCESSED_CSR_DIR, filename);

          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);

            // Add CSR data to store, ensuring it has a csr_id
            if (!data.csr_id) {
              // Extract ID from filename (e.g., HC-1240.json -> HC-1240)
              data.csr_id = path.basename(filename, '.json');

              // Write updated data back to file
              fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            }

            embeddingStore.push(data);
          } catch (error) {
            log.error(`Error loading CSR file ${filename}:`, error);
          }
        }
      }

      log.debug(`Loaded ${embeddingStore.length} CSRs into memory`);
    } catch (error) {
      log.error('Error loading CSR embeddings:', error);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    // Check for valid vectors
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    // Handle edge cases
    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search for CSRs by query text and/or filters
   * This now integrates with the deep semantic layer when a query is provided
   */
  async searchCSRs(params: {
    query_text?: string;
    indication?: string;
    phase?: string;
    outcome?: string;
    min_sample_size?: number;
    limit?: number;
  }): Promise<{
    csrs: CSRData[];
    results_count: number;
  }> {
    // Initialize if not already done
    if (!isInitialized) {
      await this.initialize();
    }

    // Default limit
    const limit = params.limit || 10;

    // Use deep semantic search if a query is provided and API key is available
    if (params.query_text && params.query_text.trim() && isOpenAIApiKeyAvailable()) {
      try {
        log.debug('Using deep semantic search for query:', params.query_text);

        // Construct search options
        const searchOptions = {
          topK: limit,
          searchType: 'csr', // Default to CSR search type
        };

        // Call deep semantic search
        const semanticResults = await performDeepCsrSearch(params.query_text, searchOptions);

        if (semanticResults.error) {
          log.error('Semantic search error:', semanticResults.error);
          // Fall back to basic search
        } else {
          // Process and filter semantic results
          let csrs = semanticResults.results || [];

          // Apply filters to semantic results
          if (params.indication && params.indication !== 'Any') {
            csrs = csrs.filter(
              csr =>
                csr.indication &&
                csr.indication.toLowerCase().includes(params.indication!.toLowerCase())
            );
          }

          if (params.phase && params.phase !== 'Any') {
            csrs = csrs.filter(
              csr => csr.phase && csr.phase.toLowerCase().includes(params.phase!.toLowerCase())
            );
          }

          if (params.outcome) {
            csrs = csrs.filter(
              csr =>
                csr.outcome && csr.outcome.toLowerCase().includes(params.outcome!.toLowerCase())
            );
          }

          if (params.min_sample_size) {
            csrs = csrs.filter(
              csr => csr.sample_size && csr.sample_size >= params.min_sample_size!
            );
          }

          // Get the limited results
          const limitedResults = csrs.slice(0, limit);

          // Generate context summaries for each result if OpenAI is available
          if (isOpenAIApiKeyAvailable()) {
            // Process summaries in parallel
            await Promise.all(
              limitedResults.map(async csr => {
                try {
                  // Generate a context summary explaining why this result matches
                  csr.context_summary = await generateSearchContextSummary(
                    params.query_text || '',
                    csr
                  );
                } catch (error) {
                  log.error('Error generating context summary:', error);
                  csr.context_summary = ''; // Set empty summary on error
                }
              })
            );
          }

          return {
            csrs: limitedResults,
            results_count: csrs.length,
          };
        }
      } catch (error) {
        log.error('Error in semantic search:', error);
        // Fall back to basic search
      }
    }

    // If we get here, either semantic search failed, is unavailable, or no query was provided
    // Fall back to basic embedding-based search
    log.debug('Using basic vector search with filters');

    // Start with all CSRs in memory
    let results = [...embeddingStore];

    // Apply filters
    if (params.indication && params.indication !== 'Any') {
      results = results.filter(
        csr =>
          csr.indication && csr.indication.toLowerCase().includes(params.indication!.toLowerCase())
      );
    }

    if (params.phase && params.phase !== 'Any') {
      results = results.filter(
        csr => csr.phase && csr.phase.toLowerCase().includes(params.phase!.toLowerCase())
      );
    }

    if (params.outcome) {
      results = results.filter(
        csr => csr.outcome && csr.outcome.toLowerCase().includes(params.outcome!.toLowerCase())
      );
    }

    if (params.min_sample_size) {
      results = results.filter(
        csr => csr.sample_size && csr.sample_size >= params.min_sample_size!
      );
    }

    // Calculate similarity scores if query text is provided
    if (params.query_text && params.query_text.trim()) {
      try {
        // Get embedding for query text using OpenAI
        const queryEmbedding = await huggingFaceService.generateEmbeddings(params.query_text);

        // Calculate similarity for each CSR
        const scoredResults = results
          .map(csr => {
            // Only calculate similarity if CSR has embedding
            const similarity = csr.embedding
              ? this.cosineSimilarity(queryEmbedding, csr.embedding)
              : 0;

            return {
              ...csr,
              similarity,
            };
          })
          .filter(csr => csr.similarity > 0)
          .sort((a, b) => b.similarity - a.similarity);

        results = scoredResults;
      } catch (error) {
        log.error('Error getting query embedding:', error);
        // Continue with filtered results but without similarity ranking
      }
    }

    // Limit results
    const limitedResults = results.slice(0, limit);

    // Generate context summaries for each result if OpenAI is available and a query was provided
    if (isOpenAIApiKeyAvailable() && params.query_text && params.query_text.trim()) {
      // Process summaries in parallel
      await Promise.all(
        limitedResults.map(async csr => {
          try {
            // Generate a context summary explaining why this result matches
            csr.context_summary = await generateSearchContextSummary(params.query_text || '', csr);
          } catch (error) {
            log.error('Error generating context summary:', error);
            csr.context_summary = ''; // Set empty summary on error
          }
        })
      );
    }

    return {
      csrs: limitedResults,
      results_count: results.length,
    };
  }

  /**
   * Get CSR details by ID
   */
  async getCSRById(id: string): Promise<CSRData | null> {
    // Initialize if not already done
    if (!isInitialized) {
      await this.initialize();
    }

    // First check in-memory store
    const csr = embeddingStore.find(c => c.csr_id === id);

    // If not found in memory, try to load from file
    if (!csr) {
      const filePath = path.join(PROCESSED_CSR_DIR, `${id}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(content);
        } catch (error) {
          log.error(`Error loading CSR file ${filePath}:`, error);
        }
      }
      return null;
    }

    return csr;
  }

  /**
   * Get basic search results without AI processing (fallback for quota issues)
   */
  getBasicResults(query: string, limit: number = 10): { csrs: CSRData[]; results_count: number } {
    if (!isInitialized) {
      log.debug('Service not initialized, returning empty results');
      return { csrs: [], results_count: 0 };
    }

    // Basic text search across title and indication
    const filteredCsrs = embeddingStore.filter(csr => {
      if (!query || query.trim() === '') {
        return true; // Return all if no query
      }

      const searchText = query.toLowerCase();
      const title = (csr.title || '').toLowerCase();
      const indication = (csr.indication || '').toLowerCase();
      const phase = (csr.phase || '').toLowerCase();

      return (
        title.includes(searchText) || indication.includes(searchText) || phase.includes(searchText)
      );
    });

    // Apply limit
    const limitedCsrs = filteredCsrs.slice(0, limit);

    return {
      csrs: limitedCsrs,
      results_count: filteredCsrs.length,
    };
  }

  /**
   * Get stats about the CSR database
   */
  async getStats(): Promise<{
    total_csrs: number;
    indications: Record<string, number>;
    phases: Record<string, number>;
    outcomes: Record<string, number>;
    semantic_search_available: boolean;
  }> {
    // Initialize if not already done
    if (!isInitialized) {
      await this.initialize();
    }

    // Count indications
    const indications: Record<string, number> = {};
    embeddingStore.forEach(csr => {
      if (csr.indication) {
        indications[csr.indication] = (indications[csr.indication] || 0) + 1;
      }
    });

    // Count phases
    const phases: Record<string, number> = {};
    embeddingStore.forEach(csr => {
      if (csr.phase) {
        phases[csr.phase] = (phases[csr.phase] || 0) + 1;
      }
    });

    // Count outcomes
    const outcomes: Record<string, number> = {};
    embeddingStore.forEach(csr => {
      if (csr.outcome) {
        outcomes[csr.outcome] = (outcomes[csr.outcome] || 0) + 1;
      }
    });

    return {
      total_csrs: embeddingStore.length,
      indications,
      phases,
      outcomes,
      semantic_search_available: isOpenAIApiKeyAvailable(),
    };
  }
}

// Export singleton instance
export const csrSearchService = new CSRSearchService();
