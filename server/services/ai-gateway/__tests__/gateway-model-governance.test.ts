/**
 * ADR-0015 §4: every model the gateway serves is an approved-models entry, at
 * every selection point and every risk level.
 *
 * Until this change the gateway checked approval only on high-risk work, and
 * there by registry id alone (`isApprovedForHighRisk(model.id)`). On every
 * other request the explicit path, strategy selection (`eligible` and
 * `relaxed`) and the fallback ladder served any enabled row. Nothing at the
 * point of selection held a row to its entry; a CI drift test kept today's
 * registry aligned, and that was all (H1 evidence, governance items a–c).
 *
 * Each case below drives the real `selectModel` / `getFallbackModels` with the
 * real registry, plus one synthetic row where the case needs a model with no
 * entry. Only the network call is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTerminalGatewayError } from '../gateway-outcome';
import { classifyGatewayError } from '../gateway-error-map';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import { APPROVED_MODELS } from '../../ai-governance/approved-models';
import { createHash } from 'node:crypto';
import { qualifiedPinFor, qualifiedPinRefusal } from '../model-governance';
import { projectQualifiedModelPins } from '../effort';
import type { GatewayRequest, GatewayResponse } from '../types';
import * as providerClients from '../providers/clients';
import { AIGateway, DEFAULT_MODELS } from '../gateway';
import {
  judgeAgainst,
  ledgerRows,
  registryOf,
  request,
  stubDispatch,
  governedGateway,
  ungovernedCopyOf,
} from './support/governed-gateway';

const ORG = 42;
const saved = { ...process.env };

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.AI_SENSITIVE_DATA_POLICY_MODE;
  delete process.env.AI_PII_ENFORCEMENT;
});
afterEach(() => {
  process.env = { ...saved };
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

/** The first-party Opus row, copied under an id and wire model no entry carries. */
function withRogue(quality: number, place: 'front' | 'back' = 'back') {
  const gw = governedGateway();
  const rogue = ungovernedCopyOf(gw, 'claude-opus-4', { id: 'rogue-opus', model: 'rogue-opus-1', qualityScore: quality });
  expect(APPROVED_MODELS.some((e) => e.id === rogue.id || e.pinnedVersion === rogue.model)).toBe(false);
  if (place === 'front') registryOf(gw).unshift(rogue);
  else registryOf(gw).push(rogue);
  return gw;
}

describe('§4a — a row that is not its own approved entry is never served', () => {
  it('strategy (eligible): quality_optimized chat does not land on it, though it ranks first', async () => {
    const gw = withRogue(100);
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', strategy: 'quality_optimized' }));
    expect(invoked).toEqual(['claude-opus-4']);
  });

  it('strategy (relaxed): with every provider unhealthy, the list-order first row is passed over', async () => {
    const gw = withRogue(50, 'front');
    for (const health of (gw as any).providerHealth.values()) health.healthy = false;
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat' }));
    expect(invoked).toHaveLength(1);
    expect(invoked[0]).not.toBe('rogue-opus');
  });

  it('fallback: the ladder passes over it when the primary fails', async () => {
    const gw = withRogue(99.5);
    const invoked = stubDispatch(gw, ['claude-opus-4']);
    await gw.route(request({ taskType: 'chat' }));
    expect(invoked).toEqual(['claude-opus-4', 'claude-opus-5']);
  });

  it('explicit: naming it is refused with a terminal error — not served, not substituted', async () => {
    const gw = withRogue(50);
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', model: 'rogue-opus' })).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'MODEL_NOT_GOVERNED', reason: 'no-entry' });
    expect(err.message).toContain('rogue-opus');
    expect(isTerminalGatewayError(err)).toBe(true);
    expect(invoked).toEqual([]);
  });

  it('high risk: a row drifted off its pinned version under an approved id is not served', async () => {
    const gw = governedGateway();
    const flagship = registryOf(gw).find((m) => m.id === 'claude-opus-4')!;
    flagship.model = 'claude-opus-5-5-drifted';
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'document_drafting' }));
    expect(invoked).toEqual(['claude-opus-5']);
  });

  it('the refusal leaves one ledger row naming what was withheld, and the author reads why', async () => {
    const gw = withRogue(50);
    stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', model: 'rogue-opus', organizationId: ORG })).catch((e) => e);
    const rows = ledgerRows(gw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'none',
      success: false,
      error: 'MODEL_NOT_GOVERNED',
      organizationId: ORG,
      metadata: { modelGovernance: { code: 'MODEL_NOT_GOVERNED', reason: 'no-entry', withheldModelIds: ['rogue-opus'] } },
    });
    expect(classifyGatewayError(err).message).toMatch(/not an approved model/);
  });
});

