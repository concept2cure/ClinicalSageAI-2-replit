import { db } from '../db/index.js';
import { documentVersions, components, ragChunks, ragDocuments } from '../../shared/schema.js';
import { sql, and, or, ilike, eq, desc } from 'drizzle-orm';
import regulatoryAIPhase3 from './regulatoryAIServicePhase3.js';

/**
 * Hybrid Search Engine for Regulatory Documents
 * Combines vector similarity search with keyword search for optimal retrieval
 * Implements weighted fusion with regulatory bias
 */
class RegulatorySearchEngine {
  constructor() {
    // Weights for hybrid search fusion
    this.weights = {
      semantic: 0.6,  // Vector similarity weight
      keyword: 0.4,   // Keyword match weight
      regulatory: 0.2  // Bonus weight for regulatory context
    };
    
    // Cache for search results (5-minute TTL)
    this.searchCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Regulatory term patterns for boosting
    this.regulatoryPatterns = [
      /\bFDA\b/i,
      /\bEMA\b/i,
      /\bICH\b/i,
      /\bModule [0-9]\b/i,
      /\b[0-9]+\.[0-9]+\.[A-Z]\b/,  // CTD sections like 3.2.S
      /\beCTD\b/i,
      /\b21 CFR\b/i,
      /\bPart [0-9]+\b/i,
      /\bGxP\b/i,
      /\bCDISC\b/i
    ];
  }
  
  /**
   * Perform hybrid search combining semantic and keyword search
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Ranked search results
   */
  async hybridSearch(query, options = {}) {
    const {
      limit = 10,
      organizationId = null,
      moduleFilter = null,
      minScore = 0.5,
      searchMode = 'hybrid' // 'hybrid', 'semantic', 'keyword'
    } = options;
    
    // Check cache first
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }
    
    let results = [];
    
    try {
      // Parallel execution of search strategies
      const [semanticResults, keywordResults] = await Promise.all([
        searchMode !== 'keyword' ? this.semanticSearch(query, { limit, organizationId, moduleFilter }) : Promise.resolve([]),
        searchMode !== 'semantic' ? this.keywordSearch(query, { limit, organizationId, moduleFilter }) : Promise.resolve([])
      ]);
      
      // Merge and rank results
      results = this.fuseResults(semanticResults, keywordResults, query);
      
      // Apply minimum score filter
      results = results.filter(r => r.score >= minScore);
      
      // Limit results
      results = results.slice(0, limit);
      
      // Add regulatory context
      results = await this.enrichWithRegulatoryContext(results);
      
      // Cache the results
      this.cacheResult(cacheKey, results);
      
    } catch (error) {
      console.error('Hybrid search error:', error);
      throw error;
    }
    
