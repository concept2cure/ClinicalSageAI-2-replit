import { kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import { retrieveRelevantChunks } from './retrievalService';
import { authorizeToolUse } from './toolGateService';

const withDefaultCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? 'project-unscoped',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? 'system',
});

export async function runScout(params: { conversationId: string; objective: string; tags?: string[]; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const gate = await authorizeToolUse({ ...ctx, tool: 'scout.explore', explicitTrigger: true });
  if (gate.action === 'blocked') throw new Error(gate.reason);

  const matches = await retrieveRelevantChunks({ ...ctx, query: params.objective, tags: params.tags, limit: 4 });
  const finding = {
    id: kernelStore.id(),
    summary: matches.map(m => m.text.slice(0, 160)).join(' '),
    chunkIds: matches.map(m => m.id),
    createdAt: new Date().toISOString(),
    promoted: false,
  };

  const list = kernelStore.findings.get(ctx.conversationId) ?? [];
  kernelStore.findings.set(ctx.conversationId, [finding, ...list]);
  kernelStore.persist();
  await conversationPersistence.upsertScoutFinding(ctx, finding);
  return finding;
}

export async function listScoutFindings(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const dbFindings = await conversationPersistence.listScoutFindings(ctx);
  if (dbFindings.length > 0) return dbFindings;
  return kernelStore.findings.get(ctx.conversationId) ?? [];
}

export async function promoteScoutFinding(params: { conversationId: string; findingId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const findings = await listScoutFindings(ctx);
  const updated = findings.map(f => (f.id === params.findingId ? { ...f, promoted: true } : f));
  kernelStore.findings.set(ctx.conversationId, updated);
  const promoted = updated.find(f => f.id === params.findingId);
  if (promoted) await conversationPersistence.upsertScoutFinding(ctx, promoted);
  kernelStore.persist();
  return promoted;
}
