import { kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import { registerArtifactWithGovernance } from '../compute/artifactWriteback';
import { authorizeToolUse } from './toolGateService';

const withDefaultCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? 'project-unscoped',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? 'system',
});

export async function createProposal(params: { conversationId: string; artifactId: string; content: string; projectId?: string; userId?: string; quality?: unknown }) {
  const ctx = withDefaultCtx(params);
  const proposal = {
    id: kernelStore.id(),
    conversationId: ctx.conversationId,
    artifactId: params.artifactId,
    content: params.content,
    createdAt: new Date().toISOString(),
    status: 'pending' as const,
  };
  const list = kernelStore.proposals.get(ctx.conversationId) ?? [];
  kernelStore.proposals.set(ctx.conversationId, [proposal, ...list]);
  kernelStore.persist();
  await conversationPersistence.createProposal(ctx, proposal, params.quality);
  return proposal;
}

export async function listProposals(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const persisted = await conversationPersistence.listProposals(ctx);
  if (persisted.length > 0) return persisted;
  return kernelStore.proposals.get(ctx.conversationId) ?? [];
}

export async function acceptProposal(params: { conversationId: string; proposalId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const gate = await authorizeToolUse({ ...ctx, tool: 'artifact.accept', explicitTrigger: true });
  if (gate.action === 'blocked') throw new Error(gate.reason);

  const proposals = await listProposals(ctx);
  const target = proposals.find(p => p.id === params.proposalId);
  if (!target) throw new Error('Proposal not found');

  const updated = proposals.map(p => (p.id === params.proposalId ? { ...p, status: 'accepted' as const } : p));
  kernelStore.proposals.set(ctx.conversationId, updated);
  await conversationPersistence.updateProposalStatus(ctx, params.proposalId, 'accepted');

  let governedConsequence: Awaited<ReturnType<typeof registerArtifactWithGovernance>> | null = null;
  const numericProjectId = Number(ctx.projectId);
  const numericUserId = Number(ctx.userId);
  if (Number.isFinite(numericProjectId) && Number.isFinite(numericUserId)) {
    try {
      governedConsequence = await registerArtifactWithGovernance({
        organizationId: 1,
        projectId: numericProjectId,
        userId: numericUserId,
        title: `Accepted Proposal ${params.proposalId}`,
        content: target.content,
        ctdSection: '5.0',
        sourceJobId: `conversation-${ctx.conversationId}`,
        surfaceKey: 'conversation_os_proposal_accept',
      });
    } catch {
      governedConsequence = null;
    }
  }

  const versions = kernelStore.artifactVersions.get(target.artifactId) ?? [];
  const version = { version: versions.length + 1, content: target.content, acceptedAt: new Date().toISOString() };
  kernelStore.artifactVersions.set(target.artifactId, [...versions, version]);
  kernelStore.persist();

  return { proposalId: target.id, artifactId: target.artifactId, version, governedConsequence };
}

export async function rejectProposal(params: { conversationId: string; proposalId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  const proposals = await listProposals(ctx);
  const updated = proposals.map(p => (p.id === params.proposalId ? { ...p, status: 'rejected' as const } : p));
  kernelStore.proposals.set(ctx.conversationId, updated);
  await conversationPersistence.updateProposalStatus(ctx, params.proposalId, 'rejected');
  kernelStore.persist();
  return updated.find(p => p.id === params.proposalId);
}

export function listArtifactVersions(artifactId: string) {
  return kernelStore.artifactVersions.get(artifactId) ?? [];
}
