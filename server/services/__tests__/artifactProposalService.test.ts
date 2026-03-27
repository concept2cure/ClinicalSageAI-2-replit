import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  listProposalsMock,
  updateProposalStatusMock,
  recordAcceptedArtifactVersionMock,
  registerArtifactWithGovernanceMock,
  authorizeToolUseMock,
} = vi.hoisted(() => ({
  listProposalsMock: vi.fn(),
  updateProposalStatusMock: vi.fn(),
  recordAcceptedArtifactVersionMock: vi.fn(),
  registerArtifactWithGovernanceMock: vi.fn(),
  authorizeToolUseMock: vi.fn(),
}));

vi.mock('../conversation-os/persistence', () => ({
  conversationPersistence: {
    listProposals: listProposalsMock,
    updateProposalStatus: updateProposalStatusMock,
    recordAcceptedArtifactVersion: recordAcceptedArtifactVersionMock,
  },
}));

vi.mock('../compute/artifactWriteback', () => ({
  registerArtifactWithGovernance: registerArtifactWithGovernanceMock,
}));

vi.mock('../conversation-os/toolGateService', () => ({
  authorizeToolUse: authorizeToolUseMock,
}));

vi.mock('../conversation-os/conversationKernel', () => ({
  allowConversationOsMemoryFallback: () => false,
  kernelStore: {
    proposals: new Map(),
    persist: vi.fn(),
    id: () => 'k-1',
  },
}));

import { acceptProposal, listProposals } from '../conversation-os/artifactProposalService';

describe('artifactProposalService consequence behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeToolUseMock.mockResolvedValue({ action: 'allowed' });
    updateProposalStatusMock.mockResolvedValue(true);
    recordAcceptedArtifactVersionMock.mockResolvedValue(true);
  });

  it('passes through accepted-governance consequence fields on proposal list', async () => {
    listProposalsMock.mockResolvedValueOnce([
      {
        id: 'p-1',
        conversationId: 'conv-1',
        artifactId: 'artifact-1',
        content: 'Draft content',
        status: 'accepted',
        createdAt: new Date('2026-03-27T00:00:00.000Z').toISOString(),
        governanceState: 'ACCEPTED_GOVERNED',
        artifactVersion: 4,
        artifactStatus: 'review',
        placementState: 'placed',
        provenanceRef: 'prov-1',
        auditRef: 'audit-1',
      },
    ]);

    const proposals = await listProposals({
      conversationId: 'conv-1',
      projectId: '100',
      userId: '200',
    });

    expect(proposals[0]).toMatchObject({
      governanceState: 'ACCEPTED_GOVERNED',
      artifactVersion: 4,
      artifactStatus: 'review',
      placementState: 'placed',
      provenanceRef: 'prov-1',
      auditRef: 'audit-1',
    });
  });

  it('returns honest persisted-no-governance state when organization context is invalid', async () => {
    listProposalsMock.mockResolvedValueOnce([
      {
        id: 'p-2',
        conversationId: 'conv-2',
        artifactId: 'artifact-2',
        content: 'draft',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ]);

    const accepted = await acceptProposal({
      conversationId: 'conv-2',
      proposalId: 'p-2',
      projectId: '11',
      userId: '22',
      organizationId: 'not-a-number',
    });

    expect(accepted.state).toBe('ACCEPTED_PERSISTED_NO_GOVERNANCE');
    expect(recordAcceptedArtifactVersionMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        governanceState: 'ACCEPTED_PERSISTED_NO_GOVERNANCE',
      })
    );
  });

  it('returns governed consequence metadata after successful acceptance', async () => {
    listProposalsMock.mockResolvedValueOnce([
      {
        id: 'p-3',
        conversationId: 'conv-3',
        artifactId: 'artifact-3',
        content: 'draft',
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ]);
    registerArtifactWithGovernanceMock.mockResolvedValueOnce({
      artifactId: 'gov-3',
      version: 2,
      artifactStatus: 'draft',
      placementState: 'placed',
      provenanceEventId: 'prov-3',
      auditId: 'audit-3',
    });

    const accepted = await acceptProposal({
      conversationId: 'conv-3',
      proposalId: 'p-3',
      projectId: '44',
      userId: '55',
      organizationId: '66',
    });

    expect(accepted.state).toBe('ACCEPTED_GOVERNED');
    expect(accepted.governedConsequence).toMatchObject({
      artifactId: 'gov-3',
      version: 2,
      artifactStatus: 'draft',
      placementState: 'placed',
      provenanceEventId: 'prov-3',
      auditId: 'audit-3',
    });
    expect(recordAcceptedArtifactVersionMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        proposalId: 'p-3',
        artifactExternalId: 'gov-3',
        governanceState: 'ACCEPTED_GOVERNED',
      })
    );
  });
});