    return results;
  }
  
  /**
   * Semantic search using vector similarity
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Vector search results
   */
  async semanticSearch(query, options = {}) {
    const { limit = 10, organizationId, moduleFilter } = options;
    
    try {
      // Generate embedding for query
      const embeddingResult = await regulatoryAIPhase3.generateEmbedding(query);
      
      if (!embeddingResult.success) {
        console.error('Failed to generate embedding:', embeddingResult.error);
        return [];
      }
      
      const queryEmbedding = embeddingResult.embedding;
      
      // Build WHERE clause properly without sql.raw
      const whereConditions = [sql`dv.embedding IS NOT NULL`];
      
      if (organizationId) {
        whereConditions.push(sql`dv.organization_id = ${organizationId}`);
      }
      if (moduleFilter) {
        whereConditions.push(sql`dv.module ILIKE ${`%${moduleFilter}%`}`);
      }
      
      // Construct WHERE clause by combining conditions
      const whereClause = whereConditions.length > 0
        ? sql`WHERE ${sql.join(whereConditions, sql` AND `)}`
        : sql``;
      
      // Perform vector similarity search using pgvector
      const similarityQuery = sql`
        SELECT 
          dv.id,
          dv.document_id,
          dv.version,
          dv.chunk_text,
          dv.chunk_index,
          dv.module,
          dv.semantic_metadata,
          1 - (dv.embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity_score
        FROM document_versions dv
        ${whereClause}
        ORDER BY dv.embedding <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit}
      `;
      
      const results = await db.execute(similarityQuery);
      
      return results.rows.map(row => ({
        id: row.id,
        documentId: row.document_id,
        version: row.version,
        content: row.chunk_text,
        chunkIndex: row.chunk_index,
        module: row.module,
        metadata: row.semantic_metadata,
        score: row.similarity_score,
        matchType: 'semantic'
      }));
      
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
    }
  }
  
  /**
   * Keyword search using full-text search
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} - Keyword search results
   */
  async keywordSearch(query, options = {}) {
    const { limit = 10, organizationId, moduleFilter } = options;
    
    try {
      // Prepare search terms
      const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      
      // Build WHERE conditions
      const conditions = [];
      
      // Full-text search conditions
      searchTerms.forEach(term => {
        conditions.push(ilike(components.content, `%${term}%`));
      });
      
      // Add filters
      if (organizationId) {
        conditions.push(eq(components.organizationId, organizationId));
      }
      if (moduleFilter) {
        conditions.push(ilike(components.module, `%${moduleFilter}%`));
      }
      
      // Execute keyword search
      const results = await db
        .select({
          id: components.id,
          udi: components.udi,
          content: components.content,
          type: components.type,
          module: components.module,
          version: components.version,
          metadata: components.metadata
        })
        .from(components)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(components.updatedAt))
        .limit(limit);
      
      // Calculate keyword relevance scores
      return results.map(result => {
        let score = 0;
        const contentLower = result.content.toLowerCase();
        
        // Count term matches
        searchTerms.forEach(term => {
          const matches = (contentLower.match(new RegExp(term, 'gi')) || []).length;
          score += matches * 0.1;
        });
        
        // Boost for exact phrase match
        if (contentLower.includes(query.toLowerCase())) {
          score += 0.5;
        }
        
        // Boost for regulatory terms
        this.regulatoryPatterns.forEach(pattern => {
          if (pattern.test(result.content)) {
            score += 0.2;
          }
        });
        
        // Normalize score
        score = Math.min(score, 1.0);
        
        return {
          id: result.id,
          udi: result.udi,
          content: result.content,
          type: result.type,
          module: result.module,
          version: result.version,
          metadata: result.metadata,
          score: score,
          matchType: 'keyword'
        };
      });
      
    } catch (error) {
      console.error('Keyword search error:', error);
      return [];
    }
  }
  
  /**
   * Fuse semantic and keyword results with weighted scoring
   * @param {Array} semanticResults - Results from semantic search
   * @param {Array} keywordResults - Results from keyword search
   * @param {string} query - Original query for regulatory boosting
   * @returns {Array} - Fused and ranked results
   */
  fuseResults(semanticResults, keywordResults, query) {
    const fusedMap = new Map();
    
    // Process semantic results
    semanticResults.forEach(result => {
      const key = result.id || result.udi;
      fusedMap.set(key, {
        ...result,
        semanticScore: result.score * this.weights.semantic,
        keywordScore: 0,
        fusedScore: result.score * this.weights.semantic
      });
    });
    
    // Process keyword results
    keywordResults.forEach(result => {
      const key = result.id || result.udi;
      if (fusedMap.has(key)) {
        // Combine scores for overlapping results
        const existing = fusedMap.get(key);
        existing.keywordScore = result.score * this.weights.keyword;
        existing.fusedScore = existing.semanticScore + existing.keywordScore;
      } else {
        // Add keyword-only result
        fusedMap.set(key, {
          ...result,
          semanticScore: 0,
          keywordScore: result.score * this.weights.keyword,
          fusedScore: result.score * this.weights.keyword
        });
      }
    });
    
    // Apply regulatory boost
    fusedMap.forEach((result, key) => {
      let regulatoryBoost = 0;
      
      // Check for regulatory patterns in content
      this.regulatoryPatterns.forEach(pattern => {
        if (result.content && pattern.test(result.content)) {
          regulatoryBoost += this.weights.regulatory / this.regulatoryPatterns.length;
        }
      });
      
      // Check if query contains regulatory terms
      if (/\b(FDA|EMA|ICH|eCTD|CFR)\b/i.test(query)) {
        regulatoryBoost += 0.1;
      }
      
      result.fusedScore += regulatoryBoost;
      result.regulatoryBoost = regulatoryBoost;
    });
    
    // Convert to array and sort by fused score
    const fusedResults = Array.from(fusedMap.values());
    fusedResults.sort((a, b) => b.fusedScore - a.fusedScore);
    
    // Normalize final scores
    fusedResults.forEach(result => {
      result.score = Math.min(result.fusedScore, 1.0);
    });
    
    return fusedResults;
  }
  
  /**
   * Enrich results with regulatory context
   * @param {Array} results - Search results to enrich
   * @returns {Promise<Array>} - Enriched results
   */
  async enrichWithRegulatoryContext(results) {
    // Add regulatory metadata to each result
    return results.map(result => {
      const enriched = { ...result };
      
      // Identify CTD section from module
      if (result.module) {
        const ctdMatch = result.module.match(/([0-9]+\.[0-9]+\.[A-Z])/);
        if (ctdMatch) {
          enriched.ctdSection = ctdMatch[1];
          enriched.ctdDescription = this.getCTDSectionDescription(ctdMatch[1]);
        }
      }
      
      // Extract regulatory references
      enriched.regulatoryReferences = [];
      
      // FDA references
      const fdaRefs = result.content?.match(/21 CFR Part [0-9]+/gi) || [];
      enriched.regulatoryReferences.push(...fdaRefs);
      
      // ICH guidelines
      const ichRefs = result.content?.match(/ICH [A-Z][0-9]+/gi) || [];
      enriched.regulatoryReferences.push(...ichRefs);
      
      // Add search context snippet
      enriched.snippet = this.generateSnippet(result.content, 150);
      
      return enriched;
    });
  }
  
  /**
   * Get CTD section description
   * @param {string} section - CTD section code
   * @returns {string} - Section description
   */
  getCTDSectionDescription(section) {
    const descriptions = {
      '2.3': 'Quality Overall Summary',
      '2.5': 'Clinical Overview',
      '3.2.S': 'Drug Substance',
      '3.2.P': 'Drug Product',
      '3.2.A': 'Appendices',
      '3.2.R': 'Regional Information',
      '5.3.1': 'Reports of Biopharmaceutic Studies',
      '5.3.2': 'Reports of Studies Pertinent to PK Using Human Biomaterials',
      '5.3.3': 'Reports of Human PK Studies',
      '5.3.4': 'Reports of Human PD Studies',
      '5.3.5': 'Reports of Efficacy and Safety Studies'
    };
    
    // Find matching description
    for (const [key, desc] of Object.entries(descriptions)) {
      if (section.startsWith(key)) {
        return desc;
      }
    }
    
    return 'Unknown Section';
  }
  
  /**
   * Generate content snippet
   * @param {string} content - Full content
   * @param {number} maxLength - Maximum snippet length
   * @returns {string} - Content snippet
   */
  generateSnippet(content, maxLength = 150) {
    if (!content) return '';
    
    if (content.length <= maxLength) {
      return content;
    }
    
    // Find sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    
    if (lastPeriod > maxLength * 0.6) {
      return truncated.substring(0, lastPeriod + 1);
    }
    
    return truncated + '...';
  }
  
  /**
   * Generate cache key for search query
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {string} - Cache key
   */
  getCacheKey(query, options) {
    return `${query}_${JSON.stringify(options)}`;
  }
  
  /**
   * Get cached search result
   * @param {string} key - Cache key
   * @returns {Array|null} - Cached result or null
   */
  getCachedResult(key) {
    const cached = this.searchCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    
    // Clean up expired entry
    if (cached) {
      this.searchCache.delete(key);
    }
    
    return null;
  }
  
  /**
   * Cache search result
   * @param {string} key - Cache key
   * @param {Array} data - Search results
   */
  cacheResult(key, data) {
    this.searchCache.set(key, {
      data,
      expires: Date.now() + this.cacheTimeout
    });
    
    // Clean up old entries if cache gets too large
    if (this.searchCache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.searchCache.entries()) {
        if (v.expires < now) {
          this.searchCache.delete(k);
        }
      }
    }
  }
  
  /**
   * Clear search cache
   */
  clearCache() {
    this.searchCache.clear();
  }
  
  /**
   * Get search metrics
   * @returns {Object} - Search engine metrics
   */
  getMetrics() {
    return {
      cacheSize: this.searchCache.size,
      weights: this.weights,
      cacheTimeout: this.cacheTimeout,
      regulatoryPatternsCount: this.regulatoryPatterns.length
    };
  }
}

// Export singleton instance
export const searchEngine = new RegulatorySearchEngine();
export default searchEngine;