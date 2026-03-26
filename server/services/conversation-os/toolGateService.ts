import { kernelStore } from './conversationKernel';
import type { ConversationToolConfig, ToolManifest, ToolMode } from './types';

const defaultTools: ConversationToolConfig[] = [
  { name: 'retrieval.search', kind: 'read', enabled: true, requireExplicitPermission: false },
  { name: 'scout.explore', kind: 'read', enabled: true, requireExplicitPermission: false },
  { name: 'artifact.accept', kind: 'mutating', enabled: true, requireExplicitPermission: true },
];

export function upsertToolManifest(conversationId: string, mode: ToolMode, tools?: ConversationToolConfig[]) {
  const manifest: ToolManifest = {
    conversationId,
    mode,
    tools: tools?.length ? tools : defaultTools,
    updatedAt: new Date().toISOString(),
  };
  kernelStore.manifests.set(conversationId, manifest);
  kernelStore.persist();
  return manifest;
}

export function ensureToolManifest(conversationId: string): ToolManifest {
  return kernelStore.manifests.get(conversationId) ?? upsertToolManifest(conversationId, 'on-demand');
}

export function authorizeToolUse(params: {
  conversationId: string;
  tool: string;
  explicitTrigger?: boolean;
}) {
  const { conversationId, tool, explicitTrigger } = params;
  const manifest = ensureToolManifest(conversationId);
  const config = manifest.tools.find(t => t.name === tool);

  if (!config || !config.enabled || manifest.mode === 'off') {
    return logToolEvent(conversationId, tool, 'blocked', 'Tool disabled by manifest');
  }

  if (manifest.mode === 'on-demand' && !explicitTrigger) {
    return logToolEvent(conversationId, tool, 'blocked', 'On-demand mode requires explicit trigger');
  }

  if (config.kind === 'mutating' && !explicitTrigger) {
    return logToolEvent(conversationId, tool, 'blocked', 'Mutating tool requires explicit permission');
  }

  return logToolEvent(conversationId, tool, 'allowed', 'Authorized by conversation manifest');
}

function logToolEvent(
  conversationId: string,
  tool: string,
  action: 'allowed' | 'blocked',
  reason: string
) {
  const event = {
    id: kernelStore.id(),
    conversationId,
    tool,
    action,
    reason,
    timestamp: new Date().toISOString(),
  };
  kernelStore.events.unshift(event);
  kernelStore.persist();
  return event;
}

export function listToolEvents(conversationId: string) {
  return kernelStore.events.filter(e => e.conversationId === conversationId).slice(0, 100);
}
