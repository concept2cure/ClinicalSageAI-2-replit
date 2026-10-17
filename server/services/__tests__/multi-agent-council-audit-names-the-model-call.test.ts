/**
 * The council's tamper-proof audit rows name the gateway call that served each
 * agent, and claim nothing the council did not observe.
 *
 * Until 2026-10-15:
 *  - executeLLMWithFailover hard-coded `fallbackUsed: false`, and the Drafter's
 *    AGENT_EXECUTION_COMPLETED and the Synthesizer's COUNCIL_SESSION_COMPLETED
 *    rows recorded it, so the tamper-proof log always said no fallback had
 *    occurred. Provider failover happens inside the gateway, which records the
 *    real chain (tried_models) on its own ledger row; the council rows carried
 *    no request id to join to it.
 *  - an empty Synthesizer reply made the DRAFT the final text
 *    (`content || draftText`), and the row still said "completed successfully"
 *    with correctionsApplied / issuesAddressed counts nobody had checked; an
 *    empty Drafter reply went on through the council as a draft.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  route: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../ai-gateway/gateway.js', () => ({ getGateway: () => ({ route: h.route }) }));
vi.mock('../../lib/graceful-degradation', () => ({
  getGracefulDegradationService: () => ({ isFeatureAvailable: () => true }),
}));
vi.mock('../../lib/tamper-proof-audit', () => ({ getTamperProofAuditLog: () => ({ log: h.auditLog }) }));
vi.mock('../../lib/prompt-injection-protection', () => ({
  getPromptInjectionProtection: () => ({
    analyze: (s: string) => ({ detected: [], blocked: false, sanitized: s, riskScore: 0 }),
  }),
  PromptInjectionError: class PromptInjectionError extends Error {},
}));
vi.mock('../lumen-context-builder.js', () => ({ getIntelligencePrefix: vi.fn(async () => '') }));

import { MultiAgentCouncilService } from '../multi-agent-council';

const SERVED = {
  content: 'Section 2.7.3 text.',
  provider: 'anthropic' as const,
  model: 'claude-opus-5-5',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
  latencyMs: 123,
  requestId: 'req-council-1',
  cached: false,
  deterministic: false,
};

function council() {
  const inserted: string[] = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/^\s*INSERT/.test(sql)) {
        inserted.push(sql);
        return { rows: [] };
      }
      if (/FROM lumen\.council_sessions/.test(sql)) {
        return {
          rows: [
            {
              id: 's1',
              section_path: '2.7.3',
              requirements: {},
              context_atom_ids: [],
              drafter_agent_id: 'a1',
              synthesizer_agent_id: 'a4',
              organization_id: 42,
            },
          ],
        };
      }
      if (/FROM lumen\.agent_registry/.test(sql)) {
        return {
          rows: [{ id: params[0], agent_code: 'X', agent_role: 'X', temperature: 0.2, max_tokens: 2000, system_prompt_template: 'Draft {{section_path}}' }],
        };
      }
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  return { svc: new MultiAgentCouncilService(pool as never) as any, inserted };
}

const STATS = {
  verifications: [{ claim: '2 deaths', claimedValue: '2', actualValue: '3', source: 'EDC', status: 'DISCREPANCY' as const, correction: '3' }],
  totalClaims: 1,
  discrepancyCount: 1,
};
const CRITIC = {
  issues: [{ type: 'compliance', severity: 'HIGH' as const, location: '2.7.3', description: 'd', suggestion: 's' }],
  overallAssessment: 'REVISE' as const,
};

function auditDetails(eventType: string): Record<string, unknown> {
  const call = h.auditLog.mock.calls.find(c => c[0] === eventType);
  expect(call, `${eventType} audit row`).toBeDefined();
  return call![2] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.auditLog.mockResolvedValue(undefined);
  h.route.mockResolvedValue(SERVED);
});

describe('the gateway call, not an invented fallback flag', () => {
  it('the council LLM result carries the gateway request id and no fallback flag', async () => {
    const { svc } = council();
    const result = await svc.executeLLMWithFailover('DRAFTER', [{ role: 'user', content: 'x' }], 'corr-1');

    expect(result.gatewayRequestId).toBe('req-council-1');
    expect(result).not.toHaveProperty('fallbackUsed');
  });

  it("the Drafter's audit row names the gateway request, and claims no fallback either way", async () => {
    const { svc } = council();
    await svc.executeDrafter('s1');

    const details = auditDetails('AGENT_EXECUTION_COMPLETED');
    expect(details.gatewayRequestId).toBe('req-council-1');
    expect(details).not.toHaveProperty('fallbackUsed');
  });

  it("the session-completed row names the Synthesizer's gateway request, and says what its counts are", async () => {
    const { svc } = council();
    await svc.executeSynthesizer('s1', 'draft', STATS, CRITIC);

    const details = auditDetails('COUNCIL_SESSION_COMPLETED');
    expect(details.gatewayRequestId).toBe('req-council-1');
    expect(details).not.toHaveProperty('fallbackUsed');
    // Handed to the Synthesizer; nothing checks the final text for them.
    expect(details).toMatchObject({ correctionsRequested: 1, issuesForwarded: 1, synthesizerLatencyMs: 123 });
    expect(details).not.toHaveProperty('correctionsApplied');
    expect(details).not.toHaveProperty('issuesAddressed');
    expect(details).not.toHaveProperty('totalLatencyMs');
  });
});

describe('an empty reply is not a draft, and not the final text', () => {
  it('an empty Synthesizer reply fails (to be retried); the draft is not passed off as the final text', async () => {
    const { svc, inserted } = council();
    h.route.mockResolvedValue({ ...SERVED, content: '' });

    await expect(svc.executeSynthesizer('s1', 'draft with 2 deaths', STATS, CRITIC)).rejects.toMatchObject({
      code: 'EMPTY_AGENT_OUTPUT',
      recoverable: true,
    });
    expect(h.auditLog).not.toHaveBeenCalledWith('COUNCIL_SESSION_COMPLETED', expect.anything(), expect.anything(), expect.anything());
    expect(inserted).toEqual([]);
  });

  it('an empty Drafter reply fails (to be retried), and is not handed on as a draft', async () => {
    const { svc, inserted } = council();
    h.route.mockResolvedValue({ ...SERVED, content: '   ' });

    await expect(svc.executeDrafter('s1')).rejects.toMatchObject({ code: 'EMPTY_AGENT_OUTPUT', recoverable: true });
    expect(inserted).toEqual([]);
  });
});
