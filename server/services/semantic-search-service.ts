import { huggingFaceService, HFModel } from '../huggingface-service';
import { createScopedLogger } from '../utils/logger.js';
const log = createScopedLogger('semantic-search');

/**
 * Semantic similarity calculation between two embeddings
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * The embedded document with its original content
 */
export interface EmbeddedDocument {
  id: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

/**
 * Semantic search results
 */
export interface SearchResult {
  document: EmbeddedDocument;
  score: number;
}

/**
 * Service for semantic search using text embeddings
 */
export class SemanticSearchService {
  private documents: EmbeddedDocument[] = [];
  private embeddingModel: HFModel;

  constructor(embeddingModel: HFModel = HFModel.CLINICAL_EMBEDDINGS) {
    this.embeddingModel = embeddingModel;
  }

  /**
   * Add a new document to the search index
   */
  async addDocument(id: number, content: string, metadata?: Record<string, any>): Promise<void> {
    try {
      log.debug(`Generating embedding for document ${id}...`);

      // Instead of using HuggingFace API, generate a local embedding
      // This is a simplified embedding approach that's compatible with our search
      const embedding = this.generateLocalEmbedding(content);

      // Store the document with its embedding
      this.documents.push({
        id,
        content,
        embedding,
        metadata,
      });

      log.debug(`Document ${id} added to semantic search index using local embedding`);
    } catch (error) {
      log.error(`Failed to add document ${id} to semantic search index:`, error);

      // Add with fallback embedding (all zeros) to prevent app from breaking
      this.documents.push({
        id,
        content,
        embedding: new Array(384).fill(0), // Standard embedding size
        metadata,
      });

      log.debug(`Document ${id} added with fallback zero embedding`);
    }
  }

  /**
   * Generate a local embedding for a document
   * This is a simplified approach that doesn't rely on external API calls
   */
  private generateLocalEmbedding(text: string): number[] {
    // Create a deterministic but useful embedding from the text
    // This approach creates embeddings that preserve some basic similarity relationships

    // Normalize and clean the text
    const normalizedText = text.toLowerCase().trim();

    // Create a fixed-size embedding (384 dimensions is common for embeddings)
    const embeddingSize = 384;
    const embedding = new Array(embeddingSize).fill(0);

    // Extract key clinical terms and incorporate their presence into the embedding
    const keyTerms = [
      'diabetes',
      'cancer',
      'efficacy',
      'safety',
      'endpoint',
      'placebo',
      'double-blind',
      'randomized',
      'phase 1',
      'phase 2',
      'phase 3',
      'inclusion',
      'exclusion',
      'criteria',
      'primary',
      'secondary',
      'adverse',
      'statistical',
      'analysis',
      'protocol',
      'sample size',
      'biomarker',
      'survival',
      'response',
      'dose',
      'treatment',
    ];

    // Use a basic hashing approach to map terms to embedding dimensions
    keyTerms.forEach((term, index) => {
      if (normalizedText.includes(term)) {
        // Affect multiple dimensions deterministically
        const baseDimension = (index * 11) % embeddingSize;
        embedding[baseDimension] = 1.0;
        embedding[(baseDimension + 5) % embeddingSize] = 0.8;
        embedding[(baseDimension + 10) % embeddingSize] = 0.6;
      }
    });

    // Add some signal from document length
    const lengthBucket = Math.min(Math.floor(normalizedText.length / 500), 10);
    for (let i = 0; i < 10; i++) {
      embedding[i * 30] = i === lengthBucket ? 1.0 : 0.0;
    }

    // Normalize the embedding to unit length
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)) || 1;
    return embedding.map(val => val / magnitude);
  }

  /**
   * Clear all documents from the index
   */
  clearIndex(): void {
    this.documents = [];
  }

  /**
   * Get the number of documents in the index
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * Search for documents similar to the query string
   */
  async search(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (this.documents.length === 0) {
      return [];
    }

    try {
      log.debug(`Generating embedding for query: "${query.substring(0, 50)}..."`);

      // Generate local embedding for the query using same method as document embeddings
      const queryEmbedding = this.generateLocalEmbedding(query);

      // Calculate similarity scores for all documents
      const results: SearchResult[] = this.documents.map(doc => ({
        document: doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
      }));

      // Sort by similarity score (highest first) and limit results
      return results.sort((a, b) => b.score - a.score).slice(0, limit);
    } catch (error) {
      log.error('Error performing semantic search:', error);

      // Fallback: return documents based on simple keyword matching
      log.debug('Using keyword matching fallback search');
      const normalizedQuery = query.toLowerCase();
      const keywordResults = this.documents
        .map(doc => {
          // Score based on keyword presence in content
          const content = doc.content.toLowerCase();
          const score =
            normalizedQuery
              .split(' ')
              .filter(word => word.length > 3) // Only use meaningful words
              .reduce((sum, word) => {
                return content.includes(word) ? sum + 1 : sum;
              }, 0) / Math.max(1, normalizedQuery.split(' ').filter(w => w.length > 3).length);

          return {
            document: doc,
            score: score,
          };
        })
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      // If no keyword matches, return no results rather than arbitrary documents
      // dressed with a fabricated 0.1 relevance score.
      // See FORENSIC_CODE_AUDIT_2026-05-29.md (MEDIUM: degraded-by-default search).
      return keywordResults;
    }
  }

  /**
   * Retrieve the most semantically similar context for a given query
   */
  async retrieveRelevantContext(query: string, maxChars: number = 10000): Promise<string> {
    const results = await this.search(query, 5);

    let contextText = '';
    let totalChars = 0;

    for (const result of results) {
      if (totalChars + result.document.content.length <= maxChars) {
        contextText += result.document.content + '\n\n';
        totalChars += result.document.content.length + 2;
      } else {
        // If adding the full document would exceed the limit, add a portion
        const remainingChars = maxChars - totalChars;
        if (remainingChars > 200) {
          // Only add if we can include a meaningful portion
          contextText += result.document.content.substring(0, remainingChars) + '...\n\n';
        }
        break;
      }
    }

    return contextText;
  }
}

// Export a singleton instance for convenience
export const semanticSearchService = new SemanticSearchService();
