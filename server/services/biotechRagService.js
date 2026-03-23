/**
 * Biotech AI Intelligence RAG Service
 * Production-ready service for biotech document processing, embeddings, and retrieval
 */

import { db } from '../db';
import { ragDocuments, ragChunks, ragQueries, ragKnowledgeGraph } from '@shared/schema';
import { eq, and, sql, desc, inArray, like, ilike, or } from 'drizzle-orm';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

// Initialize OpenAI if API key is available
let openai = null;
try {
} catch (error) {
  console.log('OpenAI initialization failed, using fallback embeddings');
}

// Fallback embedding generator (simple TF-IDF based)
class FallbackEmbeddings {
  constructor() {
    this.vocabulary = new Map();
    this.idf = new Map();
    this.dimensions = 384; // Smaller than OpenAI for efficiency
  }

  async generateEmbedding(text) {
    // Simple tokenization
    const tokens = text
      .toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 2);

    // Build vocabulary
    tokens.forEach(token => {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    });

    // Create sparse vector
    const vector = new Array(Math.min(this.dimensions, this.vocabulary.size)).fill(0);
    const tokenCounts = new Map();

    tokens.forEach(token => {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    });

    // Calculate TF-IDF scores
    tokenCounts.forEach((count, token) => {
      const index = this.vocabulary.get(token);
      if (index < this.dimensions) {
        const tf = count / tokens.length;
        const idf = Math.log(1000 / (1 + (this.idf.get(token) || 1))); // Assume 1000 documents
        vector[index] = tf * idf;
      }
    });

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return vector.map(val => val / magnitude);
    }

    return vector;
  }

  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
    }

    return dotProduct;
  }
}

const fallbackEmbeddings = new FallbackEmbeddings();

class BiotechRagService {
  constructor() {
    this.chunkSize = 1500; // Characters per chunk
    this.chunkOverlap = 200; // Overlap between chunks
    this.maxRetries = 3;
    this.embedCache = new Map(); // Cache for embeddings
    this.queryCache = new Map(); // Cache for query results
    this.cacheTimeout = 3600000; // 1 hour cache timeout
  }

  /**
   * Generate embeddings using OpenAI or fallback
   */
  async generateEmbedding(text, model = 'text-embedding-3-small') {
    // Check cache first
    const cacheKey = crypto
      .createHash('md5')
      .update(text + model)
      .digest('hex');
    const cached = this.embedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.embedding;
    }

    let embedding;

    if (openai) {
      try {
        const response = await openai.embeddings.create({
          model: model,
          input: text,
        });
        embedding = response.data[0].embedding;
      } catch (error) {
        console.error('OpenAI embedding error:', error);
        // Fall back to local embeddings
        embedding = await fallbackEmbeddings.generateEmbedding(text);
      }
    } else {
      // Use fallback embeddings
      embedding = await fallbackEmbeddings.generateEmbedding(text);
    }

    // Cache the embedding
    this.embedCache.set(cacheKey, {
      embedding,
      timestamp: Date.now(),
    });

