/**
 * Context-window admission — the gateway must never dispatch a request that
 * cannot fit the model it is about to call, and must never report "too large"
 * as a generic provider failure.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Every entry in DEFAULT_MODELS declares a `contextWindow`, and nothing read
 * it. An oversized request — a whole-section revise with a long
 * `existingContent`, a gap analysis over a full document — went to the
 * provider, was refused with a 400, and then walked the ENTIRE fallback ladder
 * (Opus → Sonnet → Haiku → GPT-4o → Kimi): one doomed network call per rung,
 * each one counted against that provider's health, before
 * GatewayAllProvidersFailedError was finally thrown and the route answered
 * 500 "Something went wrong while saving batch". A request that could never
 * have succeeded cost five provider round-trips and told the author nothing
 * about what to change.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a request that fits NO enabled model is refused before any dispatch, and
 *     the refusal classifies as TOKEN_LIMIT_EXCEEDED;
 *   • a request that fits some model but not the one selected is dispatched to
 *     a model whose window fits — a refusal is routing information, not a
 *     provider failure, so the skipped provider's health is untouched;
 *   • an ordinary request reaches the selected model exactly as before.
 *
 * The provider call is replaced with a spy that SUCCEEDS for anything. That is
 * the point: with the provider taken out of the loop, the only thing that can
 * stop an oversized request is the gateway's own admission — so the first two
 * tests fail against a gateway that relies on the provider to say no.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIGateway, resetGateway } from '../gateway';
import { classifyGatewayError } from '../gateway-error-map';
import type { GatewayConfig, GatewayResponse, ModelConfig } from '../types';

/** A live-mode gateway with two providers and no network. */
function liveGateway(): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    defaultStrategy: 'task_based',
    auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-4-8', models: [] },
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
    ],
    policy: {
      maxTokensPerRequest: 128_000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      // Off so the test measures admission, not the injection scanner's
      // throughput over a megabyte of filler.
      contentFilters: false,
      piiDetection: false,
    },
  } as Partial<GatewayConfig>);
}

/** What a provider would return if it accepted the request — for ANY request. */
function accepting(m: ModelConfig): GatewayResponse {
  return {
    content: 'ok',
    provider: m.provider,
    model: m.model,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    latencyMs: 1,
    requestId: 'test',
    cached: false,
    deterministic: false,
    finishReason: 'stop',
  } as GatewayResponse;
}

function spyDispatch(gw: AIGateway) {
  return vi
    .spyOn(gw as unknown as { dispatchProvider: (m: ModelConfig) => Promise<GatewayResponse> }, 'dispatchProvider')
    .mockImplementation(async (m: ModelConfig) => accepting(m));
}

afterEach(() => resetGateway());

describe('context-window admission', () => {
  it('refuses a request that fits no enabled model BEFORE any provider is called, as TOKEN_LIMIT_EXCEEDED', async () => {
    const gw = liveGateway();
    const dispatch = spyDispatch(gw);

    // 1.2M characters is ≈240k tokens even at a lenient 5 chars/token — past
    // the 200k window of the largest model in the registry.
    const oversized = 'x'.repeat(1_200_000);
    const outcome = await gw
      .route({ taskType: 'chat', messages: [{ role: 'user', content: oversized }] })
      .then(() => null, (e: unknown) => e);

    expect(outcome, 'the gateway accepted a request no model can hold').toBeInstanceOf(Error);
    expect(dispatch, 'a provider was called for a request that could never fit').not.toHaveBeenCalled();
    expect(classifyGatewayError(outcome).code).toBe('TOKEN_LIMIT_EXCEEDED');
    // The refusal has to be actionable: it names the size and the ceiling.
    expect(classifyGatewayError(outcome).message).toMatch(/\d/);
  });

  it('dispatches to a model whose window fits instead of the pinned one that cannot', async () => {
    const gw = liveGateway();
    const dispatch = spyDispatch(gw);

    // ≈140k tokens: over GPT-4o's 128k window, under Claude's 200k.
    const big = 'x'.repeat(700_000);
    const res = await gw.route({
      taskType: 'chat',
      provider: 'openai',
      messages: [{ role: 'user', content: big }],
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0][0] as ModelConfig).provider).toBe('anthropic');
    expect(res.provider).toBe('anthropic');

    // Skipping a model that cannot hold the request is not a failure of that
    // provider, so it must not push it toward the circuit breaker.
    const health = (gw as unknown as { providerHealth: Map<string, { consecutiveFailures: number }> })
      .providerHealth.get('openai');
    expect(health?.consecutiveFailures ?? 0).toBe(0);
  });

  it('leaves an ordinary request on the model the router selected', async () => {
    const gw = liveGateway();
    const dispatch = spyDispatch(gw);

    const res = await gw.route({
      taskType: 'chat',
      provider: 'openai',
      messages: [{ role: 'user', content: 'What does ICH E3 section 12.6 contain?' }],
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0][0] as ModelConfig).provider).toBe('openai');
    expect(res.content).toBe('ok');
  });
});
