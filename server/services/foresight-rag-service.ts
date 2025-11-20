
import OpenAI from 'openai';
import { retrieveContext } from '../brain/vaultRetriever.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
 * RAG Service for ForesightAI
 * Combines document retrieval with GPT-4 generation
 */
export class ForesightRAGService {
  /**
   * Query the RAG system with a question
   */
  async query(params: RAGQuery): Promise<RAGResponse> {
    const { query, context = '', maxTokens = 1000, temperature = 0.3 } = params;

    try {
      // Step 1: Retrieve relevant documents using vector similarity
      const retrievedDocs = await retrieveContext(query, 5);

      if (!retrievedDocs || retrievedDocs.length === 0) {
        throw new Error('No relevant documents found');
      }

      // Step 2: Format context for GPT-4
      const contextText = retrievedDocs
        .map((doc, idx) => `[Source ${idx + 1}] ${doc.text}`)
        .join('\n\n');

      // Step 3: Generate answer using GPT-4 with retrieved context
      const systemPrompt = `You are ForesightAI, a regulatory intelligence assistant for biotech startups. 
You provide accurate, context-aware answers based on regulatory documents (CTD dossiers, guidelines, CSRs).
Use the provided sources to answer questions. Always cite which source number you're using.
If the sources don't contain enough information, say so clearly.`;

      const userPrompt = `Context from regulatory documents:
${contextText}

${context ? `Additional context: ${context}\n` : ''}
Question: ${query}

Please provide a detailed answer based on the sources above. Cite specific source numbers.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      });

      const answer = completion.choices[0].message.content || 'No answer generated';

      // Calculate confidence based on retrieval scores
      const avgScore = retrievedDocs.reduce((sum, doc) => sum + doc.score, 0) / retrievedDocs.length;

      return {
        answer,
        sources: retrievedDocs.map(doc => ({
          docId: doc.docId,
          docTitle: doc.docTitle || 'Unknown Document',
          text: doc.text,
          score: doc.score,
        })),
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