describe('§4b — an explicit model that names no registry row is refused, not substituted', () => {
  it('is refused with a terminal error naming the value; nothing is dispatched, retried or fallen back to', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', model: 'gpt-5-imaginary' })).catch((e) => e);
    expect(err).toMatchObject({ name: 'GatewayPolicyError', code: 'MODEL_NOT_GOVERNED', reason: 'unknown-model' });
    expect(err.message).toContain('"gpt-5-imaginary"');
    expect(isTerminalGatewayError(err)).toBe(true);
    expect(invoked).toEqual([]);
    expect(ledgerRows(gw)).toEqual([
      expect.objectContaining({
        error: 'MODEL_NOT_GOVERNED',
        metadata: expect.objectContaining({
          modelGovernance: expect.objectContaining({ reason: 'unknown-model', requestedModel: 'gpt-5-imaginary' }),
        }),
      }),
    ]);
  });

  it('a model named under a provider that has no such row names no row', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', provider: 'openai', model: 'claude-opus-4' })).catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'unknown-model' });
    expect(err.message).toContain('"openai/claude-opus-4"');
    expect(invoked).toEqual([]);
  });

  it('control: a known row whose provider is not configured still falls through to strategy, as before', async () => {
    const gw = governedGateway({ providers: ['anthropic'] });
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', model: 'gpt-4o' }));
    expect(invoked).toEqual(['claude-opus-4']);
  });
});

describe('§4c — local-default pins a placeholder, so production does not select it', () => {
  function inProduction(policy: Record<string, unknown> | null = null) {
    process.env.NODE_ENV = 'production';
    setOrgPlacementResolver({ resolve: async () => policy as never });
  }

  it('explicit: refused in production, naming it', async () => {
    inProduction();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw
      .route(request({ taskType: 'chat', model: 'local-default', organizationId: ORG }))
      .catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'nominal-pin', withheldModelIds: ['local-default'] });
    expect(invoked).toEqual([]);
  });

  it('strategy: cost_optimized chat (local-default costs nothing) is not served by it in production', async () => {
    inProduction();
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', strategy: 'cost_optimized', organizationId: ORG }));
    expect(invoked).toHaveLength(1);
    expect(invoked[0]).not.toBe('local-default');
  });

  it('strategy: a tenant allowed only its own models is refused in production, not served a placeholder', async () => {
    inProduction({ allowedSubstrates: ['self_hosted'] });
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    const err = await gw.route(request({ taskType: 'chat', organizationId: ORG })).catch((e) => e);
    expect(err).toMatchObject({ code: 'MODEL_NOT_GOVERNED', reason: 'nominal-pin', withheldModelIds: ['local-default'] });
    expect(invoked).toEqual([]);
  });

  it('fallback: it is not on the production ladder', async () => {
    inProduction();
    const gw = governedGateway({ providers: ['openai', 'local'] });
    const invoked = stubDispatch(gw, ['gpt-4o', 'gpt-4o-mini']);
    await expect(gw.route(request({ taskType: 'chat', organizationId: ORG }))).rejects.toThrow();
    expect(invoked).not.toContain('local-default');
  });

  it('control: outside production it is served as before', async () => {
    const gw = governedGateway();
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', model: 'local-default' }));
    expect(invoked).toEqual(['local-default']);
  });

  it('control: a local entry that pins a weights digest is selectable in production', async () => {
    inProduction();
    const digest = `sha256:${'a'.repeat(64)}`;
    const gw = governedGateway();
    judgeAgainst(gw, APPROVED_MODELS.map((e) => (e.id === 'local-default' ? { ...e, pinnedVersion: digest } : e)));
    registryOf(gw).find((m) => m.id === 'local-default')!.model = digest;
    const invoked = stubDispatch(gw);
    await gw.route(request({ taskType: 'chat', model: 'local-default', organizationId: ORG }));
    expect(invoked).toEqual(['local-default']);
  });
});

