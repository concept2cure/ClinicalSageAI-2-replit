import { kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import type { ConversationToolConfig, ToolManifest, ToolMode } from './types';

const defaultTools: ConversationToolConfig[] = [
  { name: 'retrieval.search', kind: 'read', enabled: true, requireExplicitPermission: false },
  { name: 'scout.explore', kind: 'read', enabled: true, requireExplicitPermission: false },
  { name: 'artifact.accept', kind: 'mutating', enabled: true, requireExplicitPermission: true },
];

const withDefaultCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? 'project-unscoped',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? 'system',
});

export async function upsertToolManifest(params: { conversationId: string; mode: ToolMode; tools?: ConversationToolConfig[]; projectId?: string; userId?: string; }) {
  const ctx = withDefaultCtx(params);
  const manifest: ToolManifest = {
    conversationId: ctx.conversationId,
    mode: params.mode,
    tools: params.tools?.length ? params.tools : defaultTools,
    updatedAt: new Date().toISOString(),
  };
  kernelStore.manifests.set(ctx.conversationId, manifest);
  kernelStore.persist();
  await conversationPersistence.upsertToolManifest(ctx, manifest);
  return manifest;
}

export async function ensureToolManifest(params: { conversationId: string; projectId?: string; userId?: string; }): Promise<ToolManifest> {
  const ctx = withDefaultCtx(params);
  const persisted = await conversationPersistence.getToolManifest(ctx);
  if (persisted) {
    kernelStore.manifests.set(ctx.conversationId, persisted);
    return persisted;
  }
  return kernelStore.manifests.get(ctx.conversationId) ?? upsertToolManifest({ ...ctx, mode: 'on-demand' });
}

export async function authorizeToolUse(params: {
  conversationId: string;
  tool: string;
  explicitTrigger?: boolean;
  projectId?: string;
  userId?: string;
}) {
  const ctx = withDefaultCtx(params);
  const { tool, explicitTrigger } = params;
  const manifest = await ensureToolManifest(ctx);
  const config = manifest.tools.find(t => t.name === tool);

  if (!config || !config.enabled || manifest.mode === 'off') {
    return logToolEvent(ctx, tool, 'blocked', 'Tool disabled by manifest');
  }
  if (manifest.mode === 'on-demand' && !explicitTrigger) {
    return logToolEvent(ctx, tool, 'blocked', 'On-demand mode requires explicit trigger');
  }
  if (config.kind === 'mutating' && !explicitTrigger) {
    return logToolEvent(ctx, tool, 'blocked', 'Mutating tool requires explicit permission');
  }
  return logToolEvent(ctx, tool, 'allowed', 'Authorized by conversation manifest');
}

async function logToolEvent(
  ctx: ConversationContext,
  tool: string,
  action: 'allowed' | 'blocked',
  reason: string
) {
  const event = {
    id: kernelStore.id(),
    conversationId: ctx.conversationId,
    tool,
    action,
    reason,
    timestamp: new Date().toISOString(),
  };
  kernelStore.events.unshift(event);
  kernelStore.persist();
  await conversationPersistence.logToolEvent(ctx, event);
  return event;
}

export async function listToolEvents(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const dbEvents = await conversationPersistence.listToolEvents(ctx);
  if (dbEvents.length > 0) return dbEvents;
  return kernelStore.events.filter(e => e.conversationId === ctx.conversationId).slice(0, 100);
}
