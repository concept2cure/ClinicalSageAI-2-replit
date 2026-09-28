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
 *
 * And the fix for that last one went a step too far: it exempted 404, and
 * every 400 whatever it said. A 404 is a model or endpoint that does not exist,
 * and a 400 saying the credit balance is too low is an account that cannot be
 * billed — provider failures both, which the breaker must see so the next
 * turn stops walking into them first.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import { AIGateway, resetGateway, fillEmptyBodyMessages, DEFAULT_MODELS } from '../gateway';
import { CLOUD_MODELS } from '../providers/cloud-models';
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
  // The model table below used to live in the function, as regexes over the
  // wire name. It now lives on each registry entry as `maxApiEffort`, and the
  // function only applies it. So the table is asserted in two halves: the
  // clamp, given a declared ceiling; and the registry, declaring the right
  // ceiling for every entry it serves.

  it('sends nothing to an entry whose ceiling is null — Haiku 4.5, Sonnet 4.5, Opus 4.1', () => {
    for (const level of ['low', 'medium', 'high', 'max'] as const) {
      expect(apiEffortForModel({ maxApiEffort: null }, level), `would 400 on effort=${level}`).toBeUndefined();
    }
  });

  it('lowers max to high on a high ceiling (Opus 4.5) and passes the rest through — never raises', () => {
    expect(apiEffortForModel({ maxApiEffort: 'high' }, 'max')).toBe('high');
    expect(apiEffortForModel({ maxApiEffort: 'high' }, 'high')).toBe('high');
    expect(apiEffortForModel({ maxApiEffort: 'high' }, 'medium')).toBe('medium');
    expect(apiEffortForModel({ maxApiEffort: 'high' }, 'low')).toBe('low');
  });

  it('passes every level through on a max ceiling (Opus 4.6+, Sonnet 4.6+, Claude 5)', () => {
    for (const level of ['low', 'medium', 'high', 'max'] as const) {
      expect(apiEffortForModel({ maxApiEffort: 'max' }, level)).toBe(level);
    }
  });

  it('sends nothing to an entry that declares no ceiling', () => {
    // Undeclared is none, the same rule as every other capability flag. A
    // missing declaration costs a turn its effort hint; sending a level the
    // model rejects costs the turn its first call.
    expect(apiEffortForModel({}, 'high')).toBeUndefined();
  });

  it('sends nothing when nothing was asked for', () => {
    expect(apiEffortForModel({ maxApiEffort: 'max' }, undefined)).toBeUndefined();
  });

  it('A BEDROCK HAIKU GETS NO EFFORT — the case the name rule got wrong', () => {
    // The name rule began `if (!m.startsWith('claude-')) return effort;`, and a
    // Bedrock id is `anthropic.claude-haiku-4-5`. So it skipped every check and
    // sent Haiku the very parameter this function exists to withhold. Same
    // weights, different substrate naming. Declared per entry, it cannot miss.
    const bedrockHaiku = { model: 'anthropic.claude-haiku-4-5', maxApiEffort: null } as const;
    expect(apiEffortForModel(bedrockHaiku, 'high')).toBeUndefined();
  });

  it('every Claude registry entry declares the ceiling its model takes', () => {
    // This is where the model table now lives. Each entry is checked against
    // the documented support for the model it serves, so an entry added with
    // the wrong declaration — or none — fails here rather than in production.
    const expected = (wire: string): 'high' | 'max' | null => {
      const m = wire.replace(/^(?:[a-z]+\.)?anthropic\./, '');
      if (/^claude-haiku-4-5|^claude-sonnet-4-5|^claude-opus-4-1/.test(m)) return null;
      if (/^claude-opus-4-5/.test(m)) return 'high';
      return 'max';
    };
    const claude = [...DEFAULT_MODELS, ...CLOUD_MODELS].filter(e =>
      ['anthropic', 'bedrock', 'vertex'].includes(e.provider),
    );
    expect(claude.length).toBeGreaterThan(4);
    for (const entry of claude) {
      expect(entry.maxApiEffort, `${entry.id} (${entry.model})`).toBe(expected(entry.model));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The params that actually reach Anthropic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The REAL registry entry for a wire model when there is one.
 *
 * Effort support is declared per entry (`maxApiEffort`), so a hand-built
 * fixture would test the fixture. Resolving the actual entry makes these cases
 * prove that the registry's own declarations produce the right wire params —
 * which is the thing that has to be true in production.
 */
function modelConfig(model: string): ModelConfig {
  const real = [...DEFAULT_MODELS, ...CLOUD_MODELS].find(e => e.model === model);
  if (real) return real;
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

// ─────────────────────────────────────────────────────────────────────────────
// recordFailure — a missing model and an unbillable account are provider failures
// ─────────────────────────────────────────────────────────────────────────────

const SDK_HEADERS = new Headers();

/** What the Anthropic SDK throws for this status and body — the error route() hands recordFailure. */
const anthropicRefusal = (status: number, message: string, type = 'invalid_request_error') =>
  Anthropic.APIError.generate(status, { type: 'error', error: { type, message } }, undefined, SDK_HEADERS);

/** What the OpenAI SDK throws — for OpenAI itself and every server or proxy spoken to through it. */
const openAIRefusal = (status: number, body: Record<string, unknown>) =>
  OpenAI.APIError.generate(status, { error: body }, undefined, SDK_HEADERS);

const CREDIT_BALANCE_TOO_LOW =
  'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';

const failWith = (gw: AIGateway, p: string, error: Error) =>
  (gw as unknown as { recordFailure: (p: string, e: Error) => void }).recordFailure(p, error);

describe('recordFailure — a missing model and an unbillable account trip the breaker', () => {
  it('three 404s mark the provider unhealthy — the model or endpoint is not there', () => {
    vi.useFakeTimers();
    const gw = liveGateway();
    for (let i = 0; i < 3; i++) {
      failWith(gw, 'anthropic', anthropicRefusal(404, 'model: claude-opus-4-0', 'not_found_error'));
    }
    expect(healthOf(gw, 'anthropic').healthy, 'a model that does not exist was treated as a bad request').toBe(false);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(3);
  });

  it.each<[string, () => Error]>([
    ['Anthropic: credit balance too low', () => anthropicRefusal(400, CREDIT_BALANCE_TOO_LOW)],
    [
      'OpenAI: insufficient_quota',
      () =>
        openAIRefusal(400, {
          message: 'You exceeded your current quota, please check your plan and billing details.',
          type: 'insufficient_quota',
          code: 'insufficient_quota',
        }),
    ],
    ['only the code says so', () => openAIRefusal(400, { message: 'Request refused.', code: 'insufficient_quota' })],
    ['in capitals', () => openAIRefusal(400, { message: 'Monthly QUOTA exceeded for this key' })],
    ['payment', () => openAIRefusal(400, { message: 'Payment method declined for this organization' })],
    [
      'only the body says so',
      () => openAIRefusal(400, { message: 'Provider returned error', metadata: { raw: 'billing hard limit reached' } }),
    ],
    // Anthropic's other two account refusals arrive as the same 400
    // invalid_request_error, and say neither billing, quota nor payment.
    [
      'Anthropic: spend cap reached',
      () =>
        anthropicRefusal(
          400,
          'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.',
        ),
    ],
    ['Anthropic: organization disabled', () => anthropicRefusal(400, 'This organization has been disabled.')],
  ])('three account 400s mark the provider unhealthy — %s', (_label, refusal) => {
    vi.useFakeTimers();
    const gw = liveGateway();
    for (let i = 0; i < 3; i++) failWith(gw, 'anthropic', refusal());
    expect(healthOf(gw, 'anthropic').healthy, 'an account the provider will not serve was treated as a bad request').toBe(false);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(3);
  });

  it.each([400, 413, 422])('a request-shape %i from the SDK still leaves the provider healthy', status => {
    vi.useFakeTimers();
    const gw = liveGateway();
    for (let i = 0; i < 4; i++) {
      failWith(gw, 'anthropic', anthropicRefusal(status, 'messages.1.content.0.text: text content blocks must be non-empty'));
    }
    expect(healthOf(gw, 'anthropic').healthy).toBe(true);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(0);
  });

  it('a malformed request that names a tool with "billing" in it is still a malformed request', () => {
    // AnA has a tool named get_billing_credits, and a refusal can quote the
    // request back. A word inside a snake_case name is not the account talking.
    vi.useFakeTimers();
    const gw = liveGateway();
    for (let i = 0; i < 4; i++) {
      failWith(gw, 'anthropic', anthropicRefusal(400, "tool_choice.name: 'get_billing_credits' is not one of the tools provided"));
    }
    expect(healthOf(gw, 'anthropic').healthy).toBe(true);
    expect(healthOf(gw, 'anthropic').consecutiveFailures).toBe(0);
  });
});

describe('route() — a provider out of credit stops being tried first', () => {
  it('after a turn on which every Anthropic rung answers "credit balance is too low", the next goes straight to OpenAI', async () => {
    vi.useFakeTimers();
    const gw = liveGateway();
    const anthropicCreate = vi.fn(async () => {
      throw anthropicRefusal(400, CREDIT_BALANCE_TOO_LOW);
    });
    (gw as any).anthropicClient = { messages: { create: anthropicCreate } };
    const openaiCreate = vi.fn(async () => ({
      model: 'gpt-4o-2024-08-06',
      choices: [{ message: { role: 'assistant', content: 'Opening CMC.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }));
    (gw as any).openaiClient = { chat: { completions: { create: openaiCreate } } };
    const ask = {
      taskType: 'chat',
      messages: [{ role: 'user', content: 'take me to CMC' }],
      maxTokens: 500,
    } as GatewayRequest;

    const first = await gw.route(ask);
    expect(first.provider).toBe('openai');
    expect(anthropicCreate).toHaveBeenCalled();
    expect(healthOf(gw, 'anthropic').healthy).toBe(false);

    anthropicCreate.mockClear();
    const second = await gw.route(ask);
    expect(second.provider).toBe('openai');
    expect(anthropicCreate, 'the out-of-credit provider was tried first again, on every turn').not.toHaveBeenCalled();
  });
});
