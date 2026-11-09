/**
 * Last-mile sensitive-dispatch gate — configuration failure + audit-mode signal.
 *
 * Two guards proven here:
 *  1. A malformed AI_PROVIDER_PLACEMENT_APPROVALS value under enforcement is a
 *     TERMINAL GatewayPolicyError — never retried, never walked down the
 *     fallback chain as if every provider were down. A config error must not
 *     be misreported as an all-provider outage.
 *  2. Non-production audit mode records a content-free structured warning when
 *     PHI/PII heads to a provider (the signal audit mode exists for), while
 *     still never blocking.
 *  3. ONE env contract governs runtime enforcement: the gate enforces in
 *     production always, and in ANY environment that sets
 *     AI_SENSITIVE_DATA_POLICY_MODE=enforce or AI_PII_ENFORCEMENT=block. A
 *     staging deployment that declares the policy mode the production boot
 *     assert requires gets real dispatch-time enforcement, not silent audit.
 *
 * Production enforcement behavior is pinned by
 * sensitive-placement-integration.test.ts; the pure decision table by
 * sensitive-placement-policy.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { createRunSourceAuthority, runWithSourceAuthority, recordCurrentRunSource } from '../model-call-scope';

const derivativeIO = vi.hoisted(() => ({ source: vi.fn(), bytes: Buffer.alloc(0) }));
// The current actor/source facade is an observed upstream boundary here; its
// SQL admission is qualified separately. Custody SQL and envelope crypto stay real.
vi.mock('../../vault/document-catalog.service', () => ({ loadDocumentForActor: derivativeIO.source }));
vi.mock('../../storage/index', () => ({ getStorageProviderFor: () => ({
  get: async (_version: string, org: number) => org === 7 ? { bytes: derivativeIO.bytes,
    sha256: createHash('sha256').update(derivativeIO.bytes).digest('hex') } : null,
}) }));
vi.mock('../../security/field-encryption', async original => {
  const real = await original<typeof import('../../security/field-encryption')>();
  const ops = {
    generate: async (keyId: string) => ({ keyId, plaintext: Buffer.alloc(32, 7), ciphertext: Buffer.from('fixture-wrapped-key') }),
    decrypt: async (keyId: string) => ({ keyId, plaintext: Buffer.alloc(32, 7) }),
  };
  return { ...real,
    sealTenantPayload: (text: string, context: Parameters<typeof real.sealTenantPayload>[1], key: string) => real.sealTenantPayload(text, context, key, ops),
    openTenantPayload: (text: string, context: Parameters<typeof real.openTenantPayload>[1], key: string) => real.openTenantPayload(text, context, key, ops),
  };
});

const DERIVATIVE_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const PROGRAM_ID = '33333333-3333-4333-8333-333333333333';
const SECRET = 'CANARY_PRIVATE_MOLECULE_729';
const SOURCE_TEXT = `Result for ${SECRET}: 42%.`;
const derivativeInput: DerivativeGatewayRequest = { organizationId: 7, userId: 3, projectId: 42,
  derivativeId: DERIVATIVE_ID, taskType: 'document_analysis', provider: 'openai' };

/** Real custody SELECTs and authenticated encryption; replace external byte/KMS
 * services and the separately tested actor source facade, never authorization. */
