import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, DEFAULT_MODELS, GatewayAllProvidersFailedError, resetGateway } from '../gateway';
import type { GatewayConfig } from '../types';
import { createAzureClient, createLocalClient } from '../providers/clients';

const temporaryFailure = (status: number) => new Response(
  JSON.stringify({ error: { type: 'api_error', message: `Simulated upstream ${status}` } }),
  { status, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } },
);

/** Real SDK clients and real gateway retry loops; fetch never leaves the process. */
function gateway() {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: [
      { name: 'openai', enabled: true, apiKey: 'test-not-sent', defaultModel: 'gpt-4o', models: [] },
      { name: 'anthropic', enabled: true, apiKey: 'test-not-sent', defaultModel: 'claude-sonnet-5', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  } as Partial<GatewayConfig>);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  resetGateway();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('the gateway owns provider retries', () => {
  it.each([500, 429])('a streaming primary and fallback each make one HTTP attempt after %s', async status => {
    const gw = gateway();
    const fallback = DEFAULT_MODELS.find(m => m.id === 'claude-sonnet-4')!;
    vi.spyOn(gw as any, 'getFallbackModels').mockReturnValue([fallback]);
    const openaiFetch = vi.fn(async () => temporaryFailure(status));
    const anthropicFetch = vi.fn(async () => temporaryFailure(status));
    (gw as any).openaiClient.fetch = openaiFetch;
    (gw as any).anthropicClient.fetch = anthropicFetch;

    const outcome = gw.route({
      taskType: 'chat',
      provider: 'openai',
      messages: [{ role: 'user', content: 'Show me around.' }],
      stream: true,
      onStream: vi.fn(),
    }).catch(error => error);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await outcome).toBeInstanceOf(GatewayAllProvidersFailedError);
    expect(openaiFetch, 'the primary SDK retried outside the gateway policy').toHaveBeenCalledTimes(1);
    expect(anthropicFetch, 'the fallback SDK retried outside the gateway policy').toHaveBeenCalledTimes(1);
  });

  it('retains one gateway-owned retry for non-streaming transient failures', async () => {
    const gw = gateway();
    const dispatch = vi.spyOn(gw as any, 'dispatchProvider');
    const providerFetch = vi.fn()
      .mockImplementationOnce(async () => temporaryFailure(500))
      .mockImplementationOnce(async () => new Response(JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [{ type: 'text', text: 'Recovered.' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { headers: { 'content-type': 'application/json' } }));
    (gw as any).anthropicClient.fetch = providerFetch;

    const outcome = gw.route({
      taskType: 'chat',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'Hello.' }],
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect((await outcome).content).toBe('Recovered.');
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(dispatch, 'the retry was hidden inside the SDK rather than owned by the gateway').toHaveBeenCalledTimes(2);
  });

  it('retains the four-attempt non-streaming overload budget without multiplying it in the SDK', async () => {
    const gw = gateway();
    vi.spyOn(gw as any, 'getFallbackModels').mockReturnValue([]);
    const dispatch = vi.spyOn(gw as any, 'dispatchProvider');
    const providerFetch = vi.fn(async () => temporaryFailure(429));
    (gw as any).anthropicClient.fetch = providerFetch;

    const outcome = gw.route({
      taskType: 'chat',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'Hello.' }],
    }).catch(error => error);
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await outcome).toBeInstanceOf(GatewayAllProvidersFailedError);
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(providerFetch, 'four gateway attempts were multiplied by SDK retries').toHaveBeenCalledTimes(4);
  });
});

describe('OpenAI-compatible gateway client factories', () => {
  it.each(['local', 'azure'] as const)('%s leaves streaming retries to the gateway', async provider => {
    vi.stubEnv('LOCAL_AI_BASE_URL', 'https://test.invalid/v1');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'test-not-sent');
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://test.invalid');
    const client = provider === 'local' ? createLocalClient() : createAzureClient();
    expect(client).not.toBeNull();
    if (!client) throw new Error(`${provider} test client was not constructed`);
    const providerFetch = vi.fn(async () => temporaryFailure(500));
    client.fetch = providerFetch;

    const outcome = client.chat.completions.create({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello.' }],
      stream: true,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await outcome).toBeInstanceOf(Error);
    expect(providerFetch, 'the factory enabled hidden SDK retries').toHaveBeenCalledTimes(1);
  });
});
