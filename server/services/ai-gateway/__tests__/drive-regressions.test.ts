/**
 * Tests — the gateway failures that took AnA's hands off the screen.
 *
 * Three independent faults, each of which alone ended a driving turn after its
 * first move, and together made a failure look like an outage:
 *
 *   • A blank body message. A round that called tools without narrating staged
 *     `{ role: 'assistant', content: '' }`. The Messages API refuses the WHOLE
 *     request over one, with a 400, and the gateway re-sent that same request
 *     down the fallback ladder — every model refused it.
 *
 *   • Effort on a model that takes none. `output_config.effort` was attached to
 *     every Anthropic request, and Haiku 4.5 — the economy tier every short
 *     ask ("take me to CMC") and every Fast turn routes to — rejects it with a
 *     400. Each of those turns failed its first call.
 *
 *   • A 400 counted as an outage. The circuit breaker marked a provider
 *     unhealthy after three failures of ANY kind, so three malformed requests
 *     (the two faults above, on three turns) took a healthy provider out of
 *     rotation for every tenant. A 400 says the request was wrong, not that
 *     the provider is down.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

import { AIGateway, resetGateway, fillEmptyBodyMessages } from '../gateway';
import { apiEffortForModel } from '../effort';
import type { GatewayConfig, GatewayMessage, GatewayRequest, ModelConfig } from '../types';

afterEach(() => {
  resetGateway();
  vi.useRealTimers();
});

// ─────────────────────────────────────────────────────────────────────────────
// fillEmptyBodyMessages
// ─────────────────────────────────────────────────────────────────────────────

describe('fillEmptyBodyMessages — no request is refused over a blank turn', () => {
  it('fills an empty or whitespace-only assistant turn', () => {
    const out = fillEmptyBodyMessages([
      { role: 'user', content: 'take me to the vault then search it for stability' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'tool results' },
      { role: 'assistant', content: ' \n ' },
    ] as GatewayMessage[]);
    expect(out[1].content.trim().length, 'the blank tool-only round would 400 the request').toBeGreaterThan(0);
    expect(out[3].content.trim().length).toBeGreaterThan(0);
    expect(out[1].role).toBe('assistant');
  });

  it('fills an empty user turn too', () => {
    const out = fillEmptyBodyMessages([{ role: 'user', content: '   ' }] as GatewayMessage[]);
    expect(out[0].content.trim().length).toBeGreaterThan(0);
    expect(out[0].role).toBe('user');
  });

  it('leaves real content and contentBlocks messages exactly as they were', () => {
    const blocks = {
      role: 'user',
      content: '',
      contentBlocks: [{ type: 'text', text: 'see the attached' }],
    } as unknown as GatewayMessage;
    const said = { role: 'assistant', content: 'Opening the Vault.' } as GatewayMessage;
    const out = fillEmptyBodyMessages([blocks, said, { role: 'assistant', content: '' } as GatewayMessage]);
    expect(out[0], 'a message carried by its blocks was rewritten').toBe(blocks);
    expect(out[1]).toBe(said);
  });

  it('returns the same array when nothing needed filling', () => {
    const messages = [
      { role: 'user', content: 'open settings' },
      { role: 'assistant', content: 'Opening Settings.' },
    ] as GatewayMessage[];
    expect(fillEmptyBodyMessages(messages)).toBe(messages);
  });

  it('does not mutate the caller\'s messages when it does fill', () => {
    const blank = { role: 'assistant', content: '' } as GatewayMessage;
    fillEmptyBodyMessages([{ role: 'user', content: 'go' } as GatewayMessage, blank]);
    expect(blank.content).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// apiEffortForModel
// ─────────────────────────────────────────────────────────────────────────────

describe('apiEffortForModel — only a level the model accepts', () => {
  it.each(['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5', 'claude-opus-4-1'])(
    'sends no effort to %s, which rejects it',
    model => {
      for (const level of ['low', 'medium', 'high', 'max'] as const) {
        expect(apiEffortForModel(model, level), `${model} would 400 on effort=${level}`).toBeUndefined();
      }
    },
  );

  it('lowers max to high on Opus 4.5 and passes the rest through — never raises', () => {
    expect(apiEffortForModel('claude-opus-4-5', 'max')).toBe('high');
    expect(apiEffortForModel('claude-opus-4-5', 'high')).toBe('high');
    expect(apiEffortForModel('claude-opus-4-5', 'medium')).toBe('medium');
    expect(apiEffortForModel('claude-opus-4-5', 'low')).toBe('low');
  });

  it.each(['claude-opus-4-6', 'claude-opus-4-7', 'claude-sonnet-5', 'claude-opus-5', 'claude-opus-5-5', 'claude-fable-5-1'])(
    'passes every level through on %s',
    model => {
      for (const level of ['low', 'medium', 'high', 'max'] as const) {
        expect(apiEffortForModel(model, level)).toBe(level);
      }
    },
  );

  it('leaves non-Claude model ids alone', () => {
    expect(apiEffortForModel('gpt-4o', 'high')).toBe('high');
    expect(apiEffortForModel('kimi-k2', 'max')).toBe('max');
  });

  it('sends nothing when nothing was asked for', () => {
    expect(apiEffortForModel('claude-opus-5', undefined)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The params that actually reach Anthropic
// ─────────────────────────────────────────────────────────────────────────────

function modelConfig(model: string): ModelConfig {
  return {
    id: model,
    provider: 'anthropic',
    model,
    contextWindow: 200_000,
    qualityScore: 80,
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
    capabilities: ['chat'],
    enabled: true,
  } as ModelConfig;
}

/** A gateway whose Anthropic client records the params and streams a short answer. */
function capturingGateway() {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  async function* gen() {
    yield { type: 'message_start', message: { model: 'm', usage: { input_tokens: 3 } } };
    yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } };
    yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } };
    yield { type: 'message_stop' };
  }
  const create = vi.fn(async () => gen());
  (gateway as any).anthropicClient = { messages: { create } };
  return { gateway, create };
}

