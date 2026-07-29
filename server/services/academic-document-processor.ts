import fs from 'fs';
import path from 'path';
import { HuggingFaceService } from '../huggingface-service';
import { getHuggingfaceModels } from '../config/huggingface-models';

interface ProcessedDocument {
  title: string;
  type: string;
  source: string;
  year: number;
  summary: string;
  keyInsights: string[];
  tags: string[];
}

interface AcademicKnowledgeResult {
  id: string;
  title: string;
  type: string;
  source: string;
  relevance: number;
  summary: string;
  context: string;
}

export class AcademicDocumentProcessor {
  /**
   * Get a list of recently processed documents
   */
  getRecentlyProcessedDocuments(limit: number = 5): any[] {
    const documents = Array.from(this.documentMetadata.entries())
      .map(([id, metadata]) => ({
        id,
        title: metadata.title,
        type: metadata.type,
        source: metadata.source,
        timestamp: new Date().toISOString(),
      }))
      .slice(0, limit);

    return documents;
  }

  private huggingFaceService: HuggingFaceService;
  private academicKnowledgeBase: Map<string, any>;
  private documentEmbeddings: Map<string, Float32Array>;
  private documentMetadata: Map<string, ProcessedDocument>;
  private models = getHuggingfaceModels();

  constructor() {
    this.huggingFaceService = new HuggingFaceService(process.env.HF_API_KEY || '');
    this.academicKnowledgeBase = new Map();
    this.documentEmbeddings = new Map();
    this.documentMetadata = new Map();
    this.loadProcessedDocuments();
  }

