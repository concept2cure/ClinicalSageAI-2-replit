/**
 * Track GW review follow-through (ADR-0015 §3, §4, §5): the objections to the
 * first build that were real, each pinned here against the gateway itself.
 *
 * - [2]/[11] An environment variable must not switch the §3 refusal off in
 *   production. Deterministic mode (AI_GATEWAY_DETERMINISTIC, or the legacy
 *   DETERMINISTIC_MODE) returned fixture text before selection ran.
 * - [21]/[22] The PQ refusal has its own code, and its ledger row says why
 *   each model was withheld, so an inspector can tell the control from a
 *   missing configuration.
 * - [5]/[23]/[25]/[26] A governance refusal is not answered as an outage, and
 *   a rate-limit refusal is answered as one.
 * - [24] A call with no tenant is a platform fault, and says so.
 * - [13] A malformed organizationId is not a tenant binding.
 * - [6] Every production rule in the gateway reads production the same way.
 * - [12] A call is metered to the tenant it is bound to, however it was bound.
 * - [16] A request that names a provider with no registry row is refused.
 * - [3] What one tenant's bucket now holds, measured at the gateway's default
 *   limit.
 * - [7] The PQ runner's own request shape, in and out of production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const metered = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('../../usage-recorder.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../usage-recorder')>()),
  recordApiUsageSafe: (entry: Record<string, unknown>) => {
    metered.push(entry);
  },
}));

import { isTerminalGatewayError } from '../gateway-outcome';
import { GATEWAY_ERROR_HTTP_STATUS, classifyGatewayError } from '../gateway-error-map';
import { ModelNotApprovedError } from '../gateway';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { runWithTenantScope } from '../../../db/tenantStore';
import { governedGateway, ledgerRows, request, stubDispatch } from './support/governed-gateway';

const ORG = 42;
const PLAIN =
  'No performance-qualified model is available for high-risk regulatory drafting in this environment.';
const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
  delete process.env.AI_GATEWAY_DETERMINISTIC;
  delete process.env.DETERMINISTIC_MODE;
  delete process.env.AI_GATEWAY_ACCEPT_DETERMINISTIC;
  setOrgPlacementResolver({ resolve: async () => null });
  metered.length = 0;
});
afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

const production = () => {
  process.env.NODE_ENV = 'production';
};
const drafting = (extra = {}) => request({ taskType: 'document_drafting', organizationId: ORG, ...extra });
const chat = (extra = {}) => request({ taskType: 'chat', ...extra });
const inTenant = <T>(tenantId: string, fn: () => T) => runWithTenantScope({ tenantId, role: null, source: 'request' }, fn);

describe('[2]/[11] deterministic mode does not switch the §3 refusal off in production', () => {
  for (const flag of ['AI_GATEWAY_DETERMINISTIC', 'DETERMINISTIC_MODE']) {
    it(`${flag}=true: high-risk drafting is refused in plain words, not answered with fixture text`, async () => {
      production();
      process.env[flag] = 'true';
      const gw = governedGateway({ deterministic: 'env' });
      expect(gw.isDeterministic()).toBe(true);
      const invoked = stubDispatch(gw);
      const out = await gw.route(drafting()).catch((e) => e);
      expect(out.message).toBe(PLAIN);
      expect(out.deterministic).toBeUndefined();
      expect(invoked).toEqual([]);
      expect(ledgerRows(gw)).toEqual([expect.objectContaining({ error: 'MODEL_NOT_PQ_QUALIFIED', success: false })]);
    });
  }

  it('switched on at runtime (setDeterministicMode), the same', async () => {
    production();
    const gw = governedGateway();
    gw.setDeterministicMode(true);
    const out = await gw.route(drafting()).catch((e) => e);
    expect(out.message).toBe(PLAIN);
  });

  it('with no provider configured at all (the CI boot smoke), high-risk drafting is still refused', async () => {
    production();
    process.env.AI_GATEWAY_DETERMINISTIC = 'true';
    const gw = governedGateway({ providers: [], deterministic: 'env' });
    const out = await gw.route(drafting()).catch((e) => e);
    expect(out.message).toBe(PLAIN);
  });

  it('the admission refusal runs before it too: an unbound call is refused, not answered with fixture text', async () => {
    production();
    process.env.AI_GATEWAY_DETERMINISTIC = 'true';
    const gw = governedGateway({ providers: [], deterministic: 'env' });
    await expect(gw.route(chat())).rejects.toMatchObject({ reasonCode: 'DENY_NO_TENANT_BINDING', stage: 'admission' });
  });

  it('control: production deterministic chat is still the fixture (the boot smoke runs on it)', async () => {
    production();
    process.env.AI_GATEWAY_DETERMINISTIC = 'true';
    // The boot smoke sets the written acceptance (ci.yml); without it trunk's
    // 7ca7bc271 refuses a fixed response in production, which is right.
    process.env.AI_GATEWAY_ACCEPT_DETERMINISTIC = 'true';
    const gw = governedGateway({ providers: [], deterministic: 'env' });
    const out = await gw.route(chat({ organizationId: ORG }));
    expect(out.deterministic).toBe(true);
  });

  it('control: outside production, deterministic drafting is the fixture, as before', async () => {
    process.env.AI_GATEWAY_DETERMINISTIC = 'true';
    const gw = governedGateway({ deterministic: 'env' });
    const out = await gw.route(drafting());
    expect(out.deterministic).toBe(true);
  });
});

describe('[21]/[22] the PQ refusal has its own code, and its ledger row says why each model was withheld', () => {
  it('its code is MODEL_NOT_PQ_QUALIFIED: not "not approved", which would be false of an approved model', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    const err = await gw.route(drafting()).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'MODEL_NOT_PQ_QUALIFIED', message: PLAIN });
    expect(err).not.toBeInstanceOf(ModelNotApprovedError);
    expect(isTerminalGatewayError(err)).toBe(true);
  });

  it('strategy: each withheld row is recorded with its pinned version, PQ status and its own reason', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    await gw.route(drafting()).catch(() => undefined);
    const g = ledgerRows(gw)[0].metadata.modelGovernance;
    expect(g.reason).toBe('no-pq-qualified-model');
    expect(g.capableConfigured).toBeGreaterThan(0);
    expect(g.withheld).toContainEqual({
      id: 'claude-opus-4',
      pinnedVersion: 'claude-opus-5-5',
      pqStatus: 'pending',
      reason: 'pq-not-passed',
    });
  });

  it('explicit: a model withheld because it is not approved for high risk is recorded as that, not as a PQ fault', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    // Pinned to a model production can place (Anthropic): since trunk's P1-45
    // (d29275b1b) OpenAI is not a production candidate without the tenant's
    // election, so a gpt-4o pin never reached this check.
    const err = await gw.route(drafting({ provider: 'anthropic', model: 'claude-sonnet-5' })).catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(ledgerRows(gw)[0].metadata.modelGovernance.withheld).toEqual([
      { id: 'claude-sonnet-4', pinnedVersion: 'claude-sonnet-5', pqStatus: 'pending', reason: 'not-approved-for-high-risk' },
    ]);
  });

  it('no capable model configured is its own ledger reason, distinguishable from the control withholding one', async () => {
    production();
    const gw = governedGateway({ providers: ['openai'] });
    stubDispatch(gw);
    const err = await gw.route(drafting()).catch((e) => e);
    expect(err.message).toBe(PLAIN);
    expect(ledgerRows(gw)[0].metadata.modelGovernance).toMatchObject({
      reason: 'no-capable-model',
      withheld: [],
      capableConfigured: 0,
    });
  });
});

describe('[5]/[23]/[25]/[26] a refusal is classified as what it is', () => {
  it('the PQ refusal is MODEL_NOT_QUALIFIED at 403, in the plain words — not a 503 outage', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    const c = classifyGatewayError(await gw.route(drafting()).catch((e) => e));
    expect(c).toEqual({ code: 'MODEL_NOT_QUALIFIED', message: PLAIN });
    expect(GATEWAY_ERROR_HTTP_STATUS[c.code]).toBe(403);
  });

  it('an unknown model says the platform does not have it, not that a real model "would have served it"', async () => {
    const gw = governedGateway();
    stubDispatch(gw);
    const c = classifyGatewayError(await gw.route(chat({ model: 'gpt-5-imaginary' })).catch((e) => e));
    expect(c).toEqual({
      code: 'MODEL_NOT_QUALIFIED',
      message: 'This request was not sent: it named a model this platform does not have.',
    });
  });

  it('a model with no approved entry is MODEL_NOT_QUALIFIED at 403', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    const err = await gw.route(chat({ model: 'local-default', organizationId: ORG })).catch((e) => e);
    expect(classifyGatewayError(err).code).toBe('MODEL_NOT_QUALIFIED');
  });

  it('the high-risk approval refusal no longer says "try again shortly": nothing changes until a model is approved', () => {
    const c = classifyGatewayError(new ModelNotApprovedError('regulatory_review', ['gpt-4o'], 'no-approved-model'));
    expect(c.code).toBe('MODEL_NOT_QUALIFIED');
    expect(c.message).toMatch(/approved for regulatory drafting and review/);
    expect(c.message).not.toMatch(/try again/i);
  });

  it('a rate-limit refusal carries its code and is answered 429 RATE_LIMITED, as the ledger records it', async () => {
    const gw = governedGateway({ perOrgPerMinute: 1 });
    stubDispatch(gw);
    await gw.route(chat({ organizationId: 7 }));
    const err = await gw.route(chat({ organizationId: 7 })).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'RATE_LIMIT_EXCEEDED' });
    const c = classifyGatewayError(err);
    expect(c.code).toBe('RATE_LIMITED');
    expect(GATEWAY_ERROR_HTTP_STATUS[c.code]).toBe(429);
    expect(c.message).toMatch(/Too many requests/);
  });
});

describe('[24] a call with no tenant is refused as a platform fault, not as the organization\'s policy', () => {
  it('its reason code and words name the missing binding; no administrator is sent to fix a policy', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    const err = await gw.route(chat()).catch((e) => e);
    expect(err).toMatchObject({ reasonCode: 'DENY_NO_TENANT_BINDING', stage: 'admission' });
    expect(err.message).toMatch(/not made on behalf of any organization/);
    expect(err.message).toMatch(/platform fault/);
    expect(err.message).not.toMatch(/your organization's|administrator/);
    expect(classifyGatewayError(err).message).toBe(err.message);
  });

  it('its ledger row names tenant binding, and files no PII finding', async () => {
    production();
    const gw = governedGateway();
    stubDispatch(gw);
    await gw.route(chat({ callerModule: 'test:unbound' })).catch(() => undefined);
    const [row] = ledgerRows(gw);
    expect(row).toMatchObject({
      provider: 'none',
      success: false,
      error: 'DENY_NO_TENANT_BINDING',
      callerModule: 'test:unbound',
      metadata: { tenantBinding: { stage: 'admission', boundFrom: 'none' } },
    });
    expect(row.contentPolicy).toBeUndefined();
  });
});

describe('[13] a malformed organizationId is not a tenant binding', () => {
  for (const organizationId of ['', 0, 'undefined', Number.NaN, -3, '1.5', 'org-uuid-1']) {
    it(`${JSON.stringify(organizationId)}: refused at admission in production`, async () => {
      production();
      const gw = governedGateway();
      const invoked = stubDispatch(gw);
      const err = await gw.route(chat({ organizationId: organizationId as never })).catch((e) => e);
      expect(err).toMatchObject({ reasonCode: 'DENY_NO_TENANT_BINDING', stage: 'admission' });
      expect(invoked).toEqual([]);
    });
  }

  it('with an ambient tenant, the call binds to it and is charged to it', async () => {
    const gw = governedGateway({ perOrgPerMinute: 1 });
    stubDispatch(gw);
    await inTenant('7', () => gw.route(chat({ organizationId: '' as never })));
    expect(ledgerRows(gw)[0]).toMatchObject({ organizationId: '7', tenantBoundFrom: 'ambient_scope' });
    await expect(inTenant('7', () => gw.route(chat()))).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
  });

  it('control: a numeric string id is a binding', async () => {
    production();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(chat({ organizationId: '42' as never }));
    expect(invoked).toHaveLength(1);
  });
});

describe('[6] production is read one way across the gateway (NODE_ENV "Production")', () => {
  it('a keyless deploy refuses instead of serving demo content', async () => {
    process.env.NODE_ENV = 'Production';
    const gw = governedGateway({ providers: [] });
    await expect(gw.route(chat({ organizationId: ORG }))).rejects.toThrow(/No AI provider is configured in production/);
  });

  it('placement is enforced: a tenant whose policy could not be read is refused a tenant payload', async () => {
    process.env.NODE_ENV = 'Production';
    setOrgPlacementResolver({
      resolve: async () => {
        throw new Error('db down');
      },
    });
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await expect(gw.route(chat({ organizationId: ORG }))).rejects.toMatchObject({ name: 'GatewayPolicyError' });
    expect(invoked).toEqual([]);
  });
});

describe('[12] a call is metered to the tenant it is bound to', () => {
  it('an ambient-bound served call is metered under the ambient tenant', async () => {
    const gw = governedGateway();
    stubDispatch(gw);
    await inTenant('7', () => gw.route(chat()));
    expect(metered).toEqual([expect.objectContaining({ organizationId: 7, requestCount: 1 })]);
  });

  it('control: an explicit organizationId is metered as before', async () => {
    const gw = governedGateway();
    stubDispatch(gw);
    await gw.route(chat({ organizationId: 9 }));
    expect(metered).toEqual([expect.objectContaining({ organizationId: 9 })]);
  });

  it('control: an unbound call (outside production) is not metered to anyone', async () => {
    const gw = governedGateway();
    stubDispatch(gw);
    await gw.route(chat());
    expect(metered).toEqual([]);
  });
});

describe('[16] a request naming a provider the registry has no row for is refused, not substituted', () => {
  it('is refused, terminal, naming the provider; nothing is dispatched', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(chat({ provider: 'mistral' as never })).catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'unknown-model' });
    expect(err.message).toContain('"mistral"');
    expect(isTerminalGatewayError(err)).toBe(true);
    expect(invoked).toEqual([]);
  });

  it('control (known gap [8]): a known provider that is not configured still falls through to strategy', async () => {
    const gw = governedGateway({ providers: ['anthropic'] });
    const invoked = stubDispatch(gw);
    await gw.route(chat({ provider: 'openai' }));
    expect(invoked).toEqual(['claude-opus-4']);
  });
});

describe('[3] one tenant, one bucket, measured at the default limit (100 a minute per process)', () => {
  it('an Auto turn at its 20-round ceiling has 80 calls left for its tools that minute; the 101st is refused', async () => {
    const gw = governedGateway({ perOrgPerMinute: 100 });
    const invoked = stubDispatch(gw);
    for (let round = 0; round < 20; round += 1) {
      await gw.route(chat({ organizationId: ORG }));
      for (let tool = 0; tool < 4; tool += 1) await inTenant(String(ORG), () => gw.route(chat()));
    }
    expect(invoked).toHaveLength(100);
    const err = await inTenant(String(ORG), () => gw.route(chat())).catch((e) => e);
    expect(err).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', rateLimit: { scope: 'organization', count: 101, limit: 100 } });
  });
});

describe('[7] the PQ runner\'s own request shape (run-pq.ts: no organizationId, callerModule pq-runner)', () => {
  const pqRequest = () => ({
    taskType: 'document_drafting' as const,
    messages: [{ role: 'user' as const, content: 'Draft the PQ generation task.' }],
    temperature: 0,
    callerModule: 'pq-runner',
  });

  /** Replace only the wire call, so the dispatch-time checks inside executeProvider still run. */
  function stubWire(gw: ReturnType<typeof governedGateway>): string[] {
    const sent: string[] = [];
    vi.spyOn(gw as unknown as { dispatchProvider: (m: { id: string; provider: string; model: string }) => Promise<unknown> }, 'dispatchProvider')
      .mockImplementation(async (m) => {
        sent.push(m.id);
        return {
          content: 'ok',
          provider: m.provider,
          model: m.model,
          requestId: 'fake',
          latencyMs: 1,
          cached: false,
          deterministic: false,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
        };
      });
    return sent;
  }

  it('runs on a PQ-pending model in a validation environment (NODE_ENV=staging)', async () => {
    process.env.NODE_ENV = 'staging';
    const gw = governedGateway();
    const sent = stubWire(gw);
    const res = await gw.evaluateModel('claude-opus-4', pqRequest());
    expect(res.content).toBe('ok');
    expect(sent).toEqual(['claude-opus-4']);
  });

  it('is refused under NODE_ENV=production, before the wire, for want of a tenant (a validation run is not a production run)', async () => {
    production();
    const gw = governedGateway();
    const sent = stubWire(gw);
    await expect(gw.evaluateModel('claude-opus-4', pqRequest())).rejects.toMatchObject({
      name: 'GatewayPolicyError',
      stage: 'dispatch',
    });
    expect(sent).toEqual([]);
  });
});
