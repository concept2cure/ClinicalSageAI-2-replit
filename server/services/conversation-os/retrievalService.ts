import { kernelStore } from './conversationKernel';
import type { RetrievalChunk } from './types';

export function ingestKnowledgeChunks(conversationId: string, sourceId: string, text: string, tags: string[] = []) {
  const chunks = chunkText(text).map((chunk, index) => ({
    id: `${sourceId}-${index}`,
    sourceId,
    text: chunk,
    tags,
    approvedOnly: tags.includes('approved'),
  } satisfies RetrievalChunk));

  const existing = kernelStore.chunks.get(conversationId) ?? [];
  kernelStore.chunks.set(conversationId, [...existing, ...chunks]);
  return chunks;
}

export function retrieveRelevantChunks(params: {
  conversationId: string;
  query: string;
  tags?: string[];
  approvedOnly?: boolean;
  limit?: number;
}) {
  const { conversationId, query, tags = [], approvedOnly, limit = 5 } = params;
  const searchTerms = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));

  const chunks = (kernelStore.chunks.get(conversationId) ?? []).filter(chunk => {
    if (approvedOnly && !chunk.approvedOnly) return false;
    if (tags.length > 0 && !tags.some(tag => chunk.tags.includes(tag))) return false;
    return true;
  });

  return chunks
    .map(chunk => ({
      chunk,
      score: [...searchTerms].reduce((score, token) => (chunk.text.toLowerCase().includes(token) ? score + 1 : score), 0),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.chunk);
}

function chunkText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > 420 && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
      continue;
    }
    current = `${current} ${sentence}`.trim();
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