async function derivativeFixture() {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id INTEGER PRIMARY KEY,status TEXT,settings JSONB);
    CREATE TABLE ai_placement_policies(organization_id INTEGER,required_data_residency TEXT,zero_data_retention BOOLEAN,
      allowed_substrates JSONB,allowed_providers JSONB,public_source_frontier BOOLEAN,public_source_egress BOOLEAN);
    INSERT INTO ai_placement_policies VALUES(7,NULL,false,NULL,'["openai","anthropic"]',false,true)`);
  const transform = buildExplicitDerivative(SOURCE_TEXT, 'Result for {{0}}: 42%.',
    [{ start: 11, end: 11 + SECRET.length, label: 'MOLECULE' }]);
  const identity = { organizationId: 7, projectId: 42, derivativeId: DERIVATIVE_ID,
    sourceHash: 'a'.repeat(64), policyVersion: 1, expiresAt: new Date(Date.now() + 3600_000).toISOString() };
  const key = 'arn:aws:kms:us-east-1:123456789012:key/44444444-4444-4444-8444-444444444444';
  derivativeIO.bytes = Buffer.from(await sealTenantPayload(JSON.stringify(transform), identity, key));
  const state = { policy: { enabled: true, kmsKeyArn: key, maxLifetimeSeconds: 3600, version: 1 },
    records: { [DERIVATIVE_ID]: { ...identity, documentId: SOURCE_ID, programId: PROGRAM_ID,
      extractedTextSha256: derivativePayloadSha256(SOURCE_TEXT), payloadSha256: transform.payloadSha256,
      status: 'attested', version: 2, createdBy: 3, attestedBy: 3, attestedAt: new Date().toISOString(),
      storage: { provider: 'local', versionId: SOURCE_ID, sha256: derivativePayloadSha256(derivativeIO.bytes.toString()) } } } };
  const save = () => pg.query('UPDATE organizations SET settings=$1 WHERE id=7', [JSON.stringify({ derivativeCustody: state })]);
  await pg.query('INSERT INTO organizations VALUES(7,$1,$2),(8,$1,$3)', ['active', JSON.stringify({ derivativeCustody: state }), '{}']);
  derivativeIO.source.mockImplementation(async input => input.organizationId === 7 && input.userId === 3 && input.projectId === 42 ? {
    id: SOURCE_ID, organizationId: 7, programId: PROGRAM_ID, classification: 'CONFIDENTIAL', isCurrent: true,
    admittedScope: { projectId: 42 }, sourceAccess: { currentUseEligible: true },
    contentHash: identity.sourceHash, extractedText: SOURCE_TEXT, extractedTextSha256: derivativePayloadSha256(SOURCE_TEXT),
  } : null);
  const pool = { query: async (sql: string, args?: unknown[]) => pg.query<Record<string, unknown>>(sql, args),
    connect: async () => ({ query: async (sql: string, args?: unknown[]) => pg.query<Record<string, unknown>>(sql, args), release() {} }) };
  const gateway = buildGateway(false, true, true);
  const sdk = vi.fn(async (params: any) => ({ model: 'gpt-4o', choices: [{ message: { content: params.messages[1].content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  (gateway as any).openaiClient = { chat: { completions: { create: sdk } } };
  const dispatch = vi.spyOn(gateway as any, 'dispatchProvider');
  return { pg, state, save, pool, gateway, dispatch, transform, sdk };
}

describe('approved derivative dispatch and local reinjection', () => {
  const saved = { ...process.env };
  let fixture: Awaited<ReturnType<typeof derivativeFixture>>;
  beforeEach(async () => { process.env.NODE_ENV = 'test'; fixture = await derivativeFixture(); });
  afterEach(async () => { await fixture.pg.close(); process.env = { ...saved }; vi.restoreAllMocks(); vi.useRealTimers(); resetOrgPlacementResolver(); });

  it('rebuilds every context channel and restores the exact seeded bytes only after local verification', async () => {
    const malicious = { ...derivativeInput, messages: [{ role: 'system', content: SECRET }], tools: [{ name: SECRET }],
      imageContent: [{ data: SECRET }], metadata: { leak: SECRET }, payloadProvenance: 'public', inputSensitivityTiers: [0] };
    const authority = createRunSourceAuthority({ organizationId: 7, userId: 3, projectId: 42 });
    const result = await runWithSourceAuthority(authority, async () => {
      // The restricted source the derivative is built from, read in this run as a real read records it.
      recordCurrentRunSource({ organizationId: 7, userId: 3, projectId: 42, key: 'restricted-source', tier: 3, recheck: async () => {} });
      const derivative = await fixture.gateway.routeDerivative(malicious, fixture.pool);
      await expect(fixture.gateway.route({ taskType: 'chat', organizationId: 7, userId: 3, projectId: 42,
        inputSensitivityTiers: [1], payloadProvenance: 'public', messages: [{ role: 'user', content: derivative.content }] })).rejects.toThrow('DENY_INPUT_TIER');
      expect(fixture.sdk).toHaveBeenCalledTimes(1);
      return derivative;
    });
    expect(result.content).toBe(SOURCE_TEXT);
    expect(result.derivativeVerification).toMatchObject({ kind: 'deterministic_token_roundtrip', semanticVerified: false, resultingContentTier: 2 });
    const sent = fixture.dispatch.mock.calls[0][1];
    if (!sent || typeof sent !== 'object' || !('messages' in sent) || !Array.isArray(sent.messages)) throw new Error('SDK request was not captured');
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[1]).toMatchObject({ content: fixture.transform.payload });
    expect(sent).toMatchObject({ payloadProvenance: 'tenant_derived', inputSensitivityTiers: [1] });
    expect(sent).not.toHaveProperty('tools'); expect(sent).not.toHaveProperty('imageContent');
    const ledger = (fixture.gateway as any).auditLogger.getRecentEntries();
    expect(ledger[0]).toMatchObject({ success: true, metadata: { derivative: { originTier: 2, effectiveTier: 1 },
      inputTierPlacement: { lane: 'C_derivative' } } });
    expect(ledger[0].metadata.derivative.outboundPayloadSha256).toBe(derivativePayloadSha256(JSON.stringify(fixture.sdk.mock.calls[0][0])));
    expect(ledger[0].metadata.verifiedDerivativeGeneration).toMatchObject({ requestId: result.requestId,
      derivativeId: DERIVATIVE_ID, outputSha256: derivativePayloadSha256(SOURCE_TEXT), organizationId: 7, userId: 3, projectId: 42 });
    expect(JSON.stringify({ sent, sdk: fixture.sdk.mock.calls, ledger, logs: logSpies.info.mock.calls })).not.toContain(SECRET);
    expect(derivativeIO.bytes.toString()).not.toContain(SECRET);
  });

  it.each(['missing', 'duplicate', 'unknown', 'cached'])('withholds the complete response for a %s token or cache claim', async defect => {
    const token = fixture.transform.tokens[0].token;
    const content = defect === 'missing' ? 'No token.' : defect === 'duplicate' ? `${token} ${token}` : defect === 'cached' ? fixture.transform.payload : `${token} [[C2C_UNKNOWN_NAME_9]]`;
    fixture.dispatch.mockResolvedValue({ ...FAKE_RESPONSE, content, deterministic: false, cached: defect === 'cached' });
    await expect(fixture.gateway.routeDerivative(derivativeInput, fixture.pool)).rejects.toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect((fixture.gateway as any).auditLogger.getRecentEntries().every((row: any) => !row.success)).toBe(true);
  });

  it.each(['policy', 'approval', 'expired', 'revoked', 'foreign-tenant', 'foreign-actor', 'payload-byte', 'source-change'])('refuses %s before any provider call', async defect => {
    const input = { ...derivativeInput };
    const record = fixture.state.records[DERIVATIVE_ID];
    if (defect === 'policy') fixture.state.policy.enabled = false;
    if (defect === 'approval') record.status = 'prepared';
    if (defect === 'expired') record.expiresAt = '2026-01-01T00:00:00Z';
    if (defect === 'revoked') record.status = 'revoked';
    if (defect === 'foreign-tenant') input.organizationId = 8;
    if (defect === 'foreign-actor') input.userId = 99;
    if (defect === 'payload-byte') derivativeIO.bytes[derivativeIO.bytes.length - 2] ^= 1;
    if (defect === 'source-change') derivativeIO.source.mockImplementation(async () => ({ contentHash: 'b'.repeat(64) }));
    await fixture.save();
    await expect(fixture.gateway.routeDerivative(input, fixture.pool)).rejects.toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });

  it('rechecks custody on fallback and refuses revocation during the primary attempt', async () => {
    fixture.dispatch.mockImplementation(async () => {
      fixture.state.records[DERIVATIVE_ID].status = 'revoked'; await fixture.save();
      throw Object.assign(new Error('fixture request-shape failure'), { status: 400 });
    });
    await expect(fixture.gateway.routeDerivative(derivativeInput, fixture.pool)).rejects.toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  });

  it('refuses changed authority while a response is buffered, and releases no extra model channels', async () => {
    fixture.dispatch.mockImplementation(async () => {
      fixture.state.records[DERIVATIVE_ID].status = 'revoked'; await fixture.save();
      return { ...FAKE_RESPONSE, content: fixture.transform.payload, deterministic: false, thinking: SECRET, toolUses: [{ input: SECRET }] };
    });
    await expect(fixture.gateway.routeDerivative(derivativeInput, fixture.pool)).rejects.toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  });

  it('uses fresh ordinary placement constraints instead of a permissive resolver cache', async () => {
    setOrgPlacementResolver({ resolve: async () => ({ allowedProviders: ['openai'] }) });
    await fixture.pg.exec("UPDATE ai_placement_policies SET allowed_providers='[\"local\"]',allowed_substrates='[\"self_hosted\"]'");
    await expect(fixture.gateway.routeDerivative(derivativeInput, fixture.pool)).rejects.toBeInstanceOf(GatewayPolicyError);
    expect(fixture.dispatch).not.toHaveBeenCalled();
  });

  it('refuses a cross-process placement change between attempts', async () => {
    fixture.dispatch.mockImplementation(async () => {
      await fixture.pg.exec('UPDATE ai_placement_policies SET zero_data_retention=true');
      throw Object.assign(new Error('fixture request-shape failure'), { status: 400 });
    });
    await expect(fixture.gateway.routeDerivative(derivativeInput, fixture.pool)).rejects.toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  });

  it('rechecks current custody before a primary retry after backoff', async () => {
    vi.useFakeTimers();
    fixture.dispatch.mockImplementation(async () => {
      fixture.state.records[DERIVATIVE_ID].status = 'revoked'; await fixture.save();
      throw Object.assign(new Error('fixture transient failure'), { status: 500 });
    });
    const outcome = fixture.gateway.routeDerivative(derivativeInput, fixture.pool).catch(error => error);
    await vi.waitFor(() => expect(fixture.dispatch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await outcome).toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect(fixture.dispatch).toHaveBeenCalledTimes(1);
  });
  registerDerivativeCacheProofs(() => fixture);
});

function registerDerivativeCacheProofs(getFixture: () => Awaited<ReturnType<typeof derivativeFixture>>) {
  it('does not reuse a successful derivative after custody is revoked', async () => {
    const fixture = getFixture();
    await fixture.gateway.routeDerivative(derivativeInput, fixture.pool);
    fixture.state.records[DERIVATIVE_ID].status = 'revoked'; await fixture.save();
    await expect(fixture.gateway.routeDerivative(derivativeInput, fixture.pool)).rejects.toMatchObject({ code: 'DERIVATIVE_USE_REFUSED' });
    expect(fixture.sdk).toHaveBeenCalledTimes(1);
  });
  it('strips an ordinary caller attempt to mint reserved derivative generation evidence', async () => {
    const fixture = getFixture();
    fixture.dispatch.mockResolvedValue({ ...FAKE_RESPONSE, deterministic: false });
    await fixture.gateway.route({ taskType: 'chat', messages: [{ role: 'user', content: 'Ordinary request' }],
      metadata: { verifiedDerivativeGeneration: { outputSha256: 'forged' } } });
    expect((fixture.gateway as any).auditLogger.getRecentEntries()[0].metadata).not.toHaveProperty('verifiedDerivativeGeneration');
  });
}

const logSpies = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { AIGateway, GatewayPolicyError } from '../gateway';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { buildExplicitDerivative, derivativePayloadSha256 } from '../../observability/redaction';
import { sealTenantPayload } from '../../security/field-encryption';
import type { DerivativeGatewayRequest } from '../types';

const PII_TEXT = 'Patient email is patient@example.com';

function buildGateway(piiDetection = true, auditEnabled = false, includeAnthropic = false) {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled,
    providers: [
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
      ...(includeAnthropic ? [{ name: 'anthropic' as const, enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] }] : []),
    ],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 100,
      maxRequestsPerMinutePerUser: 30,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection,
    },
  });
}

const FAKE_RESPONSE = {
  content: 'ok',
  provider: 'openai',
  model: 'gpt-4o',
  requestId: 'fake',
  latencyMs: 1,
  cached: false,
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
};

function screenWarnCalls() {
  return logSpies.warn.mock.calls.filter(
    ([message]) => message === '[ai-gateway] sensitive-data screen'
  );
}

describe('last-mile sensitive-dispatch gate', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetOrgPlacementResolver();
    vi.restoreAllMocks();
    logSpies.info.mockClear();
    logSpies.warn.mockClear();
    logSpies.error.mockClear();
    logSpies.debug.mockClear();
  });

  it.each(['public', 'tenant_derived', 'tenant_governed'] as const)(
    'blocks Tier 3 even with PII screening off and provenance %s, and audits no content', async payloadProvenance => {
      process.env.NODE_ENV = 'development';
      process.env.AI_PII_ENFORCEMENT = 'off';
      const gateway = buildGateway(false, true);
      const dispatch = vi.spyOn(gateway as any, 'dispatchProvider');
      await expect(gateway.route({ taskType: 'chat', organizationId: 7, payloadProvenance,
        inputSensitivityTiers: [0, 3, 1], messages: [{ role: 'user', content: 'CANARY_CMC_SECRET_829' }] }))
        .rejects.toMatchObject({ name: GatewayPolicyError.name, message: expect.stringContaining('DENY_INPUT_TIER') });
      expect(dispatch).not.toHaveBeenCalled();
      const entries = (gateway as any).auditLogger.getRecentEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ error: 'DENY_INPUT_TIER',
        metadata: { inputTierPlacement: { tierMax: 3, allowed: false, provider: 'openai' } } });
      expect(JSON.stringify(entries)).not.toContain('CANARY_CMC_SECRET_829');
    },
  );

  it('retains the tier decision in the served ledger without changing legacy unclassified calls', async () => {
    process.env.NODE_ENV = 'development';
    const gateway = buildGateway(false, true);
    const dispatch = vi.spyOn(gateway as any, 'dispatchProvider').mockResolvedValue(FAKE_RESPONSE);
    await gateway.route({ taskType: 'chat', inputSensitivityTiers: [0, 1], messages: [{ role: 'user', content: 'Public workflow' }] });
    expect((gateway as any).auditLogger.getRecentEntries()[0]).toMatchObject({ success: true,
      metadata: { inputTierPlacement: { tierMax: 1, allowed: true, lane: 'B_frontier' } } });
    await gateway.route({ taskType: 'chat', messages: [{ role: 'user', content: 'Legacy workflow' }] });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('pins classifications before asynchronous tenant policy resolution', async () => {
    process.env.NODE_ENV = 'development';
    const tiers: Array<0 | 3> = [3];
    setOrgPlacementResolver({ resolve: async () => { tiers[0] = 0; return null; } });
    const gateway = buildGateway(false);
    const dispatch = vi.spyOn(gateway as any, 'dispatchProvider');
    await expect(gateway.route({ taskType: 'chat', organizationId: 7, inputSensitivityTiers: tiers,
      messages: [{ role: 'user', content: 'Restricted manufacturing procedure' }] }))
      .rejects.toThrow('DENY_INPUT_TIER');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('applies the same tier wall before embedding dispatch', async () => {
    process.env.NODE_ENV = 'development';
    const gateway = buildGateway(false);
    await expect(gateway.authorizeEmbedding({ organizationId: 7, provider: 'openai',
      texts: ['Restricted manufacturing procedure'], inputSensitivityTiers: [3] }))
      .rejects.toThrow('DENY_INPUT_TIER');
  });

  it('malformed placement approvals under enforcement is a terminal policy error, not a retried outage', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AI_PII_ENFORCEMENT = 'block';
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = '{not valid json';
    const gateway = buildGateway();
    const executeProvider = vi.spyOn(gateway as any, 'executeProvider');
    const dispatchProvider = vi.spyOn(gateway as any, 'dispatchProvider');

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('AI_PROVIDER_PLACEMENT_APPROVALS'),
    });

    // Terminal means terminal: one attempt, no retry, no fallback chain walk,
    // and no provider SDK ever invoked.
    expect(executeProvider).toHaveBeenCalledTimes(1);
    expect(dispatchProvider).not.toHaveBeenCalled();
  });

  it('audit mode records a content-free structured warning for PII-bound dispatch without blocking', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AI_PII_ENFORCEMENT; // default: audit
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    const response = await gateway.route({
      taskType: 'chat',
      messages: [{ role: 'user', content: PII_TEXT }],
    });

    expect(response.content).toBe('ok');
    expect(dispatchProvider).toHaveBeenCalledTimes(1);

    const calls = screenWarnCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const [, payload] = calls[0];
    expect(payload).toMatchObject({
      classes: ['pii'],
      provider: 'openai',
      zeroRetentionApproved: false,
      reasonCode: 'DENY_UNKNOWN_PROVIDER',
      enforcement: 'audit',
    });
    // Content-free: the structured signal never carries message content.
    expect(JSON.stringify(calls)).not.toContain('patient@example.com');
  });

  it('audit mode survives malformed approvals: records the config failure, still never blocks', async () => {
    process.env.NODE_ENV = 'development';
    process.env.AI_PII_ENFORCEMENT = 'audit';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    process.env.AI_PROVIDER_PLACEMENT_APPROVALS = '{not valid json';
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).resolves.toMatchObject({ content: 'ok' });
    expect(dispatchProvider).toHaveBeenCalledTimes(1);

    const configWarns = logSpies.warn.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' && message.includes('AI_PROVIDER_PLACEMENT_APPROVALS')
    );
    expect(configWarns.length).toBeGreaterThanOrEqual(1);
    // The screen signal is still recorded against an empty approval set.
    const calls = screenWarnCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toMatchObject({ reasonCode: 'DENY_UNKNOWN_PROVIDER' });
  });

  it('audit mode stays silent for non-sensitive content', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AI_PII_ENFORCEMENT; // default: audit
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: 'Summarize the module workflow in three sentences.' }],
      })
    ).resolves.toMatchObject({ content: 'ok' });
    expect(dispatchProvider).toHaveBeenCalledTimes(1);
    expect(screenWarnCalls()).toHaveLength(0);
  });

  it('staging with AI_SENSITIVE_DATA_POLICY_MODE=enforce blocks an unapproved sensitive dispatch', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
    delete process.env.AI_PII_ENFORCEMENT; // enforcement must come from the policy mode alone
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS; // no approvals -> unapproved provider
    const gateway = buildGateway();
    const dispatchProvider = vi.spyOn(gateway as any, 'dispatchProvider');

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_UNKNOWN_PROVIDER'),
    });
    // Enforced means enforced: no provider SDK path is ever reached.
    expect(dispatchProvider).not.toHaveBeenCalled();
  });

  it('staging without AI_SENSITIVE_DATA_POLICY_MODE=enforce or AI_PII_ENFORCEMENT=block stays audit-mode: records, never blocks', async () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PII_ENFORCEMENT; // default: audit
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    const gateway = buildGateway();
    const dispatchProvider = vi
      .spyOn(gateway as any, 'dispatchProvider')
      .mockResolvedValue(FAKE_RESPONSE);

    await expect(
      gateway.route({
        taskType: 'chat',
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).resolves.toMatchObject({ content: 'ok' });
    expect(dispatchProvider).toHaveBeenCalledTimes(1);

    const calls = screenWarnCalls();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][1]).toMatchObject({
      reasonCode: 'DENY_UNKNOWN_PROVIDER',
      enforcement: 'audit',
    });
  });

  it('production enforcement is unchanged: blocks without either opt-in variable set', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
    delete process.env.AI_PII_ENFORCEMENT;
    delete process.env.AI_PROVIDER_PLACEMENT_APPROVALS;
    // The tenant has elected OpenAI: without the election, production refuses
    // it earlier, as DENY_TENANT_POLICY (ADR-0014 §1, P1-45 —
    // production-provider-election.test.ts). This case is about the decider.
    setOrgPlacementResolver({ resolve: async () => ({ allowedProviders: ['openai'] }) });
    const gateway = buildGateway();
    const dispatchProvider = vi.spyOn(gateway as any, 'dispatchProvider');

    // A production call is always bound to a tenant (request or job scope). The
    // unbound case refuses earlier, as DENY_TENANT_POLICY, and is pinned in
    // tenant-placement-boundary.test.ts; this case is about the PII/PHI decider.
    await expect(
      gateway.route({
        taskType: 'chat',
        organizationId: 7,
        messages: [{ role: 'user', content: PII_TEXT }],
      })
    ).rejects.toMatchObject({
      name: GatewayPolicyError.name,
      message: expect.stringContaining('DENY_UNKNOWN_PROVIDER'),
    });
    expect(dispatchProvider).not.toHaveBeenCalled();
  });
});
