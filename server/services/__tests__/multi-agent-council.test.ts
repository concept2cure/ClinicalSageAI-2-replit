/**
 * Multi-Agent Council — gateway integration tests
 *
 * Guards the migration of the council's LLM path off the legacy
 * MultiProviderLLMService onto the governed AI gateway. These lock in the
 * contract of executeLLMWithFailover():
 *   - delegates to gateway.route() and maps GatewayResponse → CouncilLLMResult
 *   - routes JSON agents as 'structured_output' and prose agents as
 *     'document_drafting' (with jsonMode set accordingly)
 *   - honors graceful-degradation gating (SERVICE_DEGRADED)
 *   - converts a gateway failure into a recoverable CouncilError and audits it
 *   - prepends the client/project intelligence prefix to the system turn
 *
 * @module server/services/__tests__/multi-agent-council.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared mock handles (hoisted so the vi.mock factories can close over them).
const h = vi.hoisted(() => ({
  route: vi.fn(),
  isFeatureAvailable: vi.fn(() => true),
  auditLog: vi.fn(),
  intelligencePrefix: vi.fn(),
  analyze: vi.fn(),
}));

vi.mock('../ai-gateway/gateway.js', () => ({
  getGateway: () => ({ route: h.route }),
}));
vi.mock('../../lib/graceful-degradation', () => ({
  getGracefulDegradationService: () => ({ isFeatureAvailable: h.isFeatureAvailable }),
}));
vi.mock('../../lib/tamper-proof-audit', () => ({
  getTamperProofAuditLog: () => ({ log: h.auditLog }),
}));
vi.mock('../../lib/prompt-injection-protection', () => ({
  getPromptInjectionProtection: () => ({ analyze: h.analyze }),
  PromptInjectionError: class PromptInjectionError extends Error {},
}));
vi.mock('../lumen-context-builder.js', () => ({
  getIntelligencePrefix: h.intelligencePrefix,
}));

import { MultiAgentCouncilService } from '../multi-agent-council';

const VALID_RESPONSE = {
  content: 'hello world',
  provider: 'anthropic' as const,
  model: 'claude-opus-4-7',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
  latencyMs: 123,
  requestId: 'req-1',
  cached: false,
  deterministic: false,
};

const MESSAGES = [
  { role: 'system' as const, content: 'You are a regulatory drafter.' },
  { role: 'user' as const, content: 'Draft section X.' },
];

function freshService(): MultiAgentCouncilService {
  vi.clearAllMocks();
  h.isFeatureAvailable.mockReturnValue(true);
  h.intelligencePrefix.mockResolvedValue('');
  h.analyze.mockImplementation((s: string) => ({
    detected: [],
    blocked: false,
    sanitized: s,
    riskScore: 0,
  }));
  h.auditLog.mockResolvedValue(undefined);
  h.route.mockResolvedValue(VALID_RESPONSE);
  return new MultiAgentCouncilService({} as any);
}

describe('MultiAgentCouncilService — gateway integration', () => {
  let svc: MultiAgentCouncilService;

  beforeEach(() => {
    svc = freshService();
  });

  const call = (operation: string, options?: Record<string, unknown>) =>
    (svc as any).executeLLMWithFailover(operation, [...MESSAGES], 'corr-1', options);

  it('delegates to the gateway and maps the response to CouncilLLMResult', async () => {
    const result = await call('DRAFTER');

    expect(h.route).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      content: 'hello world',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      fallbackUsed: false,
      latencyMs: 123,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
    });
  });

  it('routes prose agents as document_drafting (jsonMode off)', async () => {
    await call('DRAFTER');
    expect(h.route).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'document_drafting',
        jsonMode: false,
        callerModule: 'multi-agent-council',
      })
    );
  });

  it('threads correlationId + operation into the gateway audit metadata', async () => {
    await call('STATISTICIAN', { responseFormat: 'json' });
    expect(h.route).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { operation: 'STATISTICIAN', correlationId: 'corr-1' },
      })
    );
  });

  it('throws SERVICE_DEGRADED (without calling the gateway) when the feature is gated off', async () => {
    h.isFeatureAvailable.mockReturnValue(false);
    await expect(call('DRAFTER')).rejects.toMatchObject({ code: 'SERVICE_DEGRADED' });
    expect(h.route).not.toHaveBeenCalled();
  });

  it('converts a gateway failure into a recoverable CouncilError and audits it', async () => {
    h.route.mockRejectedValueOnce(new Error('all providers down'));
    await expect(call('SYNTHESIZER')).rejects.toMatchObject({
      code: 'ALL_PROVIDERS_UNAVAILABLE',
      recoverable: true,
    });
    expect(h.auditLog).toHaveBeenCalledWith(
      'CIRCUIT_BREAKER_OPENED',
      expect.stringContaining('SYNTHESIZER'),
      expect.objectContaining({ operation: 'SYNTHESIZER' }),
      expect.objectContaining({ correlationId: 'corr-1' })
    );
  });

  it('prepends the intelligence prefix to the system turn when org/project context is present', async () => {
    h.intelligencePrefix.mockResolvedValue('CLIENT-CONTEXT::');
    await call('DRAFTER', { organizationId: 42 });

    const calls = h.route.mock.calls;
    const sentMessages = calls[calls.length - 1][0].messages;
    expect(sentMessages[0]).toEqual({
      role: 'system',
      content: 'CLIENT-CONTEXT::You are a regulatory drafter.',
    });
    // Non-system turns are untouched.
    expect(sentMessages[1]).toEqual({ role: 'user', content: 'Draft section X.' });
  });

  it('does not fetch an intelligence prefix when no org/project context is given', async () => {
    await call('DRAFTER');
    expect(h.intelligencePrefix).not.toHaveBeenCalled();
  });
});

describe('MultiAgentCouncilService — task routing and governance refusals', () => {
  let svc: MultiAgentCouncilService;

  beforeEach(() => {
    svc = freshService();
  });

  const call = (operation: string, options?: Record<string, unknown>) =>
    (svc as any).executeLLMWithFailover(operation, [...MESSAGES], 'corr-1', options);

  it('routes the reviewing agents as regulatory_review, with jsonMode on (not structured_output)', async () => {
    // structured_output may be served by any model; regulatory_review only by
    // one approved for high-risk regulatory work.
    await call('CRITIC', { responseFormat: 'json' });
    expect(h.route).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'regulatory_review', jsonMode: true })
    );
  });

  it.each([
    ['DRAFTER', 'document_drafting'],
    ['STATISTICIAN', 'regulatory_review'],
    ['CRITIC', 'regulatory_review'],
    ['SYNTHESIZER', 'document_drafting'],
  ])('%s is routed as %s whatever its output format', async (operation, taskType) => {
    await call(operation, { responseFormat: 'json' });
    await call(operation, { responseFormat: 'text' });
    for (const [req] of h.route.mock.calls) expect(req.taskType).toBe(taskType);
  });

  it('a governance refusal is final and not audited as an outage', async () => {
    const refusal = Object.assign(new Error('MODEL_NOT_APPROVED_FOR_HIGH_RISK: regulatory_review'), {
      code: 'MODEL_NOT_APPROVED_FOR_HIGH_RISK',
    });
    h.route.mockImplementationOnce(async () => {
      throw refusal;
    });
    await expect(call('CRITIC', { responseFormat: 'json' })).rejects.toMatchObject({
      code: 'MODEL_NOT_APPROVED_FOR_HIGH_RISK',
      recoverable: false,
    });
    expect(h.auditLog).not.toHaveBeenCalledWith('CIRCUIT_BREAKER_OPENED', expect.anything(), expect.anything(), expect.anything());
  });

  it('withRetry does not retry an error marked unrecoverable, and does retry a recoverable one', async () => {
    const { CouncilError } = await import('../multi-agent-council');
    (svc as any).RETRY_DELAY_MS = 0;
    const final = vi.fn(async () => {
      throw new CouncilError('refused', 'MODEL_NOT_APPROVED_FOR_HIGH_RISK', undefined, undefined, false);
    });
    await expect((svc as any).withRetry(final, 'CRITIC')).rejects.toMatchObject({ recoverable: false });
    expect(final).toHaveBeenCalledTimes(1);

    const transient = vi.fn(async () => {
      throw new CouncilError('down', 'ALL_PROVIDERS_UNAVAILABLE', undefined, undefined, true);
    });
    await expect((svc as any).withRetry(transient, 'CRITIC')).rejects.toMatchObject({ recoverable: true });
    expect(transient).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// The reviewing agents' results. The model extracts claims and issues; it does
// not decide them, and an unreadable reply is not a clean review.
// ---------------------------------------------------------------------------

interface Binding {
  id: string;
  binding_code: string;
  binding_name: string;
  binding_type: 'SQL' | 'ATOM_QUERY' | 'API';
  query_templates: Record<string, string>;
}

function councilWith(bindings: Binding[], sqlRows: Record<string, unknown[]> = {}) {
  const inserted: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/FROM lumen\.council_sessions/.test(sql)) {
        return { rows: [{ id: 's1', section_path: '2.7.3', statistician_agent_id: 'a2', critic_agent_id: 'a3' }] };
      }
      if (/FROM lumen\.agent_registry/.test(sql)) {
        return {
          rows: [{ id: params[0], agent_code: 'X', agent_role: 'X', temperature: 0, max_tokens: 2000, system_prompt_template: 'Review {{draft_text}}' }],
        };
      }
      if (/FROM lumen\.data_bindings/.test(sql)) return { rows: bindings };
      if (/SELECT id FROM lumen\.agent_executions/.test(sql)) return { rows: [{ id: 'e1' }] };
      if (/^\s*INSERT/.test(sql)) {
        inserted.push({ sql, params });
        return { rows: [] };
      }
      if (sql in sqlRows) return { rows: sqlRows[sql] };
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  const svc = new MultiAgentCouncilService(pool as any);
  (svc as any).RETRY_DELAY_MS = 0;
  return { svc: svc as any, inserted };
}

const ENROLMENT: Binding = {
  id: 'b1',
  binding_code: 'EDC',
  binding_name: 'EDC',
  binding_type: 'SQL',
  query_templates: { enrolled_subjects: 'SELECT n FROM enrolled', deaths: 'SELECT n FROM deaths' },
};
const API_BINDING: Binding = {
  id: 'b2',
  binding_code: 'CTMS',
  binding_name: 'CTMS',
  binding_type: 'API',
  query_templates: { sites_activated: '/sites' },
};

function statisticianSays(verifications: unknown[]) {
  h.route.mockResolvedValue({ ...VALID_RESPONSE, content: JSON.stringify({ verifications }) });
}

describe('Statistician — only bound data decides a claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isFeatureAvailable.mockReturnValue(true);
    h.intelligencePrefix.mockResolvedValue('');
    h.auditLog.mockResolvedValue(undefined);
  });

  it('a claim that matches the data is VERIFIED; one that differs is a DISCREPANCY corrected to the data', async () => {
    const { svc } = councilWith([ENROLMENT], {
      'SELECT n FROM enrolled': [{ n: 412 }],
      'SELECT n FROM deaths': [{ n: 3 }],
    });
    statisticianSays([
      { claim: '412 enrolled subjects', claimedValue: '412', source: 'EDC', status: 'VERIFIED' },
      { claim: '2 deaths', claimedValue: '2', source: 'EDC', status: 'VERIFIED' },
    ]);

    const r = await svc.executeStatistician('s1', 'draft');

    expect(r.verifications.map((v: any) => [v.status, v.actualValue, v.correction])).toEqual([
      ['VERIFIED', '412', undefined],
      ['DISCREPANCY', '3', '3'],
    ]);
    expect(r.discrepancyCount).toBe(1);
  });

  it("the model's own VERIFIED is not a verdict: no matching binding means UNVERIFIABLE", async () => {
    const { svc } = councilWith([ENROLMENT]);
    statisticianSays([{ claim: 'median age 54', claimedValue: '54', source: 'demographics', status: 'VERIFIED' }]);

    const r = await svc.executeStatistician('s1', 'draft');

    expect(r.verifications[0]).toMatchObject({ status: 'UNVERIFIABLE', actualValue: null });
    expect(r.discrepancyCount).toBe(0);
  });

  it("the model's own correction is not a figure: it is dropped when no data answered", async () => {
    const { svc } = councilWith([]);
    statisticianSays([
      { claim: '2 deaths', claimedValue: '2', source: 'EDC', status: 'DISCREPANCY', correction: '5' },
    ]);

    const r = await svc.executeStatistician('s1', 'draft');

    expect(r.verifications[0].status).toBe('UNVERIFIABLE');
    expect(r.verifications[0].correction).toBeUndefined();
    expect(r.discrepancyCount).toBe(0);
  });

  it('a binding that returns nothing is UNVERIFIABLE, not a DISCREPANCY corrected to an empty string', async () => {
    const { svc } = councilWith([ENROLMENT, API_BINDING], { 'SELECT n FROM enrolled': [] });
    statisticianSays([
      { claim: '412 enrolled subjects', claimedValue: '412', source: 'EDC', status: 'VERIFIED' },
      { claim: '31 sites activated', claimedValue: '31', source: 'CTMS', status: 'VERIFIED' },
    ]);

    const r = await svc.executeStatistician('s1', 'draft');

    for (const v of r.verifications) {
      expect(v.status).toBe('UNVERIFIABLE');
      expect(v.correction).toBeUndefined();
    }
    expect(r.discrepancyCount).toBe(0);
    expect(h.auditLog).not.toHaveBeenCalledWith('DATA_DISCREPANCY_DETECTED', expect.anything(), expect.anything(), expect.anything());
  });

  it('a count of 0 read from the data is a value, and verifies a claim of 0', async () => {
    const { svc } = councilWith([ENROLMENT], { 'SELECT n FROM deaths': [{ n: 0 }] });
    statisticianSays([{ claim: '0 deaths', claimedValue: '0', source: 'EDC', status: 'UNVERIFIABLE' }]);

    const r = await svc.executeStatistician('s1', 'draft');

    expect(r.verifications[0]).toMatchObject({ status: 'VERIFIED', actualValue: '0' });
  });

  it.each([
    ['prose', 'All numbers look right to me.'],
    ['JSON without a verifications list', '{"summary":"fine"}'],
    ['an empty reply', ''],
  ])('an unreadable reply (%s) fails, and is not recorded as zero claims', async (_what, content) => {
    const { svc, inserted } = councilWith([ENROLMENT]);
    h.route.mockResolvedValue({ ...VALID_RESPONSE, content });

    await expect(svc.executeStatistician('s1', 'draft')).rejects.toMatchObject({
      code: 'UNREADABLE_AGENT_OUTPUT',
      recoverable: true,
    });
    expect(inserted).toEqual([]);
  });

  it('an empty verifications list is a real answer — a draft with no numerical claims', async () => {
    const { svc } = councilWith([ENROLMENT]);
    statisticianSays([]);

    const r = await svc.executeStatistician('s1', 'draft');

    expect(r).toMatchObject({ totalClaims: 0, discrepancyCount: 0 });
  });
});

describe('Critic — an unreadable review is not "no issues"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isFeatureAvailable.mockReturnValue(true);
    h.intelligencePrefix.mockResolvedValue('');
    h.auditLog.mockResolvedValue(undefined);
  });

  const STATS = { verifications: [], totalClaims: 0, discrepancyCount: 0 };

  it('unreadable → fails and records nothing', async () => {
    const { svc, inserted } = councilWith([]);
    h.route.mockResolvedValue({ ...VALID_RESPONSE, content: 'Looks good overall.' });

    await expect(svc.executeCritic('s1', 'draft', STATS)).rejects.toMatchObject({ code: 'UNREADABLE_AGENT_OUTPUT' });
    expect(inserted).toEqual([]);
  });

  it('a readable review keeps its issues and its assessment; an unknown assessment is the cautious REVISE', async () => {
    const { svc } = councilWith([]);
    const issue = { type: 'compliance', severity: 'HIGH', location: '2.7.3', description: 'd', suggestion: 's' };
    h.route.mockResolvedValue({ ...VALID_RESPONSE, content: JSON.stringify({ issues: [issue], overall_assessment: 'PASS' }) });
    expect(await svc.executeCritic('s1', 'draft', STATS)).toEqual({ issues: [issue], overallAssessment: 'PASS' });

    h.route.mockResolvedValue({ ...VALID_RESPONSE, content: JSON.stringify({ issues: [], overall_assessment: 'LGTM' }) });
    expect((await svc.executeCritic('s1', 'draft', STATS)).overallAssessment).toBe('REVISE');
  });
});
