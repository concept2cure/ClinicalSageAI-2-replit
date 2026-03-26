import { describe, expect, it } from 'vitest';
import { ingestKnowledgeChunks, retrieveRelevantChunks } from '../conversation-os/retrievalService';
import { classifyTask, planAndExecute } from '../conversation-os/orchestrationService';
import { upsertToolManifest, authorizeToolUse } from '../conversation-os/toolGateService';

describe('conversation-os retrieval', () => {
  it('chunks and retrieves scoped evidence', () => {
    ingestKnowledgeChunks(
      'conv-retrieval',
      'src-1',
      'IND Module 3 contains CMC controls. Diagnostics evidence confirms analytical validity.',
      ['cmc', 'approved']
    );

    const result = retrieveRelevantChunks({
      conversationId: 'conv-retrieval',
      query: 'cmc controls',
      approvedOnly: true,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.sourceId).toBe('src-1');
  });
});

describe('conversation-os tool gate and orchestration', () => {
  it('blocks tool execution in off mode and runs hard-task plan/execute loop', () => {
    upsertToolManifest('conv-tools', 'off');
    const blocked = authorizeToolUse({ conversationId: 'conv-tools', tool: 'scout.explore' });
    expect(blocked.action).toBe('blocked');

    upsertToolManifest('conv-tools', 'on-demand');
    ingestKnowledgeChunks(
      'conv-tools',
      'ind-ectd',
      'eCTD sequence assembly requires controlled source mapping and objective execution evidence.',
      ['ectd', 'approved']
    );

    const classification = classifyTask('Prepare IND/eCTD submission objective and execution plan with sources');
    expect(classification.class).toBe('hard');

    const result = planAndExecute({
      conversationId: 'conv-tools',
      task: 'Prepare IND/eCTD submission objective and execution plan with sources',
    });

    expect(result.trace.class).toBe('hard');
    expect(result.quality.evaluations.length).toBeGreaterThan(0);
  });
});
