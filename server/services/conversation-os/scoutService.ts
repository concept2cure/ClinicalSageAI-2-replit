import { allowConversationOsMemoryFallback, kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import { retrieveRelevantChunks } from './retrievalService';
import { authorizeToolUse } from './toolGateService';

const withCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? '',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? '',
});

export async function runScout(params: { conversationId: string; objective: string; tags?: string[]; projectId?: string; userId?: string }) {
  const ctx = withCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const gate = await authorizeToolUse({ ...ctx, tool: 'scout.explore', explicitTrigger: true });
  if (gate.action === 'blocked') throw new Error(gate.reason);

  const matches = await retrieveRelevantChunks({ ...ctx, query: params.objective, tags: params.tags, limit: 4 });
  const finding = { id: kernelStore.id(), summary: matches.map(m => m.text.slice(0, 160)).join(' '), chunkIds: matches.map(m => m.id), createdAt: new Date().toISOString(), promoted: false };

  if (allowConversationOsMemoryFallback()) {
    const list = kernelStore.findings.get(ctx.conversationId) ?? [];
    kernelStore.findings.set(ctx.conversationId, [finding, ...list]);
    kernelStore.persist();
  }
  await conversationPersistence.upsertScoutFinding(ctx, finding);
  return finding;
}

export async function listScoutFindings(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withCtx(params);
  if (!ctx.projectId) throw new Error('projectId is required');
  const dbFindings = await conversationPersistence.listScoutFindings(ctx);
  if (dbFindings.length > 0 || !allowConversationOsMemoryFallback()) return dbFindings;
  return kernelStore.findings.get(ctx.conversationId) ?? [];
}

export async function promoteScoutFinding(params: { conversationId: string; findingId: string; projectId?: string; userId?: string }) {
  const ctx = withCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const findings = await listScoutFindings(ctx);
  const promoted = findings.find(f => f.id === params.findingId);
  if (!promoted) return undefined;
  const updated = { ...promoted, promoted: true };
  await conversationPersistence.upsertScoutFinding(ctx, updated);
  if (allowConversationOsMemoryFallback()) {
    kernelStore.findings.set(ctx.conversationId, findings.map(f => (f.id === params.findingId ? updated : f)));
    kernelStore.persist();
  }
  return updated;
}
