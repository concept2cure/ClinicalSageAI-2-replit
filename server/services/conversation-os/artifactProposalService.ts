import { allowConversationOsMemoryFallback, kernelStore } from './conversationKernel';
import { conversationPersistence, type ConversationContext } from './persistence';
import { registerArtifactWithGovernance } from '../compute/artifactWriteback';
import { authorizeToolUse } from './toolGateService';

const withDefaultCtx = (ctx: Partial<ConversationContext> & { conversationId: string }): ConversationContext => ({
  projectId: ctx.projectId ?? '',
  conversationId: ctx.conversationId,
  userId: ctx.userId ?? '',
});

export async function createProposal(params: { conversationId: string; artifactId: string; content: string; projectId?: string; userId?: string; quality?: unknown }) {
  const ctx = withDefaultCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const proposal = {
    id: kernelStore.id(),
    conversationId: ctx.conversationId,
    artifactId: params.artifactId,
    content: params.content,
    createdAt: new Date().toISOString(),
    status: 'pending' as const,
  };
  if (allowConversationOsMemoryFallback()) {
    const list = kernelStore.proposals.get(ctx.conversationId) ?? [];
    kernelStore.proposals.set(ctx.conversationId, [proposal, ...list]);
    kernelStore.persist();
  }
  await conversationPersistence.createProposal(ctx, proposal, params.quality);
  return proposal;
}

export async function listProposals(params: { conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  if (!ctx.projectId) throw new Error('projectId is required');
  const persisted = await conversationPersistence.listProposals(ctx);
  if (persisted.length > 0 || !allowConversationOsMemoryFallback()) return persisted;
  return kernelStore.proposals.get(ctx.conversationId) ?? [];
}

export async function acceptProposal(params: { conversationId: string; proposalId: string; projectId?: string; userId?: string; organizationId?: string }) {
  const ctx = withDefaultCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const gate = await authorizeToolUse({ ...ctx, tool: 'artifact.accept', explicitTrigger: true });
  if (gate.action === 'blocked') throw new Error(gate.reason);

  const proposals = await listProposals(ctx);
  const target = proposals.find(p => p.id === params.proposalId);
  if (!target) throw new Error('Proposal not found');

  await conversationPersistence.updateProposalStatus(ctx, params.proposalId, 'accepted');
  if (allowConversationOsMemoryFallback()) {
    const mem = kernelStore.proposals.get(ctx.conversationId) ?? [];
    kernelStore.proposals.set(
      ctx.conversationId,
      mem.map(p => (p.id === params.proposalId ? { ...p, status: 'accepted' as const } : p))
    );
    kernelStore.persist();
  }

  const numericProjectId = Number(ctx.projectId);
  const numericUserId = Number(ctx.userId);
  const numericOrgId = Number(params.organizationId);

  if (!Number.isFinite(numericProjectId) || !Number.isFinite(numericUserId) || !Number.isFinite(numericOrgId)) {
    await conversationPersistence.recordAcceptedArtifactVersion(
      { ...ctx, organizationId: params.organizationId ?? 'invalid' },
      {
        proposalId: params.proposalId,
        artifactExternalId: target.artifactId,
        artifactVersion: 0,
        artifactStatus: 'accepted_no_governance',
        governanceState: 'ACCEPTED_PERSISTED_NO_GOVERNANCE',
        failureReason: 'Invalid project/user/organization context for governed writeback',
      }
    );
    return {
      state: 'ACCEPTED_PERSISTED_NO_GOVERNANCE' as const,
      proposalId: target.id,
      artifactId: target.artifactId,
      reason: 'Invalid project/user/organization context for governed writeback',
    };
  }

  try {
    const governedConsequence = await registerArtifactWithGovernance({
      organizationId: numericOrgId,
      projectId: numericProjectId,
      userId: numericUserId,
      title: `Accepted Proposal ${params.proposalId}`,
      content: target.content,
      ctdSection: '5.0',
      sourceJobId: `conversation-${ctx.conversationId}`,
      surfaceKey: 'conversation_os_proposal_accept',
    });

    await conversationPersistence.recordAcceptedArtifactVersion(
      { ...ctx, organizationId: String(numericOrgId) },
      {
        proposalId: params.proposalId,
        artifactExternalId: governedConsequence.artifactId,
        artifactVersion: governedConsequence.version,
        artifactStatus: governedConsequence.artifactStatus,
        placementState: governedConsequence.placementState,
        provenanceEventId: governedConsequence.provenanceEventId,
        auditId: governedConsequence.auditId,
        governanceState: 'ACCEPTED_GOVERNED',
      }
    );

    return {
      state: 'ACCEPTED_GOVERNED' as const,
      proposalId: target.id,
      artifactId: target.artifactId,
      governedConsequence,
    };
  } catch (error: any) {
    await conversationPersistence.recordAcceptedArtifactVersion(
      { ...ctx, organizationId: String(numericOrgId) },
      {
        proposalId: params.proposalId,
        artifactExternalId: target.artifactId,
        artifactVersion: 0,
        artifactStatus: 'accepted_no_governance',
        governanceState: 'ACCEPTED_PERSISTED_NO_GOVERNANCE',
        failureReason: error?.message ?? 'Governed writeback failed',
      }
    );
    return {
      state: 'ACCEPTED_PERSISTED_NO_GOVERNANCE' as const,
      proposalId: target.id,
      artifactId: target.artifactId,
      reason: error?.message ?? 'Governed writeback failed',
    };
  }
}

export async function rejectProposal(params: { conversationId: string; proposalId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  await conversationPersistence.updateProposalStatus(ctx, params.proposalId, 'rejected');
  if (allowConversationOsMemoryFallback()) {
    const mem = kernelStore.proposals.get(ctx.conversationId) ?? [];
    kernelStore.proposals.set(
      ctx.conversationId,
      mem.map(p => (p.id === params.proposalId ? { ...p, status: 'rejected' as const } : p))
    );
    kernelStore.persist();
  }
  return { proposalId: params.proposalId, state: 'REJECTED' as const };
}

export async function listArtifactVersions(params: { artifactId: string; conversationId: string; projectId?: string; userId?: string }) {
  const ctx = withDefaultCtx(params);
  if (!ctx.projectId) throw new Error('projectId is required');
  const persisted = await conversationPersistence.listAcceptedArtifactVersions(ctx, params.artifactId);
  if (persisted.length > 0 || !allowConversationOsMemoryFallback()) return persisted;
  return kernelStore.artifactVersions.get(params.artifactId) ?? [];
}