/** Synthetic approved protocol/evidence injected only in tests; no production qualification is asserted. */
function qualifiedFixture(local = false) {
  const gw = governedGateway();
  const base = APPROVED_MODELS.find(e => e.id === (local ? 'local-default' : 'claude-opus-4'))!;
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  const version = local ? `weights@sha256:${'a'.repeat(64)}` : 'claude-opus-5-5-20261101';
  const protocolText = JSON.stringify({ protocolId: 'UNIT-PQ', version: '1', status: 'approved', approvedBy: 'Test fixture owner',
    approvedOn: '2026-11-01', components: { generation: { required: true, executable: true,
      criteria: { minSectionCoverage: 1, maxForbiddenHits: 0, minTasksPerDocType: 1 }, criteriaSource: 'Unit fixture' } } });
  const docBankText = JSON.stringify({ version: 'unit', tasks: [{ id: 'one', docType: 'ind', taskType: 'generation', input: 'Fixture input' }] });
  const record = { kind: 'pq-record', modelId: base.id, provider: base.provider, pinnedVersion: version, intendedUses: ['document_drafting'],
    protocolId: 'UNIT-PQ', protocolVersion: '1', protocolStatus: 'approved', protocolSha256: sha(protocolText),
    goldBankVersion: 'unit', goldBankSha256: sha(docBankText), verdict: 'PASS',
    generation: [{ taskId: 'one', docType: 'ind', servedModel: version, servedProvider: base.provider,
      servedModelVerified: true, finishReason: 'stop', cached: false, deterministic: false, sectionCoverage: 1, forbiddenHits: 0 }] };
  let recordText = JSON.stringify(record);
  const entry = { ...base, pinnedVersion: version, approvedForHighRisk: true,
    pq: { status: 'passed' as const, reference: 'docs/evidence/PQ/unit-only.json', recordSha256: sha(recordText),
      intendedUses: ['document_drafting'] as const, pinKind: local ? 'weights_sha256' as const : 'provider_snapshot' as const } };
  const entries = APPROVED_MODELS.map(e => e.id === base.id ? entry : e);
  judgeAgainst(gw, entries);
  const row = registryOf(gw).find(m => m.id === base.id)!;
  row.model = version;
  if (local) row.capabilities = [...row.capabilities, 'document_drafting']; // Synthetic qualification fixture only.
  const reader = vi.fn(() => ({ recordText, canonicalEvidence: { protocolText, docBankText, ragGoldText: '{}', corpusManifestText: '{}' } }));
  (gw as unknown as { qualifiedPinEvidenceReader: typeof reader }).qualifiedPinEvidenceReader = reader;
  const pin = qualifiedPinFor(entry, 'document_drafting');
  const route = (extra: Partial<GatewayRequest> = {}) => gw.route(request({ taskType: 'document_drafting', qualifiedModelPin: pin, ...extra }));
  const dispatch = vi.spyOn(gw as unknown as { executeProvider: () => Promise<GatewayResponse> }, 'executeProvider').mockImplementation(async () => ({
    content: 'CANARY_QUALIFIED_OUTPUT', provider: base.provider, model: version, resolvedModel: version,
    requestId: 'unit-response', latencyMs: 1, cached: false, deterministic: false,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
  }));
  return { gw, entry, entries, pin, route, dispatch, reader, record, changeRecord: (text: string) => { recordText = text; } };
}

