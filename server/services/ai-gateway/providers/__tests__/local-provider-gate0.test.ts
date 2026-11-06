/**
 * LocalAI on-prem inference — Gate 0 OQ smoke test.
 *
 * Operational Qualification for the *generation lane* of the air-gapped /
 * on-prem inference capability (see LOCALAI_ONPREM_INFERENCE_PILOT_PLAN). This
 * is the runnable, CI-safe portion of OQ — it needs no live model server. It
 * qualifies two invariants that must hold before any residency-constrained
 * paying client is served on-prem:
 *
 *   1. No accidental activation — the local generation client only exists when
 *      an operator explicitly configures a base URL. A missing config must
 *      yield `null` (the gateway then simply has no local provider), never a
 *      half-wired client pointed at a default.
 *   2. Correct residency/ZDR routing — the `local` substrate is the only one
 *      that satisfies an on-prem / zero-data-retention requirement, and shared
 *      frontier providers are excluded from it. This is what guarantees a
 *      tenant who "cannot send data to any third party" is routed to on-prem
 *      inference and never silently falls back to a frontier API.
 *
 * The live-server parts of OQ (air-gap egress capture, audit-trail row per
 * call, PII-screen enforcement) run against a deployed endpoint and are tracked
 * in the pilot plan's OQ checklist, not here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const factory = vi.hoisted(() => ({
  openai: [] as Array<Record<string, unknown>>,
  anthropic: [] as Array<Record<string, unknown>>,
  sdkCreate: vi.fn(), availability: vi.fn(), capture: vi.fn(), current: vi.fn(),
}));
vi.mock('openai', () => ({ default: class {
  chat; embeddings;
  constructor(options: Record<string, unknown>) {
    factory.openai.push(options);
    this.chat = { completions: { create: (...args: unknown[]) => factory.sdkCreate('chat', options, args) } };
    this.embeddings = { create: (...args: unknown[]) => factory.sdkCreate('embedding', options, args) };
  }
} }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  messages; beta;
  constructor(options: Record<string, unknown>) {
    factory.anthropic.push(options);
    this.messages = { create: (...args: unknown[]) => factory.sdkCreate('messages', options, args) };
    this.beta = { messages: { create: (...args: unknown[]) => factory.sdkCreate('beta.messages', options, args) } };
  }
} }));
vi.mock('../../../connectors/connector-registry.js', () => ({
  resolveTenantModelCredentialAvailability: factory.availability,
  captureCredentialForUse: factory.capture,
  assertCredentialUseCurrent: factory.current,
}));

import { createLocalClient, createTenantProviderClient, TenantCredentialUnavailableError } from '../clients';
import {
  resolvePlacement,
  resetPlacementRegistry,
  isPlacementCompliant,
  buildPlacementRegistry,
} from '../placement';

const LOCAL_ENV_KEYS = [
  'LOCAL_AI_BASE_URL',
  'LITELLM_BASE_URL',
  'LOCAL_AI_API_KEY',
  'LITELLM_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'MOONSHOT_API_KEY',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of LOCAL_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetPlacementRegistry();
  vi.clearAllMocks();
  factory.openai.length = 0;
  factory.anthropic.length = 0;
  factory.availability.mockReset().mockResolvedValue({ mode: 'customer_owned', providers: ['openai', 'anthropic', 'moonshot'] });
  factory.capture.mockReset().mockImplementation(async (org, connector, purpose) => ({
    credentials: { apiKey: `CANARY-${org}-${connector}-${purpose}` },
  }));
  factory.current.mockReset().mockResolvedValue(undefined);
  factory.sdkCreate.mockReset().mockResolvedValue({ content: 'fixture response' });
});

afterEach(() => {
  for (const k of LOCAL_ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetPlacementRegistry();
});

describe('Gate 0 — local generation client activation', () => {
  it('returns null when no local base URL is configured (no accidental activation)', () => {
    expect(createLocalClient()).toBeNull();
  });

  it('returns a client when LOCAL_AI_BASE_URL is set', () => {
    process.env.LOCAL_AI_BASE_URL = 'http://vllm:8000/v1';
    const client = createLocalClient();
    expect(client).toBeTruthy();
    // OpenAI-compatible surface the gateway's executeOpenAI path relies on.
    expect(typeof client.chat?.completions?.create).toBe('function');
  });

  it('falls back to LITELLM_BASE_URL when LOCAL_AI_BASE_URL is absent', () => {
    process.env.LITELLM_BASE_URL = 'http://litellm:4000';
    expect(createLocalClient()).toBeTruthy();
  });
});

describe('Gate 0 — on-prem / ZDR residency routing', () => {
  it('classifies the local substrate as self-hosted, on-prem, zero-retention', () => {
    const local = resolvePlacement('local');
    expect(local.substrate).toBe('self_hosted');
    expect(local.regions).toEqual(['on_prem']);
    expect(local.zeroDataRetention).toBe(true);
  });

  it('routes an on-prem-residency requirement ONLY to the local substrate', () => {
    const reg = buildPlacementRegistry();
    expect(isPlacementCompliant(reg.local, { residency: 'on_prem' })).toBe(true);
    // Every frontier substrate must be excluded — no silent fallback off-prem.
    expect(isPlacementCompliant(reg.openai, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.anthropic, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.bedrock, { residency: 'on_prem' })).toBe(false);
    expect(isPlacementCompliant(reg.azure, { residency: 'on_prem' })).toBe(false);
  });

  it('satisfies a zero-data-retention requirement while shared frontier does not', () => {
    const reg = buildPlacementRegistry();
    expect(isPlacementCompliant(reg.local, { zeroDataRetention: true })).toBe(true);
    expect(isPlacementCompliant(reg.openai, { zeroDataRetention: true })).toBe(false);
  });
});

describe('customer-owned SDK clients at the deterministic credential boundary', () => {
  it('creates fresh OpenAI clients for each tenant and request without a platform API key', async () => {
    const first = await createTenantProviderClient('openai', 7, 3);
    const second = await createTenantProviderClient('openai', 8, 4);
    const again = await createTenantProviderClient('openai', 7, 3);
    expect(process.env.OPENAI_API_KEY).toBeUndefined();
    expect(first).not.toBe(second);
    expect(first).not.toBe(again);
    expect(factory.openai).toEqual([
      { apiKey: 'CANARY-7-llm_openai-model_inference', maxRetries: 0 },
      { apiKey: 'CANARY-8-llm_openai-model_inference', maxRetries: 0 },
      { apiKey: 'CANARY-7-llm_openai-model_inference', maxRetries: 0 },
    ]);
    await first.chat.completions.create({ model: 'fixture', messages: [] });
    await second.chat.completions.create({ model: 'fixture', messages: [] });
    expect(factory.current.mock.calls.map(([, user]) => user)).toEqual([3, 4]);
    expect(factory.sdkCreate.mock.calls.map(([, options]) => options.apiKey)).toEqual([
      'CANARY-7-llm_openai-model_inference', 'CANARY-8-llm_openai-model_inference',
    ]);
    expect(JSON.stringify([first, second, again])).not.toContain('CANARY');
  });

  it('uses fresh Anthropic regular and beta message clients with the tenant key and no retries', async () => {
    const first = await createTenantProviderClient('anthropic', 7, 3);
    const second = await createTenantProviderClient('anthropic', 8, 4);
    await first.messages.create({ model: 'fixture' });
    await second.beta.messages.create({ model: 'fixture' });
    expect(factory.anthropic).toEqual([
      { apiKey: 'CANARY-7-llm_anthropic-model_inference', maxRetries: 0 },
      { apiKey: 'CANARY-8-llm_anthropic-model_inference', maxRetries: 0 },
    ]);
    expect(factory.sdkCreate.mock.calls.map(([surface, options]) => [surface, options.apiKey])).toEqual([
      ['messages', 'CANARY-7-llm_anthropic-model_inference'], ['beta.messages', 'CANARY-8-llm_anthropic-model_inference'],
    ]);
    expect(factory.current).toHaveBeenCalledTimes(2);
  });

  it('pins Moonshot to its fixed endpoint and keeps tenant keys separate from a configured platform key', async () => {
    process.env.MOONSHOT_API_KEY = 'PLATFORM-CANARY';
    const first = await createTenantProviderClient('moonshot', 7, 3);
    const second = await createTenantProviderClient('moonshot', 8, 4);
    await first.chat.completions.create({ model: 'fixture' });
    await second.chat.completions.create({ model: 'fixture' });
    expect(factory.openai).toEqual([
      { apiKey: 'CANARY-7-llm_moonshot-model_inference', maxRetries: 0, baseURL: 'https://api.moonshot.ai/v1' },
      { apiKey: 'CANARY-8-llm_moonshot-model_inference', maxRetries: 0, baseURL: 'https://api.moonshot.ai/v1' },
    ]);
    expect(factory.sdkCreate.mock.calls.map(([, options]) => options.apiKey)).not.toContain('PLATFORM-CANARY');
  });

  it.each(['revoked', 'expired', 'rotated', 'audit unavailable'])('rejects a captured grant that is %s before any SDK create', async reason => {
    const client = await createTenantProviderClient('openai', 7, 3);
    factory.current.mockRejectedValue(new Error(`${reason}: CANARY-PRIVATE-GRANT`));
    const error = await client.chat.completions.create({ model: 'fixture' }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(TenantCredentialUnavailableError);
    expect(error.message).toBe('The organization’s own model credential grant is unavailable or no longer authorizes this request. Nothing was sent.');
    expect(JSON.stringify(error)).not.toContain('CANARY');
    expect(factory.sdkCreate).not.toHaveBeenCalled();
  });

  it('rechecks the captured revision on every create, including reuse of the same client', async () => {
    const client = await createTenantProviderClient('openai', 7, 3);
    await client.chat.completions.create({ model: 'fixture' });
    factory.current.mockRejectedValue(new Error('CANARY-REVOKED-BETWEEN-CALLS'));
    await expect(client.chat.completions.create({ model: 'fixture' })).rejects.toBeInstanceOf(TenantCredentialUnavailableError);
    expect(factory.current).toHaveBeenCalledTimes(2);
    expect(factory.sdkCreate).toHaveBeenCalledTimes(1);
    expect(factory.capture).toHaveBeenCalledTimes(1);
  });

  it('runs final qualification after the awaited credential check and preserves a policy refusal before SDK dispatch', async () => {
    const policyError = Object.assign(new Error('Qualification was revoked'), { name: 'GatewayPolicyError' });
    let credentialAuditCompleted = false;
    factory.current.mockImplementationOnce(async () => { await Promise.resolve(); credentialAuditCompleted = true; });
    const beforeCreate = vi.fn(() => {
      expect(credentialAuditCompleted).toBe(true);
      throw policyError;
    });
    const client = await createTenantProviderClient('openai', 7, 3, 'model_inference', beforeCreate);
    const failure = await client.chat.completions.create({ model: 'fixture' }).catch((error: unknown) => error);
    expect(failure).toBe(policyError);
    expect(beforeCreate).toHaveBeenCalledTimes(1);
    expect(factory.sdkCreate).not.toHaveBeenCalled();
  });

  it('never falls back to a platform key when tenant availability or capture fails', async () => {
    process.env.OPENAI_API_KEY = 'PLATFORM-CANARY';
    factory.availability.mockResolvedValueOnce({ mode: 'customer_owned', providers: [] });
    await expect(createTenantProviderClient('openai', 7, 3)).rejects.toBeInstanceOf(TenantCredentialUnavailableError);
    factory.capture.mockRejectedValueOnce(new Error('CANARY-CAPTURE-FAILURE'));
    await expect(createTenantProviderClient('openai', 7, 3)).rejects.toBeInstanceOf(TenantCredentialUnavailableError);
    factory.availability.mockRejectedValueOnce(new Error('CANARY-STORE-FAILURE'));
    await expect(createTenantProviderClient('openai', 7, 3)).rejects.toBeInstanceOf(TenantCredentialUnavailableError);
    expect(factory.openai).toEqual([]);
    expect(factory.sdkCreate).not.toHaveBeenCalled();
  });

  it('returns null only for an explicitly platform-owned credential mode', async () => {
    factory.availability.mockResolvedValue({ mode: 'platform', providers: [] });
    expect(await createTenantProviderClient('openai', 7, 3)).toBeNull();
    expect(factory.capture).not.toHaveBeenCalled();
    expect(factory.openai).toEqual([]);
  });
});

describe('customer-owned SDK failures and embedding authority', () => {
  it.each([429, 503])('strips arbitrary SDK errors, headers and causes while retaining HTTP %s', async status => {
    const client = await createTenantProviderClient('openai', 7, 3);
    factory.sdkCreate.mockRejectedValue(Object.assign(new Error('CANARY-SDK-ERROR'), {
      status, headers: { authorization: 'CANARY-HEADER' }, cause: new Error('CANARY-CAUSE'), response: 'CANARY-BODY',
    }));
    const error = await client.chat.completions.create({ model: 'fixture' }).catch((failure: unknown) => failure);
    expect(error.message).toBe(`The customer-owned model request failed (HTTP ${status}).`);
    expect(error.status).toBe(status);
    expect(error.cause).toBeUndefined();
    expect(error.headers).toBeUndefined();
    expect(error.response).toBeUndefined();
    expect(`${error.stack}${JSON.stringify(error)}`).not.toContain('CANARY');
  });

  it('drops malformed status fields and preserves direct cancellation without retaining SDK details', async () => {
    const client = await createTenantProviderClient('openai', 7, 3);
    factory.sdkCreate.mockRejectedValue(Object.assign(new Error('CANARY-ABORT'), {
      name: 'AbortError', status: 'CANARY-STATUS', cause: 'CANARY-CAUSE', headers: { authorization: 'CANARY-HEADER' },
    }));
    const error = await client.chat.completions.create({ model: 'fixture' }).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ name: 'AbortError', message: 'The customer-owned model request failed.' });
    expect(error.status).toBeUndefined();
    expect(`${error.stack}${JSON.stringify(error)}`).not.toContain('CANARY');
  });

  it('sanitizes async iterator failures and retains AbortError identity for cancellation', async () => {
    const client = await createTenantProviderClient('anthropic', 7, 3);
    const controller = new AbortController();
    factory.sdkCreate.mockResolvedValue({ controller,
      async *[Symbol.asyncIterator]() {
        yield { type: 'text', text: 'safe fixture event' };
        throw Object.assign(new Error('CANARY-STREAM-ERROR'), { name: 'AbortError', status: 499, cause: 'CANARY-CAUSE' });
      },
    });
    const stream = await client.beta.messages.create({ model: 'fixture', stream: true });
    expect(stream.controller).toBe(controller);
    const events: unknown[] = [];
    let failure: unknown;
    try { for await (const event of stream) events.push(event); } catch (error) { failure = error; }
    expect(events).toEqual([{ type: 'text', text: 'safe fixture event' }]);
    expect(failure).toMatchObject({ name: 'AbortError', status: 499, message: 'The customer-owned model request failed (HTTP 499).' });
    expect(`${String(failure)}${JSON.stringify(failure)}`).not.toContain('CANARY');
    expect(factory.current).toHaveBeenCalledTimes(1);
  });

  it('uses the embedding grant purpose and exact captured authority for OpenAI embeddings', async () => {
    const client = await createTenantProviderClient('openai', 7, 3, 'embedding');
    const input = { model: 'text-embedding-fixture', input: ['fixture sentence'] };
    await client.embeddings.create(input);
    expect(factory.availability).toHaveBeenCalledWith(7, undefined, 'embedding');
    expect(factory.capture).toHaveBeenCalledWith(7, 'llm_openai', 'embedding');
    expect(factory.current).toHaveBeenCalledWith(await factory.capture.mock.results[0].value, 3);
    expect(factory.sdkCreate).toHaveBeenCalledWith('embedding', { apiKey: 'CANARY-7-llm_openai-embedding', maxRetries: 0 }, [input]);
  });
});
