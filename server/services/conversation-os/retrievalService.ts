import { kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import type { RetrievalChunk } from './types';

const withDefaultCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? 'project-unscoped',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? 'system',
});

export async function ingestKnowledgeChunks(params: { conversationId: string; sourceId: string; text: string; tags?: string[]; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const chunks = chunkText(params.text).map((chunk, index) => ({
    id: `${params.sourceId}-${index}`,
    sourceId: params.sourceId,
    text: chunk,
    tags: params.tags ?? [],
    approvedOnly: (params.tags ?? []).includes('approved'),
  } satisfies RetrievalChunk));

  const existing = kernelStore.chunks.get(ctx.conversationId) ?? [];
  kernelStore.chunks.set(ctx.conversationId, [...existing, ...chunks]);
  kernelStore.persist();
  await conversationPersistence.ingestRetrieval(ctx, params.sourceId, params.tags ?? [], chunks);
  return chunks;
}

export async function retrieveRelevantChunks(params: {
  conversationId: string;
  query: string;
  tags?: string[];
  approvedOnly?: boolean;
  limit?: number;
  projectId?: string;
  userId?: string;
}) {
  const ctx = withDefaultCtx(params);
  const { query, tags = [], approvedOnly, limit = 5 } = params;
  const searchTerms = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));

  const dbChunks = await conversationPersistence.listRetrievalChunks(ctx);
  const source = dbChunks.length ? dbChunks : kernelStore.chunks.get(ctx.conversationId) ?? [];

  return source
    .filter(chunk => {
      if (approvedOnly && !chunk.approvedOnly) return false;
      if (tags.length > 0 && !tags.some(tag => chunk.tags.includes(tag))) return false;
      return true;
    })
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

  if (current.length > 0) chunks.push(current);
  return chunks;
}
