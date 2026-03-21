import { getPool } from '../db';
import { getRAGPipeline } from './advancedRAGPipeline.js';

export interface RAGQuery {
  query: string;
  context?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface RAGResponse {
  answer: string;
  sources: Array<{
    docId: string;
    docTitle: string;
    text: string;
    score: number;
  }>;
  confidence: number;
}

/**
 * RAG Service for AnA Predictions
 * Combines document retrieval with GPT-4 generation
 */
export class ForesightRAGService {
  /**
   * Query the RAG system with a question
   */
  async query(params: RAGQuery): Promise<RAGResponse> {
    const { query, context = '', maxTokens = 1000, temperature = 0.3 } = params;

    try {
      const pool = getPool();
      const ragPipeline = getRAGPipeline(pool);

      const result = await ragPipeline.queryWithGeneration(query, {
        strategy: 'advanced',
        limit: 5,
        useReranking: true,
        useMmr: true,
      });

      const sources = result.sources.map(source => ({
        docId: source.documentId || source.id,
        docTitle: source.title,
        text: source.compressedContent || source.content,
        score: source.finalScore,
      }));

      const avgScore = sources.length
        ? sources.reduce((sum, doc) => sum + doc.score, 0) / sources.length
        : 0;

      const contextPrefix = context ? `${context}\n\n` : '';
      const answer = contextPrefix ? `${contextPrefix}${result.answer}` : result.answer;

      return {
        answer,
        sources,
        confidence: avgScore,
      };
    } catch (error) {
      console.error('[ForesightRAG] Error processing query:', error);
      throw error;
    }
  }

  /**
   * Generate regulatory intelligence report
   */
  async generateReport(topic: string, docType: string = 'CTD'): Promise<string> {
    const query = `Provide a comprehensive regulatory intelligence report on: ${topic}`;

    const result = await this.query({
      query,
      maxTokens: 2000,
      temperature: 0.2,
    });

    return `# Regulatory Intelligence Report: ${topic}\n\n${result.answer}\n\n## Sources\n${result.sources.map((s, i) => `${i + 1}. ${s.docTitle} (confidence: ${(s.score * 100).toFixed(1)}%)`).join('\n')}`;
  }
}

export const foresightRAG = new ForesightRAGService();
