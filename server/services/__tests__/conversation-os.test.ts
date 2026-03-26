import { describe, expect, it } from 'vitest';
import { ingestKnowledgeChunks, retrieveRelevantChunks } from '../conversation-os/retrievalService';
import { classifyTask, planAndExecute, getLatestPlanSummary } from '../conversation-os/orchestrationService';
import { upsertToolManifest, authorizeToolUse } from '../conversation-os/toolGateService';
import { createProposal, acceptProposal, listProposals } from '../conversation-os/artifactProposalService';

describe('conversation-os retrieval', () => {
  it('chunks and retrieves scoped evidence', async () => {
    await ingestKnowledgeChunks({
      conversationId: 'conv-retrieval',
      sourceId: 'src-1',
      text: 'IND Module 3 contains CMC controls. Diagnostics evidence confirms analytical validity.',
      tags: ['cmc', 'approved'],
      projectId: 'p1',
      userId: 'u1',
    });

    const result = await retrieveRelevantChunks({
      conversationId: 'conv-retrieval',
      query: 'cmc controls',
      approvedOnly: true,
      projectId: 'p1',
      userId: 'u1',
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.sourceId).toBe('src-1');
  });
});

describe('conversation-os tool gate and orchestration', () => {
  it('blocks tool execution in off mode and runs hard-task plan/execute loop', async () => {
    await upsertToolManifest({ conversationId: 'conv-tools', mode: 'off', projectId: 'p2', userId: 'u2' });
    const blocked = await authorizeToolUse({ conversationId: 'conv-tools', tool: 'scout.explore', projectId: 'p2', userId: 'u2' });
    expect(blocked.action).toBe('blocked');

    await upsertToolManifest({ conversationId: 'conv-tools', mode: 'on-demand', projectId: 'p2', userId: 'u2' });
    await ingestKnowledgeChunks({
      conversationId: 'conv-tools',
      sourceId: 'ind-ectd',
      text: 'eCTD sequence assembly requires controlled source mapping and objective execution evidence.',
      tags: ['ectd', 'approved'],
      projectId: 'p2',
      userId: 'u2',
    });

    const classification = classifyTask('Prepare IND/eCTD submission objective and execution plan with sources');
    expect(classification.class).toBe('hard');

    const result = await planAndExecute({
      conversationId: 'conv-tools',
      task: 'Prepare IND/eCTD submission objective and execution plan with sources',
      projectId: 'p2',
      userId: 'u2',
    });

    expect(result.trace.class).toBe('hard');
    expect(result.quality.evaluations.length).toBeGreaterThan(0);

    const plan = await getLatestPlanSummary({ conversationId: 'conv-tools', projectId: 'p2', userId: 'u2' });
    expect(plan?.task).toContain('IND/eCTD');
  });

  it('persists proposal status transitions for accept/reject flow', async () => {
    await upsertToolManifest({ conversationId: 'conv-proposal', mode: 'on-demand', projectId: '55', userId: '77' });
    const proposal = await createProposal({
      conversationId: 'conv-proposal',
      artifactId: 'artifact-conv-proposal',
      content: 'Draft proposal content',
      projectId: '55',
      userId: '77',
    });

    const accepted = await acceptProposal({ conversationId: 'conv-proposal', proposalId: proposal.id, projectId: '55', userId: '77' });
    expect(accepted.proposalId).toBe(proposal.id);

    const latest = await listProposals({ conversationId: 'conv-proposal', projectId: '55', userId: '77' });
    expect(latest[0]?.status).toBe('accepted');
  });
});
