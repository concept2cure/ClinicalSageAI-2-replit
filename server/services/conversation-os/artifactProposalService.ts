import { kernelStore } from './conversationKernel';
import { authorizeToolUse } from './toolGateService';

export function createProposal(params: { conversationId: string; artifactId: string; content: string }) {
  const proposal = {
    id: kernelStore.id(),
    conversationId: params.conversationId,
    artifactId: params.artifactId,
    content: params.content,
    createdAt: new Date().toISOString(),
    status: 'pending' as const,
  };
  const list = kernelStore.proposals.get(params.conversationId) ?? [];
  kernelStore.proposals.set(params.conversationId, [proposal, ...list]);
  return proposal;
}

export function listProposals(conversationId: string) {
  return kernelStore.proposals.get(conversationId) ?? [];
}

export function acceptProposal(params: { conversationId: string; proposalId: string }) {
  const gate = authorizeToolUse({
    conversationId: params.conversationId,
    tool: 'artifact.accept',
    explicitTrigger: true,
  });
  if (gate.action === 'blocked') {
    throw new Error(gate.reason);
  }

  const proposals = kernelStore.proposals.get(params.conversationId) ?? [];
  const target = proposals.find(p => p.id === params.proposalId);
  if (!target) {
    throw new Error('Proposal not found');
  }

  const updated = proposals.map(p =>
    p.id === params.proposalId ? { ...p, status: 'accepted' as const } : p
  );
  kernelStore.proposals.set(params.conversationId, updated);

  const versions = kernelStore.artifactVersions.get(target.artifactId) ?? [];
  const version = {
    version: versions.length + 1,
    content: target.content,
    acceptedAt: new Date().toISOString(),
  };
  kernelStore.artifactVersions.set(target.artifactId, [...versions, version]);

  return { proposalId: target.id, artifactId: target.artifactId, version };
}

export function rejectProposal(params: { conversationId: string; proposalId: string }) {
  const proposals = kernelStore.proposals.get(params.conversationId) ?? [];
  const updated = proposals.map(p =>
    p.id === params.proposalId ? { ...p, status: 'rejected' as const } : p
  );
  kernelStore.proposals.set(params.conversationId, updated);
  return updated.find(p => p.id === params.proposalId);
}

export function listArtifactVersions(artifactId: string) {
  return kernelStore.artifactVersions.get(artifactId) ?? [];
}