async function streamOn(model: string, messages: GatewayMessage[] = [{ role: 'user', content: 'take me to CMC' }]) {
  const { gateway, create } = capturingGateway();
  await (gateway as any).executeAnthropicStream(
    modelConfig(model),
    {
      taskType: 'chat',
      messages,
      stream: true,
      onStream: () => {},
      apiEffort: 'high',
    } as unknown as GatewayRequest,
    'req-drive',
    Date.now(),
  );
  expect(create).toHaveBeenCalledTimes(1);
  return (create.mock.calls[0] as unknown[])[0] as Record<string, any>;
}

describe('Anthropic stream params', () => {
  it('omit output_config.effort for claude-haiku-4-5', async () => {
    const params = await streamOn('claude-haiku-4-5');
    expect(params.output_config?.effort, 'Haiku 4.5 was sent effort and would 400').toBeUndefined();
  });

  it('still carry it for a model that takes it (the omission is per model, not global)', async () => {
    const params = await streamOn('claude-opus-5');
    expect(params.output_config?.effort).toBe('high');
  });

  it('never send a blank body message', async () => {
    const params = await streamOn('claude-opus-5', [
      { role: 'user', content: 'show me around' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'tool results' },
    ] as GatewayMessage[]);
    for (const m of params.messages as Array<{ content: unknown }>) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(m.content).not.toBe('');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordFailure — a malformed request is not an outage
// ─────────────────────────────────────────────────────────────────────────────

function liveGateway(): AIGateway {
  return new AIGateway({
    deterministicMode: false,
    defaultStrategy: 'task_based',
    auditEnabled: false,
    providers: [
      { name: 'anthropic', enabled: true, apiKey: 'not-used', defaultModel: 'claude-opus-5', models: [] },
      { name: 'openai', enabled: true, apiKey: 'not-used', defaultModel: 'gpt-4o', models: [] },
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

type Health = { healthy: boolean; consecutiveFailures: number };
const healthOf = (gw: AIGateway, p: string) =>
  (gw as unknown as { providerHealth: Map<string, Health> }).providerHealth.get(p)!;
const fail = (gw: AIGateway, p: string, status: number) =>
  (gw as unknown as { recordFailure: (p: string, e: Error) => void }).recordFailure(
    p,
    Object.assign(new Error(`HTTP ${status}`), { status }),
  );

describe('recordFailure — the circuit breaker counts outages, not bad requests', () => {
  it('four 400s in a row leave the provider healthy', () => {
    vi.useFakeTimers();
    const gw = liveGateway();
    expect(healthOf(gw, 'anthropic').healthy).toBe(true);
    for (let i = 0; i < 4; i++) fail(gw, 'anthropic', 400);
    expect(healthOf(gw, 'anthropic').healthy, 'a malformed request took the provider offline for every tenant').toBe(true);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(0);
  });

  it('three 503s still mark it unhealthy — the breaker itself is intact', () => {
    vi.useFakeTimers();
    const gw = liveGateway();
    for (let i = 0; i < 3; i++) fail(gw, 'anthropic', 503);
    expect(healthOf(gw, 'anthropic').healthy).toBe(false);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(3);
  });

  it('a 400 between outages neither resets nor advances the count', () => {
    vi.useFakeTimers();
    const gw = liveGateway();
    fail(gw, 'anthropic', 503);
    fail(gw, 'anthropic', 400);
    fail(gw, 'anthropic', 503);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(2);
    expect(healthOf(gw, 'anthropic').healthy).toBe(true);
  });
});
