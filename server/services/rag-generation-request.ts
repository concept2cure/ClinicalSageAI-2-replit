/**
 * The canonical production RAG source block and generation request.
 * Pure extraction: wording, source preference, sampling and token budget are
 * unchanged. The controlled PQ path reuses this request rather than maintaining
 * an evaluation-only generation prompt.
 */
export interface RagGenerationSource {
  title: string;
  content: string;
  compressedContent?: string;
  expandedContent?: string;
}

export const RAG_EMPTY_CONTEXT_REFUSAL = 'I could not find relevant information in the regulatory knowledge base to answer this question.';

export function buildRagSourceText(documents: RagGenerationSource[]): string {
  return documents
    .map((doc, idx) => `[Source ${idx + 1}: ${doc.title}]\n${doc.compressedContent || doc.expandedContent || doc.content}`)
    .join('\n\n---\n\n');
}

export function buildRagGenerationRequest(query: string, sourceText: string) {
  return {
    taskType: 'regulatory_review' as const,
    messages: [
      {
        role: 'system' as const,
        content: `You are a regulatory affairs expert with deep knowledge of FDA, EMA, and ICH guidelines.
Answer questions based ONLY on the provided sources. Be precise and cite sources using [Source N] notation.
If the sources don't contain enough information to fully answer, say so clearly.`,
      },
      { role: 'user' as const, content: `Question: ${query}\n\nSources:\n${sourceText}` },
    ],
    maxTokens: 1000,
    temperature: 0.3,
  };
}
