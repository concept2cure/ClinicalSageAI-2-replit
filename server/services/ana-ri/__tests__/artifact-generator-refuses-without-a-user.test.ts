/**
 * generateArtifact refuses a request that names no user — before it calls the
 * model or records a governed decision.
 *
 * What the code used to do (until 2026-10-15): it generated the document,
 * then ran the governed operation with `actorId: String(userId || 0)`. With no
 * user that is the actor '0' — no user has id 0 — so the evaluation was filed
 * against user 0 (or refused by the ledger after the fact), the write was
 * refused as unattributable, and the model call had been spent on a document
 * nobody could own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  route: vi.fn(),
  executeGovernedAnaOperation: vi.fn(),
}));

vi.mock('../../ai-gateway/index.js', () => ({ getGateway: () => ({ route: mocks.route }) }));
vi.mock('../../governed-ana-execution.js', () => ({
  executeGovernedAnaOperation: mocks.executeGovernedAnaOperation,
}));

import { generateArtifact } from '../artifact-generator.js';

const MEMO = `# Risk Memo

## Summary
[KNOWN] The pivotal study met its primary endpoint; the confidence interval is reported in the efficacy summary.

## Risks
[INFERRED] A reviewer may question the subgroup consistency across regions and sites.

## Mitigations
[MISSING] The integrated safety exposure table is not yet available for the submission.
`;

const REQUEST = {
  actionType: 'risk_memo' as const,
  conversationContext: [{ role: 'user' as const, content: 'Write the risk memo for the efficacy section.' }],
  projectId: 7,
  organizationId: 3,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.route.mockResolvedValue({ content: MEMO, provider: 'test', model: 'm' });
  mocks.executeGovernedAnaOperation.mockResolvedValue({
    artifactMutation: { artifactId: 5, isNew: true },
    persistenceStatus: 'persisted',
  });
});

describe('generateArtifact — who the document is attributed to', () => {
  it.each([
    ['no user', undefined],
    ['user 0', 0],
  ])('refuses with %s, and neither calls the model nor records anything', async (_label, userId) => {
    const result = await generateArtifact({ ...REQUEST, userId });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signed-in user/i);
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.executeGovernedAnaOperation).not.toHaveBeenCalled();
  });

  it('records the governed operation as the user who asked', async () => {
    const result = await generateArtifact({ ...REQUEST, userId: 11 });
    expect(result.success).toBe(true);
    expect(mocks.executeGovernedAnaOperation.mock.calls[0][0].evaluationInput.context.actorId).toBe('11');
  });
});
