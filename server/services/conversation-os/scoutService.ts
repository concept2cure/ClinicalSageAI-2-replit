import { kernelStore } from './conversationKernel';
import { retrieveRelevantChunks } from './retrievalService';
import { authorizeToolUse } from './toolGateService';

export function runScout(params: { conversationId: string; objective: string; tags?: string[] }) {
  const { conversationId, objective, tags } = params;
  const gate = authorizeToolUse({ conversationId, tool: 'scout.explore', explicitTrigger: true });
  if (gate.action === 'blocked') {
    throw new Error(gate.reason);
  }

  const matches = retrieveRelevantChunks({
    conversationId,
    query: objective,
    tags,
    limit: 4,
  });

  const finding = {
    id: kernelStore.id(),
    summary: matches.map(m => m.text.slice(0, 160)).join(' '),
    chunkIds: matches.map(m => m.id),
    createdAt: new Date().toISOString(),
    promoted: false,
  };

  const list = kernelStore.findings.get(conversationId) ?? [];
  kernelStore.findings.set(conversationId, [finding, ...list]);
  kernelStore.persist();
  return finding;
}

export function listScoutFindings(conversationId: string) {
  return kernelStore.findings.get(conversationId) ?? [];
}

export function promoteScoutFinding(conversationId: string, findingId: string) {
  const findings = kernelStore.findings.get(conversationId) ?? [];
  const updated = findings.map(f => (f.id === findingId ? { ...f, promoted: true } : f));
  kernelStore.findings.set(conversationId, updated);
  kernelStore.persist();
  return updated.find(f => f.id === findingId);
}