    return embedding;
  }

  /**
   * Intelligently chunk documents preserving context
   */
  chunkDocument(text, metadata = {}) {
    const chunks = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    let currentChunk = '';
    let currentSection = metadata.section || '';

    sentences.forEach((sentence, index) => {
      // Check for section headers (common in biotech documents)
      const headerMatch = sentence.match(/^(\d+\.?\d*\.?\d*\.?)\s+([A-Z][^.!?]+)/);
      if (headerMatch) {
        // Start new chunk on section header
        if (currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            section: currentSection,
            index: chunks.length,
          });
        }
        currentSection = headerMatch[2].trim();
        currentChunk = sentence;
      } else if ((currentChunk + sentence).length > this.chunkSize) {
        // Current chunk is full, save it
        chunks.push({
          content: currentChunk.trim(),
          section: currentSection,
          index: chunks.length,
        });

        // Start new chunk with overlap
        const overlap = sentences.slice(Math.max(0, index - 2), index).join(' ');
        currentChunk = overlap + ' ' + sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    });

    // Add the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        section: currentSection,
        index: chunks.length,
      });
    }

    return chunks;
  }

  /**
   * Extract biotech entities from text
   */
  extractBiotechEntities(text) {
    const entities = {
      drugs: [],
      targets: [],
      diseases: [],
      biomarkers: [],
      genes: [],
      proteins: [],
      pathways: [],
      cells: [],
    };

    // Drug name patterns (simplified - production would use NER models)
    const drugPatterns = [
      /\b[A-Z][a-z]+mab\b/g, // Monoclonal antibodies
      /\b[A-Z][a-z]+nib\b/g, // Kinase inhibitors
      /\b[A-Z][a-z]+stat\b/g, // Statins
      /\b[A-Z][a-z]+pril\b/g, // ACE inhibitors
      /\b[A-Z][a-z]+sartan\b/g, // ARBs
    ];

    drugPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      entities.drugs.push(...matches);
    });

    // Gene patterns (simplified)
    const genePattern = /\b[A-Z]{2,}[0-9]+[A-Z]?\b/g;
    entities.genes = (text.match(genePattern) || []).filter(g => g.length <= 10);

    // Protein patterns
    const proteinPatterns = [
      /\bCD\d+[a-zA-Z]?\b/g, // CD markers
      /\bHLA-[A-Z]\d*\b/g, // HLA types
      /\bIL-?\d+[a-zA-Z]?\b/g, // Interleukins
      /\bTNF[a-zA-Z]?\b/g, // TNF family
    ];

    proteinPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      entities.proteins.push(...matches);
    });

    // Biomarker indicators
    const biomarkerKeywords = [
      'biomarker',
      'marker',
      'indicator',
      'expression',
      'mutation',
      'variant',
    ];
    biomarkerKeywords.forEach(keyword => {
      const regex = new RegExp(`(\\w+)\\s+${keyword}`, 'gi');
      const matches = text.match(regex) || [];
      entities.biomarkers.push(...matches);
    });

    // Disease patterns (simplified)
    const diseasePatterns = [
      /\b[A-Z][a-z]+\s+(cancer|carcinoma|lymphoma|leukemia|syndrome|disease)\b/gi,
      /\b(Type\s+[12]\s+diabetes|NSCLC|SCLC|CLL|AML|ALL|CML|NHL|DLBCL)\b/gi,
    ];

    diseasePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      entities.diseases.push(...matches);
    });

    // Remove duplicates
    Object.keys(entities).forEach(key => {
      entities[key] = [...new Set(entities[key])];
    });

    return entities;
  }

  /**
   * Process and ingest a document
   */
  async ingestDocument(documentData) {
    const {
      organizationId,
      title,
      documentType,
      content,
      fileBuffer,
      fileName,
      mimeType,
      metadata = {},
    } = documentData;

    try {
      // Generate document ID
      const documentId = `doc_${uuidv4()}`;
      const fileHash = crypto
        .createHash('sha256')
        .update(content || fileBuffer)
        .digest('hex');

      // Extract text content based on file type
      let textContent = content;

      if (!textContent && fileBuffer) {
        if (mimeType === 'application/pdf') {
          const pdfData = await pdfParse(fileBuffer);
          textContent = pdfData.text;
        } else if (
          mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          textContent = result.value;
        } else if (mimeType === 'text/html') {
          const $ = cheerio.load(fileBuffer);
          textContent = $.text();
        } else {
          textContent = fileBuffer.toString('utf-8');
        }
      }

      if (!textContent) {
        throw new Error('No text content could be extracted from the document');
      }

      // Create document record
      const [document] = await db
        .insert(ragDocuments)
        .values({
          organizationId,
          documentId,
          title,
          documentType,
          fileName,
          fileHash,
          fileSize: fileBuffer ? fileBuffer.length : content.length,
          mimeType,
          status: 'processing',
          wordCount: textContent.split(/\s+/).length,
          language: 'en',
          ...metadata,
          metadata: {
            ingestionDate: new Date().toISOString(),
            ...metadata.metadata,
          },
        })
        .returning();

      // Chunk the document
      const chunks = this.chunkDocument(textContent, metadata);

      // Process chunks in batches to avoid overwhelming the API
      const batchSize = 10;
      const processedChunks = [];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);

        const chunkPromises = batch.map(async chunk => {
          const chunkId = `chunk_${uuidv4()}`;
          const contentHash = crypto.createHash('md5').update(chunk.content).digest('hex');

          // Extract entities
          const entities = this.extractBiotechEntities(chunk.content);

          // Generate embedding
          const embedding = await this.generateEmbedding(chunk.content);

          // Extract keywords (simple approach - production would use NLP)
          const keywords = chunk.content
            .split(/\W+/)
            .filter(word => word.length > 4)
            .reduce((acc, word) => {
              const lower = word.toLowerCase();
              acc[lower] = (acc[lower] || 0) + 1;
              return acc;
            }, {});

          const topKeywords = Object.entries(keywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);

          return {
            documentId: document.id,
            chunkId,
            chunkIndex: chunk.index,
            content: chunk.content,
            contentHash,
            sectionTitle: chunk.section,
            embedding,
            embeddingModel: openai ? 'text-embedding-3-small' : 'fallback-tfidf',
            tokenCount: chunk.content.split(/\s+/).length,
            characterCount: chunk.content.length,
            chunkType: 'paragraph',
            entities,
            keywords: topKeywords,
            metadata: {
              processedAt: new Date().toISOString(),
            },
          };
        });

        const batchResults = await Promise.all(chunkPromises);
        processedChunks.push(...batchResults);
      }

      // Insert all chunks
      await db.insert(ragChunks).values(processedChunks);

      // Generate document-level embedding (average of chunk embeddings)
      const avgEmbedding = processedChunks[0].embedding.map((_, i) => {
        const sum = processedChunks.reduce((acc, chunk) => acc + (chunk.embedding[i] || 0), 0);
        return sum / processedChunks.length;
      });

      // Update document status
      await db
        .update(ragDocuments)
        .set({
          status: 'indexed',
          chunkCount: processedChunks.length,
          averageEmbedding: avgEmbedding,
          indexedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(ragDocuments.id, document.id));

      // Extract and store knowledge graph relationships
      await this.extractKnowledgeGraph(document.id, processedChunks, organizationId);

      return {
        documentId: document.id,
        status: 'indexed',
        chunksProcessed: processedChunks.length,
        entities: this.aggregateEntities(processedChunks),
      };
    } catch (error) {
      console.error('Document ingestion error:', error);

      // Update document status to failed
      if (document?.id) {
        await db
          .update(ragDocuments)
          .set({
            status: 'failed',
            processingStatus: {
              error: error.message,
              failedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(ragDocuments.id, document.id));
      }

      throw error;
    }
  }

  /**
   * Extract knowledge graph relationships
   */
  async extractKnowledgeGraph(documentId, chunks, organizationId) {
    const relationships = [];

    chunks.forEach(chunk => {
      const { entities } = chunk;

      // Create drug-target relationships
      entities.drugs?.forEach(drug => {
        entities.targets?.forEach(target => {
          relationships.push({
            organizationId,
            entityId: `drug_${drug}`,
            entityType: 'drug',
            entityName: drug,
            relationshipType: 'targets',
            relatedEntityId: `target_${target}`,
            relatedEntityType: 'target',
            relatedEntityName: target,
            sourceDocumentIds: [documentId],
            sourceChunkIds: [chunk.chunkId],
            confidence: 0.7, // Would be calculated based on context
            metadata: {
              extractedAt: new Date().toISOString(),
            },
          });
        });

        // Create drug-disease relationships
        entities.diseases?.forEach(disease => {
          relationships.push({
            organizationId,
            entityId: `drug_${drug}`,
            entityType: 'drug',
            entityName: drug,
            relationshipType: 'treats',
            relatedEntityId: `disease_${disease}`,
            relatedEntityType: 'disease',
            relatedEntityName: disease,
            sourceDocumentIds: [documentId],
            sourceChunkIds: [chunk.chunkId],
            confidence: 0.6,
            metadata: {
              extractedAt: new Date().toISOString(),
            },
          });
        });
      });

      // Create biomarker-disease relationships
      entities.biomarkers?.forEach(biomarker => {
        entities.diseases?.forEach(disease => {
          relationships.push({
            organizationId,
            entityId: `biomarker_${biomarker}`,
            entityType: 'biomarker',
            entityName: biomarker,
            relationshipType: 'associates_with',
            relatedEntityId: `disease_${disease}`,
            relatedEntityType: 'disease',
            relatedEntityName: disease,
            sourceDocumentIds: [documentId],
            sourceChunkIds: [chunk.chunkId],
            confidence: 0.5,
            metadata: {
              extractedAt: new Date().toISOString(),
            },
          });
        });
      });
    });

    // Insert unique relationships
    if (relationships.length > 0) {
      // Use ON CONFLICT to handle duplicates
      for (const rel of relationships) {
        try {
          await db.insert(ragKnowledgeGraph).values(rel);
        } catch (error) {
          // Update existing relationship if it exists
          if (error.code === '23505') {
            // Unique violation
            await db
              .update(ragKnowledgeGraph)
              .set({
                confidence: sql`GREATEST(confidence, ${rel.confidence})`,
                sourceDocumentIds: sql`array_append(source_document_ids, ${documentId})`,
                sourceChunkIds: sql`array_append(source_chunk_ids, ${rel.sourceChunkIds[0]})`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(ragKnowledgeGraph.entityId, rel.entityId),
                  eq(ragKnowledgeGraph.relatedEntityId, rel.relatedEntityId),
                  eq(ragKnowledgeGraph.relationshipType, rel.relationshipType)
                )
              );
          }
        }
      }
    }
  }

  /**
   * Perform hybrid search (semantic + keyword)
   */
  async search(query, options = {}) {
    const {
      organizationId,
      topK = 10,
      minScore = 0.5,
      searchMode = 'hybrid',
      filters = {},
      includeGraph = false,
    } = options;

    // Check cache
    const cacheKey = crypto
      .createHash('md5')
      .update(JSON.stringify({ query, options }))
      .digest('hex');

    const cached = this.queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.results;
    }

    const startTime = Date.now();
    const queryId = `query_${uuidv4()}`;

    try {
      // Enhance query with biotech context
      const enhancedQuery = await this.enhanceQuery(query);

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(enhancedQuery);

      // Perform semantic search
      let semanticResults = [];
      if (searchMode === 'semantic' || searchMode === 'hybrid') {
        semanticResults = await this.semanticSearch(
          queryEmbedding,
          organizationId,
          topK * 2,
          filters
        );
      }

      // Perform keyword search
      let keywordResults = [];
      if (searchMode === 'keyword' || searchMode === 'hybrid') {
        keywordResults = await this.keywordSearch(query, organizationId, topK * 2, filters);
      }

      // Combine and re-rank results
      const combinedResults = this.reRankResults(
        semanticResults,
        keywordResults,
        queryEmbedding,
        topK
      );

      // Filter by minimum score
      const filteredResults = combinedResults.filter(r => r.score >= minScore);

      // Include knowledge graph if requested
      let graphResults = [];
      if (includeGraph) {
        graphResults = await this.searchKnowledgeGraph(query, organizationId);
      }

      // Track query
      await db.insert(ragQueries).values({
        organizationId,
        queryId,
        query,
        enhancedQuery,
        queryType: 'search',
        queryVector: queryEmbedding,
        searchMode,
        topK,
        minScore,
        filters,
        resultsCount: filteredResults.length,
        responseTime: Date.now() - startTime,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      const results = {
        queryId,
        query,
        enhancedQuery,
        results: filteredResults,
        graphResults,
        totalResults: filteredResults.length,
        responseTime: Date.now() - startTime,
      };

      // Cache results
      this.queryCache.set(cacheKey, {
        results,
        timestamp: Date.now(),
      });

      return results;
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  }

  /**
   * Semantic search using embeddings
   */
  async semanticSearch(queryEmbedding, organizationId, limit, filters) {
    // Get all chunks for the organization
    let chunksQuery = db
      .select()
      .from(ragChunks)
      .innerJoin(ragDocuments, eq(ragChunks.documentId, ragDocuments.id))
      .where(eq(ragDocuments.organizationId, organizationId))
      .limit(1000); // Limit for performance

    // Apply filters
    if (filters.documentType) {
      chunksQuery = chunksQuery.where(eq(ragDocuments.documentType, filters.documentType));
    }

    const chunks = await chunksQuery;

    // Calculate similarities
    const similarities = chunks.map(({ rag_chunks, rag_documents }) => {
      const chunkEmbedding = rag_chunks.embedding;
      let similarity = 0;

      if (openai && chunkEmbedding) {
        // Cosine similarity for OpenAI embeddings
        similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
      } else if (chunkEmbedding) {
        // Use fallback similarity
        similarity = fallbackEmbeddings.cosineSimilarity(queryEmbedding, chunkEmbedding);
      }

      return {
        chunkId: rag_chunks.chunkId,
        documentId: rag_documents.documentId,
        documentTitle: rag_documents.title,
        content: rag_chunks.content,
        section: rag_chunks.sectionTitle,
        score: similarity,
        metadata: {
          documentType: rag_documents.documentType,
          entities: rag_chunks.entities,
        },
      };
    });

    // Sort by similarity and return top results
    return similarities.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Keyword search
   */
  async keywordSearch(query, organizationId, limit, filters) {
    const searchTerms = query.toLowerCase().split(/\s+/);

    // Build search conditions
    const searchConditions = searchTerms.map(term => ilike(ragChunks.content, `%${term}%`));

    let baseQuery = db
      .select({
        chunkId: ragChunks.chunkId,
        documentId: ragDocuments.documentId,
        documentTitle: ragDocuments.title,
        content: ragChunks.content,
        section: ragChunks.sectionTitle,
        documentType: ragDocuments.documentType,
        entities: ragChunks.entities,
      })
      .from(ragChunks)
      .innerJoin(ragDocuments, eq(ragChunks.documentId, ragDocuments.id))
      .where(and(eq(ragDocuments.organizationId, organizationId), or(...searchConditions)))
      .limit(limit);

    // Apply filters
    if (filters.documentType) {
      baseQuery = baseQuery.where(eq(ragDocuments.documentType, filters.documentType));
    }

    const results = await baseQuery;

    // Score based on term frequency
    return results.map(result => {
      let score = 0;
      const contentLower = result.content.toLowerCase();

      searchTerms.forEach(term => {
        const regex = new RegExp(term, 'gi');
        const matches = contentLower.match(regex);
        score += matches ? matches.length : 0;
      });

      return {
        ...result,
        score: score / searchTerms.length,
        metadata: {
          documentType: result.documentType,
          entities: result.entities,
        },
      };
    });
  }

  /**
   * Re-rank combined results
   */
  reRankResults(semanticResults, keywordResults, queryEmbedding, topK) {
    // Combine results with weighted scoring
    const resultMap = new Map();

    // Add semantic results (weight: 0.7)
    semanticResults.forEach(result => {
      resultMap.set(result.chunkId, {
        ...result,
        finalScore: result.score * 0.7,
        matchType: 'semantic',
      });
    });

    // Add/update with keyword results (weight: 0.3)
    keywordResults.forEach(result => {
      if (resultMap.has(result.chunkId)) {
        const existing = resultMap.get(result.chunkId);
        existing.finalScore += result.score * 0.3;
        existing.matchType = 'hybrid';
      } else {
        resultMap.set(result.chunkId, {
          ...result,
          finalScore: result.score * 0.3,
          matchType: 'keyword',
        });
      }
    });

    // Convert to array and sort
    return Array.from(resultMap.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK)
      .map(r => ({
        ...r,
        score: r.finalScore,
      }));
  }

  /**
   * Search knowledge graph
   */
  async searchKnowledgeGraph(query, organizationId) {
    // Extract entities from query
    const queryEntities = this.extractBiotechEntities(query);

    const entityNames = [
      ...queryEntities.drugs,
      ...queryEntities.targets,
      ...queryEntities.diseases,
      ...queryEntities.biomarkers,
    ];

    if (entityNames.length === 0) {
      return [];
    }

    // Search for entities in knowledge graph
    const graphResults = await db
      .select()
      .from(ragKnowledgeGraph)
      .where(
        and(
          eq(ragKnowledgeGraph.organizationId, organizationId),
          or(
            ...entityNames.map(name =>
              or(
                ilike(ragKnowledgeGraph.entityName, `%${name}%`),
                ilike(ragKnowledgeGraph.relatedEntityName, `%${name}%`)
              )
            )
          )
        )
      )
      .limit(20);

    return graphResults;
  }

  /**
   * Enhance query with biotech context
   */
  async enhanceQuery(query) {
    // Add biotech-specific context
    const biotechKeywords = [
      'clinical trial',
      'regulatory',
      'FDA',
      'EMA',
      'efficacy',
      'safety',
      'adverse event',
      'biomarker',
      'endpoint',
      'protocol',
      'IND',
      'NDA',
      'pharmacokinetics',
      'pharmacodynamics',
      'dose response',
    ];

    let enhanced = query;

    // Check if query mentions any biotech concepts
    const queryLower = query.toLowerCase();
    const relevantKeywords = biotechKeywords.filter(kw => queryLower.includes(kw.toLowerCase()));

    if (relevantKeywords.length === 0) {
      // Add general biotech context if no specific keywords found
      enhanced = `${query} clinical pharmaceutical biotech`;
    }

    return enhanced;
  }

  /**
   * Generate answer using RAG
   */
  async generateAnswer(query, context, options = {}) {
    if (!openai) {
      // Fallback: return concatenated context
      return {
        answer: `Based on the available information:\n\n${context.slice(0, 1000)}...`,
        confidence: 0.5,
        sources: [],
      };
    }

    try {
      const systemPrompt = `You are a biotech AI assistant specializing in pharmaceutical research, clinical trials, and regulatory affairs.
      Answer questions based on the provided context. Be precise and cite relevant information.`;

      const aiResult = await ai.chat({
        model: options.model || 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` },
        ],
        temperature: 0.3,
        max_tokens: options.maxTokens || 1000,
      });

      return {
        answer: aiResult.content,
        confidence: 0.9,
        model: response.model,
        usage: response.usage,
      };
    } catch (error) {
      console.error('Answer generation error:', error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity
   */
  cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Aggregate entities from chunks
   */
  aggregateEntities(chunks) {
    const aggregated = {
      drugs: new Set(),
      targets: new Set(),
      diseases: new Set(),
      biomarkers: new Set(),
      genes: new Set(),
      proteins: new Set(),
    };

    chunks.forEach(chunk => {
      Object.keys(chunk.entities).forEach(type => {
        chunk.entities[type]?.forEach(entity => {
          if (aggregated[type]) {
            aggregated[type].add(entity);
          }
        });
      });
    });

    // Convert sets to arrays
    Object.keys(aggregated).forEach(type => {
      aggregated[type] = Array.from(aggregated[type]);
    });

    return aggregated;
  }

  /**
   * Multi-document synthesis
   */
  async synthesizeDocuments(query, documentIds, organizationId) {
    try {
      // Get chunks from specified documents
      const chunks = await db
        .select()
        .from(ragChunks)
        .innerJoin(ragDocuments, eq(ragChunks.documentId, ragDocuments.id))
        .where(
          and(
            eq(ragDocuments.organizationId, organizationId),
            inArray(ragDocuments.id, documentIds)
          )
        )
        .limit(100);

      // Group chunks by document
      const documentChunks = {};
      chunks.forEach(({ rag_chunks, rag_documents }) => {
        if (!documentChunks[rag_documents.id]) {
          documentChunks[rag_documents.id] = {
            title: rag_documents.title,
            chunks: [],
          };
        }
        documentChunks[rag_documents.id].chunks.push(rag_chunks.content);
      });

      // Create synthesis context
      const context = Object.entries(documentChunks)
        .map(([docId, doc]) => `Document: ${doc.title}\n${doc.chunks.join('\n')}`)
        .join('\n\n---\n\n');

      // Generate synthesis
      const synthesis = await this.generateAnswer(
        `Synthesize information from multiple documents to answer: ${query}`,
        context,
        { maxTokens: 2000 }
      );

      return {
        synthesis: synthesis.answer,
        documentCount: documentIds.length,
        sources: Object.entries(documentChunks).map(([id, doc]) => ({
          documentId: id,
          title: doc.title,
        })),
      };
    } catch (error) {
      console.error('Document synthesis error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export default new BiotechRagService();
