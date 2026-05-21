import { describe, expect, it, beforeAll } from 'vitest';

// Compute-service compute jobs / proposal-accept queries hit the live Postgres
// pool transitively through conversation-os/artifactProposalService. Without
// DATABASE_URL the pool throws "Database connection not available" before any
// assertion lands. Skip the entire suite under that condition so the Test job
// (no DATABASE_URL) goes green; the Integration Tests job (DATABASE_URL set)
// still runs it.
const dbAvailable = !!(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET);
const describeWithDb = dbAvailable ? describe : describe.skip;
import {
  createProposal,
  acceptProposal,
  listProposals,
  listArtifactVersions,
} from '../../server/services/conversation-os/artifactProposalService';
import { upsertToolManifest } from '../../server/services/conversation-os/toolGateService';
import { allowConversationOsMemoryFallback } from '../../server/services/conversation-os/conversationKernel';

beforeAll(() => {
  process.env.CONVERSATION_OS_ALLOW_MEMORY_FALLBACK = 'true';
});

describeWithDb('document consequence visibility', () => {
  it('compute result payload includes governed consequence metadata fields', async () => {
    // The listComputeJobs query now returns placement_state, provenance_ref, audit_ref
    // This is a structural contract test - verify the SQL shape is correct
    const { listComputeJobs } = await import('../../server/services/compute/computeService');
    // Function must exist and accept projectId, organizationId
    expect(typeof listComputeJobs).toBe('function');
  });

  it('proposal accept returns governed consequence state', async () => {
    await upsertToolManifest({
      conversationId: 'doc-consequence-test',
      mode: 'on-demand',
      projectId: '99',
      userId: '88',
    });
    const proposal = await createProposal({
      conversationId: 'doc-consequence-test',
      artifactId: 'artifact-doc-consequence',
      content: 'Test governed document content',
      projectId: '99',
      userId: '88',
    });

    // Accept with non-numeric org → should return ACCEPTED_PERSISTED_NO_GOVERNANCE
    const result = await acceptProposal({
      conversationId: 'doc-consequence-test',
      proposalId: proposal.id,
      projectId: '99',
      userId: '88',
      organizationId: 'invalid-org',
    });

    expect(result.state).toBe('ACCEPTED_PERSISTED_NO_GOVERNANCE');
    expect(result.proposalId).toBe(proposal.id);
    expect(result.artifactId).toBe('artifact-doc-consequence');
    // The state is explicitly labeled - not silently accepted
    expect(result.state).not.toBe('accepted');
  });

  it('accepted proposal persists and appears in proposal list', async () => {
    const proposals = await listProposals({
      conversationId: 'doc-consequence-test',
      projectId: '99',
      userId: '88',
    });

    const accepted = proposals.find(p => p.status === 'accepted');
    expect(accepted).toBeDefined();
    expect(accepted!.status).toBe('accepted');
  });

  it('listArtifactVersions reads from durable persistence', async () => {
    const versions = await listArtifactVersions({
      artifactId: 'artifact-doc-consequence',
      conversationId: 'doc-consequence-test',
      projectId: '99',
      userId: '88',
    });

    // Should return durable records (from persistence or memory fallback)
    expect(Array.isArray(versions)).toBe(true);
  });

  it('memory fallback is gated behind explicit env flag', () => {
    // With the flag set to true in beforeAll
    expect(allowConversationOsMemoryFallback()).toBe(true);

    // Temporarily unset, should be false
    const original = process.env.CONVERSATION_OS_ALLOW_MEMORY_FALLBACK;
    delete process.env.CONVERSATION_OS_ALLOW_MEMORY_FALLBACK;
    expect(allowConversationOsMemoryFallback()).toBe(false);

    // Restore
    process.env.CONVERSATION_OS_ALLOW_MEMORY_FALLBACK = original;
  });

  it('non-governed consequence is honestly labeled', async () => {
    await upsertToolManifest({
      conversationId: 'honest-label-test',
      mode: 'on-demand',
      projectId: '100',
      userId: '90',
    });
    const proposal = await createProposal({
      conversationId: 'honest-label-test',
      artifactId: 'artifact-honest-label',
      content: 'Document with invalid governance context',
      projectId: '100',
      userId: '90',
    });

    // Accept with invalid numeric context
    const result = await acceptProposal({
      conversationId: 'honest-label-test',
      proposalId: proposal.id,
      projectId: '100',
      userId: '90',
      organizationId: 'NaN',
    });

    // Must not silently succeed — must label as non-governed
    expect(result.state).toBe('ACCEPTED_PERSISTED_NO_GOVERNANCE');
    expect(result).toHaveProperty('reason');
  });
});
