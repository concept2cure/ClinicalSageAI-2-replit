import { db } from '../db/index.js';
import { documentVectors, components, componentVersions } from '../../shared/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import regulatoryAIPhase3 from './regulatoryAIServicePhase3.js';

/**
 * Semantic Embedding Service for Phase 3 RAG Implementation
 * Handles embedding generation, storage, and semantic search
 */
class SemanticEmbeddingService {
  constructor() {
    this.aiService = regulatoryAIPhase3;
    this.chunkSize = 1000; // Characters per chunk
    this.overlapSize = 200; // Overlap between chunks
  }

  /**
   * Generate embeddings for a component and store in document_vectors
   */
  async generateComponentEmbeddings(componentId, organizationId) {
    try {
      // Fetch component details
      const [component] = await db
        .select()
        .from(components)
        .where(and(
          eq(components.id, componentId),
          eq(components.organizationId, organizationId)
        ))
        .limit(1);
      
      if (!component) {
        throw new Error(`Component ${componentId} not found`);
      }
      
      // Extract text content from component
      const textContent = this.extractTextFromComponent(component);
      
      // Chunk the text for embedding
      const chunks = this.chunkText(textContent, this.chunkSize, this.overlapSize);
      
      const embeddings = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Generate embedding using OpenAI
        const embeddingResult = await this.aiService.generateEmbedding(chunk);
        
        if (embeddingResult.success) {
          // Store embedding in document_vectors table
          const vectorEntry = {
            organizationId,
            componentId,
            chunkText: chunk,
            chunkIndex: i,
            chunkSize: chunk.length,
            embedding: embeddingResult.embedding,
            embeddingModel: 'text-embedding-3-large',
            moduleContext: component.moduleContext,
            sectionNumber: component.sectionNumber,
            regulatoryEntities: null, // Will be populated by NER
            metadata: {
              udi: component.udi,
              type: component.type,
              sourceFile: component.sourceFile
            },
            tags: [component.type, component.moduleContext].filter(Boolean)
          };
          
          // Insert into database
          const [insertedVector] = await db
            .insert(documentVectors)
            .values(vectorEntry)
            .returning();
          
          embeddings.push({
            id: insertedVector.id,
            chunkIndex: i,
            tokens_used: embeddingResult.tokens_used
          });
        }
      }
      
      return {
        success: true,
        component_id: componentId,
        chunks_processed: chunks.length,
        embeddings_created: embeddings.length,
        embeddings
      };
      
    } catch (error) {
      console.error('Error generating component embeddings:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform semantic search using vector similarity
   */
  async semanticSearch(query, organizationId, limit = 10, threshold = 0.7) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      
      if (!queryEmbedding.success) {
        throw new Error('Failed to generate query embedding');
      }
      
      // Perform vector similarity search using pgvector
      // Using cosine similarity (1 - cosine distance)
      const searchQuery = sql`
        SELECT 
          dv.*,
          1 - (dv.embedding <=> $1::vector) as similarity,
          c.udi,
          c.type as component_type,
          c.content as component_content
        FROM document_vectors dv
        LEFT JOIN components c ON dv.component_id = c.id
        WHERE 
          dv.organization_id = ${organizationId}
          AND 1 - (dv.embedding <=> $1::vector) > ${threshold}
        ORDER BY dv.embedding <=> $1::vector
        LIMIT ${limit}
      `;
      
      const results = await db.execute(searchQuery, [
        JSON.stringify(queryEmbedding.embedding)
      ]);
      
      // Update access counts
      const vectorIds = results.map(r => r.id);
      if (vectorIds.length > 0) {
        await db.execute(sql`
          UPDATE document_vectors 
          SET 
            last_accessed_at = NOW(),
            access_count = access_count + 1
          WHERE id = ANY(${vectorIds})
        `);
      }
      
      return {
        success: true,
        query,
        results: results.map(r => ({
          id: r.id,
          chunk_text: r.chunk_text,
          similarity: r.similarity,
          component_udi: r.udi,
          component_type: r.component_type,
          module_context: r.module_context,
          section_number: r.section_number,
          metadata: r.metadata
        })),
        total_results: results.length
      };
      
    } catch (error) {
      console.error('Semantic search failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract text content from component
   */
  extractTextFromComponent(component) {
    if (!component.content) return '';
    
    // Handle different content types
    if (typeof component.content === 'string') {
      return component.content;
    }
    
    if (typeof component.content === 'object') {
      // For structured content, extract text recursively
      return this.extractTextFromObject(component.content);
    }
    
    return JSON.stringify(component.content);
  }

  /**
   * Recursively extract text from nested objects
   */
  extractTextFromObject(obj) {
    let text = '';
    
    for (const key in obj) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        text += value + ' ';
      } else if (typeof value === 'object' && value !== null) {
        text += this.extractTextFromObject(value) + ' ';
      }
    }
    
    return text.trim();
  }

  /**
   * Chunk text for embedding with overlap
   */
  chunkText(text, chunkSize, overlapSize) {
    if (!text || text.length === 0) return [];
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      
      // Move start position with overlap
      start = end - overlapSize;
      
      // Prevent infinite loop on very small texts
      if (start >= text.length - 10) break;
    }
    
    return chunks;
  }

  /**
   * Generate embeddings for all components in a document
   */
  async generateDocumentEmbeddings(documentId, organizationId) {
    try {
      // Get all components for the document
      const documentComponents = await db.execute(sql`
        SELECT c.* 
        FROM components c
        INNER JOIN document_components dc ON c.id = dc.component_id
        WHERE 
          dc.document_id = ${documentId}
          AND c.organization_id = ${organizationId}
        ORDER BY dc.position
      `);
      
      const results = [];
      
      for (const component of documentComponents) {
        const embeddingResult = await this.generateComponentEmbeddings(
          component.id,
          organizationId
        );
        results.push(embeddingResult);
      }
      
      return {
        success: true,
        document_id: documentId,
        components_processed: results.length,
        embeddings_created: results.reduce((sum, r) => 
          sum + (r.embeddings_created || 0), 0
        ),
        results
      };
      
    } catch (error) {
      console.error('Error generating document embeddings:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete embeddings for a component
   */
  async deleteComponentEmbeddings(componentId, organizationId) {
    try {
      const result = await db
        .delete(documentVectors)
        .where(and(
          eq(documentVectors.componentId, componentId),
          eq(documentVectors.organizationId, organizationId)
        ))
        .returning();
      
      return {
        success: true,
        deleted_count: result.length
      };
      
    } catch (error) {
      console.error('Error deleting component embeddings:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new SemanticEmbeddingService();