  private loadProcessedDocuments() {
    // In a real implementation, we would load from a database or vector store
    // This is a simplified implementation for demonstration purposes
    const knowledgeDir = './academic_embeddings';
    if (!fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true });
      return;
    }

    try {
      const files = fs.readdirSync(knowledgeDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(knowledgeDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const documentData = JSON.parse(content);

          // Store the document data
          this.academicKnowledgeBase.set(documentData.id, documentData);

          // Store the embedding if it exists
          if (documentData.embedding) {
            this.documentEmbeddings.set(documentData.id, new Float32Array(documentData.embedding));
          }

          // Store the metadata
          this.documentMetadata.set(documentData.id, {
            title: documentData.title,
            type: documentData.type,
            source: documentData.source,
            year: documentData.year,
            summary: documentData.summary,
            keyInsights: documentData.keyInsights || [],
            tags: documentData.tags || [],
          });
        }
      }

      console.log(`Loaded ${this.academicKnowledgeBase.size} academic documents`);
    } catch (error) {
      console.error('Error loading academic documents:', error);
    }
  }

  private saveDocumentToDisk(documentId: string, documentData: any) {
    const knowledgeDir = './academic_embeddings';
    if (!fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true });
    }

    const filePath = path.join(knowledgeDir, `${documentId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(documentData, null, 2));
  }

  async processPdfDocument(filePath: string, fileName: string): Promise<ProcessedDocument> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read PDF file
      const fileBuffer = fs.readFileSync(filePath);

      // Extract text from PDF using Hugging Face
      const text = await this.huggingFaceService.extractTextFromPdf(fileBuffer);

      if (!text) {
        throw new Error('Failed to extract text from PDF');
      }

      // Extract document metadata using Hugging Face
      const documentInfo = await this.huggingFaceService.extractDocumentMetadata(text);

      if (!documentInfo) {
        throw new Error('Failed to extract document metadata');
      }

      const title = documentInfo.title || fileName;
      const type = documentInfo.type || 'Academic Paper';
      const source = documentInfo.source || 'Unknown';
      const year = documentInfo.year || new Date().getFullYear();

      // Generate summary
      const summary = await this.huggingFaceService.generateSummary(text);

      if (!summary) {
        throw new Error('Failed to generate summary');
      }

      // Extract key insights
      const keyInsights = (await this.huggingFaceService.extractKeyInsights(text)) || [];

      // Generate tags
      const tags = (await this.huggingFaceService.generateTags(text)) || [];

      // Generate embeddings for the document
      const embedding = await this.huggingFaceService.generateEmbeddings(text);

      // Create document ID
      const documentId = Buffer.from(`${title}-${source}-${year}`).toString('base64');

      // Create document data
      const documentData = {
        id: documentId,
        title,
        type,
        source,
        year,
        summary,
        keyInsights,
        tags,
        embedding: Array.from(embedding || []),
        text,
      };

      // Save document data
      this.academicKnowledgeBase.set(documentId, documentData);
      this.documentEmbeddings.set(documentId, new Float32Array(embedding || []));
      this.documentMetadata.set(documentId, {
        title,
        type,
        source,
        year,
        summary,
        keyInsights,
        tags,
      });

      // Save to disk
      this.saveDocumentToDisk(documentId, documentData);

      // Return processed document
      return {
        title,
        type,
        source,
        year,
        summary,
        keyInsights,
        tags,
      };
    } catch (error) {
      console.error('Error processing PDF document:', error);
      throw error;
    }
  }

  async searchAcademicKnowledge(
    query: string,
    limit: number = 10
  ): Promise<AcademicKnowledgeResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.huggingFaceService.generateEmbeddings(query);

      if (!queryEmbedding) {
        throw new Error('Failed to generate embedding for query');
      }

      const queryVector = new Float32Array(queryEmbedding);

      // Calculate similarity scores for all documents
      const similarityScores: { id: string; score: number }[] = [];

      for (const [documentId, embedding] of this.documentEmbeddings.entries()) {
        const similarity = this.calculateCosineSimilarity(queryVector, embedding);
        similarityScores.push({ id: documentId, score: similarity });
      }

      // Sort by similarity score in descending order
      similarityScores.sort((a, b) => b.score - a.score);

      // Get top results
      const topResults = similarityScores.slice(0, limit);

      // Format results
      const results: AcademicKnowledgeResult[] = topResults.map(result => {
        const documentData = this.academicKnowledgeBase.get(result.id);
        const metadata = this.documentMetadata.get(result.id);

        if (!documentData || !metadata) {
          throw new Error(`Document data not found for ID: ${result.id}`);
        }

        return {
          id: result.id,
          title: metadata.title,
          type: metadata.type,
          source: metadata.source,
          relevance: result.score,
          summary: metadata.summary,
          context: this.extractRelevantContext(documentData.text, query),
        };
      });

      return results;
    } catch (error) {
      console.error('Error searching academic knowledge:', error);
      throw error;
    }
  }

  private calculateCosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
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

  private extractRelevantContext(text: string, query: string): string {
    // Simple implementation - in a real system, you would use more sophisticated techniques
    const paragraphs = text.split('\n\n');
    const relevantParagraphs: { paragraph: string; score: number }[] = [];

    // Generate a set of terms from the query
    const queryTerms = new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter(term => term.length > 3)
    );

    // Score each paragraph based on term overlap
    for (const paragraph of paragraphs) {
      if (paragraph.length < 50) continue; // Skip short paragraphs

      let score = 0;
      const paragraphLower = paragraph.toLowerCase();

      for (const term of queryTerms) {
        if (paragraphLower.includes(term)) {
          score += 1;
        }
      }

      if (score > 0) {
        relevantParagraphs.push({ paragraph, score });
      }
    }

    // Sort by score in descending order
    relevantParagraphs.sort((a, b) => b.score - a.score);

    // Take top 3 paragraphs
    const topParagraphs = relevantParagraphs.slice(0, 3).map(p => p.paragraph);

    // Join with ellipsis
    return topParagraphs.join('\n\n...\n\n');
  }
}

// Export a singleton instance for convenience
export const academicDocumentProcessor = new AcademicDocumentProcessor();
