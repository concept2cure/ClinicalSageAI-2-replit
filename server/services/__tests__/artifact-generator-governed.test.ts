import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
  executeGovernedAnaOperation: vi.fn(),
}));

vi.mock('../ai-gateway/index.js', () => ({
  getGateway: () => ({ route: mocks.route }),
}));

vi.mock('../governed-ana-execution.js', () => ({
  executeGovernedAnaOperation: mocks.executeGovernedAnaOperation,
}));

import { generateArtifact } from '../ana-ri/artifact-generator.js';

describe('artifact-generator governed execution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns persistence failure when canonical wrapper rejects mutation', async () => {
    mocks.route.mockResolvedValue({
      content: `# Revised Artifact\n\n## Overview\n[KNOWN] This rewrite addresses reviewer concern with explicit evidence citations and structured rationale.\n\n## Updated Content\nThe section now includes endpoint justification, safety analysis, and statistical rationale with traceable references.\n\n## Change Rationale\n[INFERRED] The revised wording reduces ambiguity and aligns with likely reviewer expectations.\n\n## Evidence Labels\n[KNOWN] source dossier references are retained.\n`,
      provider: 'test',
      model: 'm',
    });
    mocks.executeGovernedAnaOperation.mockResolvedValue({
      artifactMutation: null,
      persistenceStatus: 'rejected',
    });

    const result = await generateArtifact({
      actionType: 'revised_artifact',
      conversationContext: [{ role: 'user', content: 'Generate risk memo with evidence.' }],
      projectId: 1,
      organizationId: 1,
      userId: 1,
    });

    expect(mocks.executeGovernedAnaOperation).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
    expect(result.persisted).toBe(false);
  });
});
