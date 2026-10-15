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

export async function acceptProposal(params: { conversationId: string; proposalId: string; projectId?: string; userId?: string; organizationId?: string; ipAddress?: string | null }) {
  const ctx = withDefaultCtx(params);
  if (!ctx.projectId || !ctx.userId) throw new Error('projectId and userId are required');
  const gate = await authorizeToolUse({ ...ctx, tool: 'artifact.accept', explicitTrigger: true });
  if (gate.action === 'blocked') throw new Error(gate.reason);

  const proposals = await listProposals(ctx);
  const target = proposals.find(p => p.id === params.proposalId);
  if (!target) throw new Error('Proposal not found');
  // Accepted once, from pending. Every acceptance created another governed
  // artifact, and the status write's "no row changed" answer was ignored.
  if (target.status !== 'pending') throw new Error(`Proposal is already ${target.status}`);

  const moved = await conversationPersistence.updateProposalStatus(ctx, params.proposalId, 'accepted');
  if (!moved && !allowConversationOsMemoryFallback()) {
    throw new Error('Proposal is no longer pending; nothing was accepted');
  }
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
      // No ctdSection: a proposal names no CTD placement, and every accepted
      // one was filed as 5.0 and reported "placed" (removed 2026-10-15). It
      // arrives unplaced, as it is.
      surfaceKey: 'conversation_os_proposal_accept',
      sourceType: 'proposal_accept',
      backendRoute: 'POST /api/conversation-os/conversations/:conversationId/proposals/:proposalId/accept',
      ipAddress: params.ipAddress ?? null,
      metadata: { source: 'proposal_accept', proposalId: params.proposalId, conversationId: ctx.conversationId },
      auditMetadata: { source: 'proposal_accept', proposalId: params.proposalId },
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
      artifactId: governedConsequence.artifactId,
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
  // A proposal that does not exist, or was already decided, is not "REJECTED".
  const target = (await listProposals(ctx)).find(p => p.id === params.proposalId);
  if (!target) throw new Error('Proposal not found');
  if (target.status !== 'pending') throw new Error(`Proposal is already ${target.status}`);
  const moved = await conversationPersistence.updateProposalStatus(ctx, params.proposalId, 'rejected');
  if (!moved && !allowConversationOsMemoryFallback()) {
    throw new Error('Proposal is no longer pending; nothing was rejected');
  }
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
