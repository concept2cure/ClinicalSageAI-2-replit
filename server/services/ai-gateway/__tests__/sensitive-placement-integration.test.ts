import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, GatewayPolicyError } from '../gateway';

describe('sensitive placement dispatch integration', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('never invokes a provider client when production placement is blocked', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AI_PII_ENFORCEMENT = 'block';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = '{}';
    const gateway = new AIGateway({
      deterministicMode: false,
      auditEnabled: true,
      providers: [{ name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] }],
      policy: { maxTokensPerRequest: 16000, maxRequestsPerMinutePerOrg: 100, maxRequestsPerMinutePerUser: 30, blockedPatterns: [], contentFilters: true, piiDetection: true },
    });
    const providerDispatch = vi.spyOn(gateway as any, 'dispatchProvider');

    await expect(gateway.route({
      taskType: 'chat',
      messages: [{ role: 'user', content: 'Patient email is patient@example.com' }],
    })).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_UNKNOWN_PROVIDER'),
    });
    expect(providerDispatch).not.toHaveBeenCalled();
    const entries = (gateway as any).auditLogger.getRecentEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      provider: 'none',
      success: false,
      error: 'DENY_UNKNOWN_PROVIDER',
      metadata: { sensitivePlacement: { provider: 'openai', reasonCode: 'DENY_UNKNOWN_PROVIDER' } },
    });
    expect(JSON.stringify(entries[0])).not.toContain('patient@example.com');
  });
});
