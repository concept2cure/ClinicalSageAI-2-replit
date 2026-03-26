import { allowConversationOsMemoryFallback, kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import type { ConversationToolConfig, ToolManifest, ToolMode } from './types';

const defaultTools: ConversationToolConfig[] = [
  { name: 'retrieval.search', kind: 'read', enabled: true, requireExplicitPermission: false },
  { name: 'scout.explore', kind: 'read', enabled: true, requireExplicitPermission: false },
  { name: 'artifact.accept', kind: 'mutating', enabled: true, requireExplicitPermission: true },
];

const withCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? '',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? '',
});

export async function upsertToolManifest(params: { conversationId: string; mode: ToolMode; tools?: ConversationToolConfig[]; projectId?: string; userId?: string; }) {
  const ctx = withCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const manifest: ToolManifest = { conversationId: ctx.conversationId, mode: params.mode, tools: params.tools?.length ? params.tools : defaultTools, updatedAt: new Date().toISOString() };
  if (allowConversationOsMemoryFallback()) {
    kernelStore.manifests.set(ctx.conversationId, manifest);
    kernelStore.persist();
  }
  await conversationPersistence.upsertToolManifest(ctx, manifest);
  return manifest;
}

export async function ensureToolManifest(params: { conversationId: string; projectId?: string; userId?: string; }): Promise<ToolManifest> {
  const ctx = withCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const persisted = await conversationPersistence.getToolManifest(ctx);
  if (persisted) return persisted;
  if (allowConversationOsMemoryFallback()) {
    return kernelStore.manifests.get(ctx.conversationId) ?? upsertToolManifest({ ...ctx, mode: 'on-demand' });
  }
  return upsertToolManifest({ ...ctx, mode: 'on-demand' });
}

export async function authorizeToolUse(params: { conversationId: string; tool: string; explicitTrigger?: boolean; projectId?: string; userId?: string; }) {
  const ctx = withCtx(params);
  const manifest = await ensureToolManifest(ctx);
  const config = manifest.tools.find(t => t.name === params.tool);

  if (!config || !config.enabled || manifest.mode === 'off') return logToolEvent(ctx, params.tool, 'blocked', 'Tool disabled by manifest');
  if (manifest.mode === 'on-demand' && !params.explicitTrigger) return logToolEvent(ctx, params.tool, 'blocked', 'On-demand mode requires explicit trigger');
  if (config.kind === 'mutating' && !params.explicitTrigger) return logToolEvent(ctx, params.tool, 'blocked', 'Mutating tool requires explicit permission');
  return logToolEvent(ctx, params.tool, 'allowed', 'Authorized by conversation manifest');
}

async function logToolEvent(ctx: ConversationContext, tool: string, action: 'allowed' | 'blocked', reason: string) {
  const event = { id: kernelStore.id(), conversationId: ctx.conversationId, tool, action, reason, timestamp: new Date().toISOString() };
  if (allowConversationOsMemoryFallback()) {
    kernelStore.events.unshift(event);
    kernelStore.persist();
  }
  await conversationPersistence.logToolEvent(ctx, event);
  return event;
}

export async function listToolEvents(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withCtx(params);
  if (!ctx.projectId) throw new Error('projectId is required');
  const dbEvents = await conversationPersistence.listToolEvents(ctx);
  if (dbEvents.length > 0 || !allowConversationOsMemoryFallback()) return dbEvents;
  return kernelStore.events.filter(e => e.conversationId === ctx.conversationId).slice(0, 100);
}
