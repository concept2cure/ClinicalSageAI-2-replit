/**
 * Conversation-OS proposals say what they are, and are decided once.
 *
 * - plan-execute's "bounded revision loop" appended "Revision N: Added
 *   coverage for <keywords> with source-backed detail." until its own keyword
 *   check passed, and its trace reported "Generate proposal draft" and
 *   "Evaluate and revise (bounded)" as completed for every task — the proposal
 *   a user could accept into a regulatory document claimed source-backed
 *   detail nothing had added.
 * - An accepted proposal could be accepted again, creating another governed
 *   artifact each time, and every one was filed at CTD 5.0 and reported
 *   "placed".
 * - Rejecting a proposal that did not exist, or was already accepted,
 *   answered REJECTED.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({
  retrieve: vi.fn(),
  listProposals: vi.fn(),
  updateProposalStatus: vi.fn(),
  recordAcceptedArtifactVersion: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../conversation-os/retrievalService', () => ({ retrieveRelevantChunks: H.retrieve }));
vi.mock('../conversation-os/persistence', () => ({
  conversationPersistence: {
    upsertPlan: vi.fn(),
    logQualityEvaluation: vi.fn(),
    listProposals: H.listProposals,
    updateProposalStatus: H.updateProposalStatus,
    recordAcceptedArtifactVersion: H.recordAcceptedArtifactVersion,
  },
}));
vi.mock('../conversation-os/conversationKernel', () => ({
  allowConversationOsMemoryFallback: () => false,
  kernelStore: { plans: new Map(), proposals: new Map(), persist: vi.fn(), id: () => 'k-1' },
}));
vi.mock('../conversation-os/toolGateService', () => ({ authorizeToolUse: async () => ({ action: 'allowed' }) }));
vi.mock('../compute/artifactWriteback', () => ({ registerArtifactWithGovernance: H.register }));

import { planAndExecute } from '../conversation-os/orchestrationService';
import { acceptProposal, rejectProposal } from '../conversation-os/artifactProposalService';

const CTX = { conversationId: 'c-1', projectId: '12', userId: '7' };
const HARD = 'Prepare the IND eCTD Module 2 clinical summary and the CMC submission outline for the safety review';

beforeEach(() => {
  vi.clearAllMocks();
  H.retrieve.mockResolvedValue([{ sourceId: 'src-ind-1' }]);
  H.updateProposalStatus.mockResolvedValue(true);
  H.recordAcceptedArtifactVersion.mockResolvedValue(true);
  H.register.mockResolvedValue({
    artifactId: 'gov-1', version: 1, artifactStatus: 'draft', placementState: 'unplaced',
    provenanceEventId: 'prov-1', auditId: 'audit-1',
  });
});

describe('plan-execute', () => {
  it('reports an outline that falls short as falling short, unchanged', async () => {
    const r = await planAndExecute({ ...CTX, task: HARD });
    expect(r.trace.class).toBe('hard');
    expect(r.draft).toBe(`Objective: ${HARD}\nSources: src-ind-1`);
    expect(r.draft).not.toMatch(/Revision|source-backed|Generated a governed proposal/);
    expect(r.quality.pass).toBe(false);
    expect(r.quality.evaluations).toEqual([
      { pass: false, failures: [expect.stringMatching(/^Draft too short/)] },
    ]);
  });

  it('names its steps for what they did', async () => {
    const r = await planAndExecute({ ...CTX, task: HARD });
    expect(r.trace.steps.map((s) => [s.label, s.status])).toEqual([
      ['Classify task complexity', 'completed'],
      ['Retrieve scoped evidence chunks', 'completed'],
      ['Assemble a proposal outline from the task and the retrieved sources', 'completed'],
      ['Evaluate the outline', 'completed'],
    ]);
  });

  it('does not report an evaluation it skipped', async () => {
    H.retrieve.mockResolvedValue([]);
    const r = await planAndExecute({ ...CTX, task: 'Summarise' });
    expect(r.trace.class).toBe('simple');
    expect(r.quality).toEqual({ pass: null, evaluations: [], bypassed: true });
    expect(r.trace.steps[3]).toMatchObject({ label: 'Evaluate the outline', status: 'skipped' });
    expect(r.draft).toBe('Objective: Summarise\nSources: none retrieved');
  });
});

describe('accepting a proposal', () => {
  const pending = { id: 'p-1', conversationId: 'c-1', artifactId: 'doc-1', content: 'Objective: x', status: 'pending', createdAt: '' };

  it('files it unplaced — no invented CTD 5.0', async () => {
    H.listProposals.mockResolvedValue([pending]);
    const r = await acceptProposal({ ...CTX, proposalId: 'p-1', organizationId: '3' });
    expect(r.state).toBe('ACCEPTED_GOVERNED');
    expect(H.register).toHaveBeenCalledTimes(1);
    expect(H.register.mock.calls[0][0].ctdSection).toBeUndefined();
  });

  it('does not accept an accepted proposal again', async () => {
    H.listProposals.mockResolvedValue([{ ...pending, status: 'accepted' }]);
    await expect(acceptProposal({ ...CTX, proposalId: 'p-1', organizationId: '3' })).rejects.toThrow(/already accepted/);
    expect(H.register).not.toHaveBeenCalled();
  });

  it('creates nothing when another request decided it first', async () => {
    H.listProposals.mockResolvedValue([pending]);
    H.updateProposalStatus.mockResolvedValue(false);
    await expect(acceptProposal({ ...CTX, proposalId: 'p-1', organizationId: '3' })).rejects.toThrow(/no longer pending/);
    expect(H.register).not.toHaveBeenCalled();
  });
});

describe('rejecting a proposal', () => {
  it('a proposal that does not exist is not "REJECTED"', async () => {
    H.listProposals.mockResolvedValue([]);
    await expect(rejectProposal({ ...CTX, proposalId: 'p-404' })).rejects.toThrow(/not found/);
    expect(H.updateProposalStatus).not.toHaveBeenCalled();
  });

  it('an accepted proposal is not rejected after the fact', async () => {
    H.listProposals.mockResolvedValue([{ id: 'p-1', status: 'accepted' }]);
    await expect(rejectProposal({ ...CTX, proposalId: 'p-1' })).rejects.toThrow(/already accepted/);
    expect(H.updateProposalStatus).not.toHaveBeenCalled();
  });

  it('a pending proposal is rejected', async () => {
    H.listProposals.mockResolvedValue([{ id: 'p-1', status: 'pending' }]);
    await expect(rejectProposal({ ...CTX, proposalId: 'p-1' })).resolves.toEqual({ proposalId: 'p-1', state: 'REJECTED' });
  });
});