describe('exact qualified model pins', () => {
  it.each([false, true])('serves verified evidence and exact provider version (local=%s)', async local => {
    const f = qualifiedFixture(local);
    expect(qualifiedPinRefusal({ taskType: 'document_drafting', qualifiedModelPin: f.pin }, f.entries, f.reader)).toBeNull();
    await expect(f.route()).resolves.toMatchObject({ content: 'CANARY_QUALIFIED_OUTPUT', resolvedModel: f.pin.pinnedVersion });
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(ledgerRows(f.gw)[0]).toMatchObject({ success: true, resolvedModel: f.pin.pinnedVersion,
      metadata: { qualifiedModelPin: f.pin } });
  });

  it.each(['id', 'provider', 'pinnedVersion', 'intendedUse', 'pqReference', 'pqSha256'] as const)('refuses altered %s before reading any caller path or dispatching', async field => {
    const f = qualifiedFixture();
    const pin = { ...f.pin, [field]: field === 'pqReference' ? '/etc/passwd' : 'tampered' };
    await expect(f.route({ qualifiedModelPin: pin as never })).rejects.toMatchObject({ code: 'QUALIFIED_MODEL_PIN_REFUSED' });
    expect(f.reader).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it.each([null, {}, { id: 'only-id' }])('refuses malformed pin %j without a default', async pin => {
    const f = qualifiedFixture();
    await expect(f.route({ qualifiedModelPin: pin as never })).rejects.toMatchObject({ reason: 'invalid-pin' });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'drifted', 'wrong-task'])('does not substitute for an %s pin', async kind => {
    const f = qualifiedFixture();
    const row = registryOf(f.gw).find(m => m.id === f.pin.id)!;
    if (kind === 'disabled') row.enabled = false;
    if (kind === 'drifted') row.model = 'different-model';
    if (kind === 'wrong-task') row.capabilities = ['chat'];
    await expect(f.route()).rejects.toMatchObject({ reason: 'unavailable' });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('does not fall back to any other qualified or unqualified model after a provider failure', async () => {
    const f = qualifiedFixture();
    f.dispatch.mockRejectedValue(Object.assign(new Error('simulated'), { status: 400 }));
    await expect(f.route()).rejects.toThrow();
    expect(f.dispatch).toHaveBeenCalledOnce();
  });

  it.each([{ resolvedModel: undefined }, { resolvedModel: 'different-version' }, { provider: 'openai' },
    { cached: true }, { deterministic: true }] as Partial<GatewayResponse>[])('withholds a response that cannot prove the serving pin: %j', async patch => {
    const f = qualifiedFixture();
    const response = await f.dispatch.getMockImplementation()!();
    f.dispatch.mockResolvedValue({ ...response, ...patch });
    const error = await f.route().catch(e => e);
    expect(error).toMatchObject({ code: 'QUALIFIED_MODEL_PIN_REFUSED', reason: 'served-mismatch' });
    expect(isTerminalGatewayError(error)).toBe(true);
    expect(classifyGatewayError(error).code).toBe('MODEL_NOT_QUALIFIED');
    expect(ledgerRows(f.gw)).toHaveLength(1);
    expect(ledgerRows(f.gw)[0]).toMatchObject({ success: false, resolvedModel: 'resolvedModel' in patch ? patch.resolvedModel : response.resolvedModel,
      provider: patch.provider ?? response.provider });
    expect(JSON.stringify(ledgerRows(f.gw))).not.toContain('CANARY_QUALIFIED_OUTPUT');
  });

});

describe('qualified model pin transport and evidence', () => {
  it.each([{ stream: true }, { onStream: vi.fn() }])('refuses streaming before dispatch', async extra => {
    const f = qualifiedFixture();
    await expect(f.route(extra)).rejects.toMatchObject({ reason: 'streaming' });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('refuses deterministic fixture text even outside production', async () => {
    const f = qualifiedFixture();
    f.gw.setDeterministicMode(true);
    await expect(f.route()).rejects.toMatchObject({ reason: 'deterministic' });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('rejects changed evidence bytes, even if the file still claims PASS', async () => {
    const f = qualifiedFixture();
    f.changeRecord(JSON.stringify({ ...f.record, changed: true }));
    await expect(f.route()).rejects.toMatchObject({ reason: 'evidence-mismatch' });
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('rechecks evidence after an awaited source checkpoint, before the real dispatch boundary', async () => {
    const f = qualifiedFixture();
    f.dispatch.mockRestore();
    const dispatch = vi.spyOn(f.gw as unknown as { dispatchProvider: () => Promise<GatewayResponse> }, 'dispatchProvider');
    await expect(f.route({ beforeDispatch: async () => { f.changeRecord('{}'); } })).rejects.toMatchObject({ reason: 'evidence-mismatch' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(ledgerRows(f.gw)).toHaveLength(1);
  });

  it('captures the caller pin before any await so later mutation cannot change the version', async () => {
    const f = qualifiedFixture();
    const original = { ...f.pin };
    vi.spyOn(f.gw as unknown as { applyOrgPlacementDefaults: (raw: GatewayRequest) => Promise<GatewayRequest> }, 'applyOrgPlacementDefaults').mockImplementation(async (raw: GatewayRequest) => {
      f.pin.pinnedVersion = 'mutated-during-await';
      return raw;
    });
    await expect(f.route()).resolves.toMatchObject({ resolvedModel: original.pinnedVersion });
    expect(ledgerRows(f.gw)[0].metadata.qualifiedModelPin).toEqual(original);
  });

  it('never accepts a header-only PASS or an unreviewed alias', () => {
    const f = qualifiedFixture();
    const alias = { ...f.entry, pinnedVersion: 'gpt-4o' };
    expect(qualifiedPinRefusal({ taskType: 'document_drafting', qualifiedModelPin: qualifiedPinFor(alias, 'document_drafting') }, [alias], f.reader)).toBe('mutable-version');
    const headerText = JSON.stringify({ ...f.record, generation: [] });
    const entry = { ...f.entry, pq: { ...f.entry.pq, recordSha256: createHash('sha256').update(headerText).digest('hex') } };
    const reader = () => ({ ...f.reader(), recordText: headerText });
    expect(qualifiedPinRefusal({ taskType: 'document_drafting', qualifiedModelPin: qualifiedPinFor(entry, 'document_drafting') }, [entry], reader)).toBe('evidence-invalid');
  });

  it('lists verified qualified pins, while the real pending registry offers none', () => {
    const f = qualifiedFixture();
    expect(projectQualifiedModelPins(registryOf(f.gw), 'document_drafting', f.entries, f.reader).qualifiedModelPins).toEqual([f.pin]);
    const actual = projectQualifiedModelPins(registryOf(f.gw));
    expect(actual.qualifiedModelPins).toEqual([]);
    expect(actual.qualificationUnavailable.every(item => item.pqStatus === 'pending')).toBe(true);
  });
});

describe('tenant-owned model availability and SDK dispatch', () => {
  function tenantClients() {
    const availability = vi.spyOn(providerClients, 'resolveTenantModelCredentialAvailability').mockImplementation(async org => ({
      mode: 'customer_owned', providers: org === 101 ? ['anthropic'] : ['openai'],
    }));
    const calls: Array<{ provider: string; organizationId: number }> = [];
    const factory = vi.spyOn(providerClients, 'createTenantProviderClient').mockImplementation(async (provider, organizationId) => {
      calls.push({ provider, organizationId });
      return provider === 'anthropic' ? { messages: { create: async (params: { model: string }) => ({
        model: params.model, content: [{ type: 'text', text: `Organization ${organizationId}` }], stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }) } } : { chat: { completions: { create: async (params: { model: string }) => ({
        model: params.model, choices: [{ message: { content: `Organization ${organizationId}` }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }) } } };
    });
    return { availability, calls, factory };
  }

  it('enables existing rows separately for two tenants without global keys or global registry mutation', async () => {
    const gw = governedGateway({ providers: [] });
    const f = tenantClients();
    const before = registryOf(gw).map(row => row.enabled);
    const [a, b] = await Promise.all([
      gw.route(request({ taskType: 'chat', provider: 'anthropic', model: 'claude-opus-4', organizationId: 101 })),
      gw.route(request({ taskType: 'chat', provider: 'openai', model: 'gpt-4o', organizationId: 202 })),
    ]);
    expect([a.content, b.content]).toEqual(['Organization 101', 'Organization 202']);
    expect(f.calls).toEqual(expect.arrayContaining([{ provider: 'anthropic', organizationId: 101 }, { provider: 'openai', organizationId: 202 }]));
    expect(registryOf(gw).map(row => row.enabled)).toEqual(before);
    expect((await gw.getModelsForOrganization(101)).filter(row => row.enabled).every(row => row.provider === 'anthropic')).toBe(true);
    expect((await gw.getModelsForOrganization(202)).filter(row => row.enabled).every(row => row.provider === 'openai')).toBe(true);
    expect(JSON.stringify(ledgerRows(gw))).not.toMatch(/apiKey|credentialAuthorityToken/);
  });

  it('refuses revoked cards without using an enabled platform key or silently substituting another model', async () => {
    const gw = governedGateway();
    const f = tenantClients();
    f.availability.mockResolvedValue({ mode: 'customer_owned', providers: [] });
    const dispatch = stubDispatch(gw);
    const error = await gw.route(request({ taskType: 'chat', model: 'claude-opus-4', organizationId: 101 })).catch(e => e);
    expect(error).toMatchObject({ code: 'TENANT_CREDENTIAL_UNAVAILABLE' });
    expect(isTerminalGatewayError(error)).toBe(true);
    expect(dispatch).toEqual([]);
    expect(f.factory).not.toHaveBeenCalled();
    expect(ledgerRows(gw)).toHaveLength(1);
  });

  it('preserves explicitly disabled providers and canonically disabled rows even with an active tenant key', async () => {
    tenantClients();
    const disabledProvider = new AIGateway({ auditEnabled: false, providers: [{ name: 'anthropic', enabled: false,
      apiKey: 'not-used', defaultModel: 'not-used', models: [] }] });
    expect((await disabledProvider.getModelsForOrganization(101)).filter(row => row.provider === 'anthropic').every(row => !row.enabled)).toBe(true);
    const canonical = DEFAULT_MODELS.find(row => row.id === 'claude-opus-4')!;
    const previous = canonical.enabled;
    let disabledRow: AIGateway;
    try { canonical.enabled = false; disabledRow = governedGateway({ providers: [] }); }
    finally { canonical.enabled = previous; }
    expect((await disabledRow.getModelsForOrganization(101)).find(row => row.id === canonical.id)?.enabled).toBe(false);
  });

  it('contains a credential revoked after selection at the fresh SDK boundary, without platform fallback', async () => {
    const gw = governedGateway();
    const f = tenantClients();
    f.factory.mockRejectedValue(new providerClients.TenantCredentialUnavailableError());
    const platform = vi.fn();
    (gw as unknown as { anthropicClient: unknown }).anthropicClient = { messages: { create: platform } };
    await expect(gw.route(request({ taskType: 'chat', model: 'claude-opus-4', organizationId: 101 }))).rejects.toMatchObject({ code: 'TENANT_CREDENTIAL_UNAVAILABLE' });
    expect(f.factory).toHaveBeenCalledOnce();
    expect(platform).not.toHaveBeenCalled();
    expect(ledgerRows(gw)).toHaveLength(1);
  });

  it('refuses a supplied invalid actor instead of interpreting it as background work', async () => {
    const gw = governedGateway({ providers: [] });
    const f = tenantClients();
    await expect(gw.route(request({ taskType: 'chat', model: 'claude-opus-4', organizationId: 101, userId: 'invalid-actor' }))).rejects.toMatchObject({ code: 'TENANT_CREDENTIAL_UNAVAILABLE' });
    expect(f.factory).not.toHaveBeenCalled();
  });

  it('keeps arbitrary SDK error text out of the final error and failure ledger', async () => {
    const gw = governedGateway({ providers: ['openai'] });
    const canary = 'opaqueCustomerCredentialCANARY_334455';
    vi.spyOn(gw as unknown as { executeProvider: () => Promise<GatewayResponse> }, 'executeProvider').mockRejectedValue(Object.assign(new Error(`provider echoed ${canary}`), { status: 400 }));
    const error = await gw.route(request({ taskType: 'chat' })).catch(e => e);
    expect(error.message).not.toContain(canary);
    expect(JSON.stringify(ledgerRows(gw))).not.toContain(canary);
    expect(error.message).toContain('HTTP 400');
  });
});
