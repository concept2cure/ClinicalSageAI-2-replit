import { allowConversationOsMemoryFallback, kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import type { RetrievalChunk } from './types';

const withCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? '',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? '',
});

export async function ingestKnowledgeChunks(params: { conversationId: string; sourceId: string; text: string; tags?: string[]; projectId?: string; userId?: string }) {
  const ctx = withCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const chunks = chunkText(params.text).map((chunk, index) => ({
    id: `${params.sourceId}-${index}`,
    sourceId: params.sourceId,
    text: chunk,
    tags: params.tags ?? [],
    approvedOnly: (params.tags ?? []).includes('approved'),
  } satisfies RetrievalChunk));

  if (allowConversationOsMemoryFallback()) {
    const existing = kernelStore.chunks.get(ctx.conversationId) ?? [];
    kernelStore.chunks.set(ctx.conversationId, [...existing, ...chunks]);
    kernelStore.persist();
  }
  await conversationPersistence.ingestRetrieval(ctx, params.sourceId, params.tags ?? [], chunks);
  return chunks;
}

export async function retrieveRelevantChunks(params: { conversationId: string; query: string; tags?: string[]; approvedOnly?: boolean; limit?: number; projectId?: string; userId?: string; }) {
  const ctx = withCtx(params);
  if (!ctx.projectId) throw new Error('projectId is required');
  const { query, tags = [], approvedOnly, limit = 5 } = params;
  const searchTerms = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const dbChunks = await conversationPersistence.listRetrievalChunks(ctx);
  const source = dbChunks.length > 0 || !allowConversationOsMemoryFallback() ? dbChunks : kernelStore.chunks.get(ctx.conversationId) ?? [];

  return source
    .filter(chunk => {
      if (approvedOnly && !chunk.approvedOnly) return false;
      if (tags.length > 0 && !tags.some(tag => chunk.tags.includes(tag))) return false;
      return true;
    })
    .map(chunk => ({ chunk, score: [...searchTerms].reduce((score, token) => (chunk.text.toLowerCase().includes(token) ? score + 1 : score), 0) }))
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
  if (current.length > 0) chunks.push(current);
  return chunks;
}
