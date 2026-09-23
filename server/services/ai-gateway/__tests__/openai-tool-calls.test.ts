/**
 * Tests — the OpenAI-compatible paths carry tools, both ways.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * AnA's agentic loop (server/routes/ana-ri/stream.ts) calls
 * `gateway.route({ tools, stream: true, onStream })` and acts on
 * `response.toolUses`. Only the Anthropic executors forwarded `request.tools`
 * and returned `toolUses`. `executeOpenAI`, `executeMoonshot` and
 * `executeOpenAICompatibleStream` — the paths for openai, azure, local and
 * Kimi — built their params with no tools and returned no tool calls. So a turn
 * served by one of them, whether by cross-provider fallback, a model pin, a
 * tier remap or a deployment with only OPENAI_API_KEY / KIMI_API_KEY, had no
 * tools at all: AnA could not navigate, act on a screen or run a demo, and the
 * response looked like any other text answer. Nothing reported it.
 *
 * ── What is pinned here ──────────────────────────────────────────────────────
 *   - Anthropic-shaped tools become OpenAI functions on every OpenAI-compatible
 *     path; server tools (no input_schema) are not offered; tool_choice maps.
 *   - Streamed `delta.tool_calls` fragments — split mid-token, interleaved by
 *     `index` for parallel calls — reassemble into the Anthropic path's
 *     `toolUses` shape.
 *   - Arguments that do not parse, or that a dropped stream cut short, come
 *     back as `inputParseError` rather than a `{}` that would dispatch as a
 *     call with no arguments.
 *   - A route() fallback from Anthropic to OpenAI keeps the tools.
 *
 * No live API — the mock clients return canned completions or async
 * generators of wire chunks.
 */

import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { AnaTool, GatewayConfig, GatewayRequest, ModelConfig } from '../types';

const GPT: ModelConfig = {
  id: 'gpt-4o',
  provider: 'openai',
  model: 'gpt-4o',
  contextWindow: 128_000,
  qualityScore: 95,
  costPer1kInput: 0.005,
  costPer1kOutput: 0.015,
  capabilities: ['chat'],
  enabled: true,
  thinkingMode: 'none',
  supportsSamplingParams: true,
};

const KIMI: ModelConfig = {
  ...GPT,
  id: 'kimi-k2-0711',
  provider: 'moonshot',
  model: 'kimi-k2-0711-preview',
};

const SEARCH: AnaTool = {
  name: 'search_document',
  description: 'Search the open document.',
  input_schema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
  },
};

const NAVIGATE: AnaTool = {
  name: 'navigate_to',
  description: 'Open a screen in the app.',
  input_schema: { type: 'object', properties: { screen: { type: 'string' } } },
};

/** An Anthropic server tool: a `type`, no input_schema, nothing to run it here. */
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

function asFunction(tool: AnaTool) {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  };
}

/** A client whose non-streaming create() answers with `message`. */
function completionClient(message: Record<string, unknown>, finishReason = 'tool_calls') {
  return {
    chat: {
      completions: {
        create: vi.fn(async (_params: any, _opts?: any) => ({
          model: 'gpt-4o-2024-08-06',
          choices: [{ message: { role: 'assistant', content: null, ...message }, finish_reason: finishReason }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })),
      },
    },
  };
}

/** A client whose streaming create() yields exactly these chunks. */
function streamClient(chunks: any[], thenThrow?: Error) {
  async function* gen() {
    for (const c of chunks) yield c;
    if (thenThrow) throw thenThrow;
  }
  return { chat: { completions: { create: vi.fn(async (_params: any, _opts?: any) => gen()) } } };
}

function sentParams(client: { chat: { completions: { create: any } } }) {
  return client.chat.completions.create.mock.calls[0][0];
}

function gatewayWithOpenAI(client: unknown): AIGateway {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  (gateway as any).openaiClient = client;
  return gateway;
}

function request(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [{ role: 'user', content: 'find the indemnification clause' }],
    maxTokens: 1000,
    ...overrides,
  } as GatewayRequest;
}

function streamRequest(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return request({ stream: true, onStream: () => {}, ...overrides });
}

/** One streamed tool-call fragment, in the wire shape. */
function frag(index: number, parts: { id?: string; name?: string; args?: string }) {
  return {
    model: 'gpt-4o-2024-08-06',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index,
              ...(parts.id ? { id: parts.id, type: 'function' } : {}),
              function: {
                ...(parts.name ? { name: parts.name } : {}),
                ...(parts.args !== undefined ? { arguments: parts.args } : {}),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
}

const FINISH_TOOL_CALLS = { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] };
const USAGE = { choices: [], usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 } };

async function runStream(chunks: any[], overrides: Partial<GatewayRequest> = {}, thenThrow?: Error) {
  const client = streamClient(chunks, thenThrow);
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  const res = await (gateway as any).executeOpenAICompatibleStream(
    client,
    GPT,
    streamRequest({ tools: [SEARCH, NAVIGATE], ...overrides }),
    'req-stream',
    Date.now(),
  );
  return { res, client };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('OpenAI-compatible paths — tools are offered', () => {
  it('converts Anthropic-shaped tools to OpenAI functions and sends them', async () => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);

    await (gateway as any).executeOpenAI(GPT, request({ tools: [SEARCH, NAVIGATE] }), 'req-1', Date.now());

    const params = sentParams(client);
    // Before the fix `params.tools` is undefined — the model never saw a tool.
    expect(params.tools).toEqual([asFunction(SEARCH), asFunction(NAVIGATE)]);
    // 'auto' is the API's default whenever tools are present; nothing to send.
    expect(params).not.toHaveProperty('tool_choice');
  });

  it('does not offer an Anthropic server tool, which nothing here can execute', async () => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);

    await (gateway as any).executeOpenAI(
      GPT,
      request({ tools: [WEB_SEARCH, SEARCH] as GatewayRequest['tools'] }),
      'req-2',
      Date.now(),
    );

    expect(sentParams(client).tools).toEqual([asFunction(SEARCH)]);
  });

  it.each([
    ['none', 'none'],
    ['any', 'required'],
    [{ type: 'tool', name: 'navigate_to' }, { type: 'function', function: { name: 'navigate_to' } }],
  ] as const)('maps toolChoice %j to tool_choice %j', async (toolChoice, expected) => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);

    await (gateway as any).executeOpenAI(
      GPT,
      request({ tools: [SEARCH, NAVIGATE], toolChoice: toolChoice as GatewayRequest['toolChoice'] }),
      'req-3',
      Date.now(),
    );

    expect(sentParams(client).tool_choice).toEqual(expected);
  });

  it('sends no tools — and no tool_choice — when the request has none to offer', async () => {
    // The API refuses tool_choice without tools, so a terminal round's
    // toolChoice:'none' must not go out alone.
    for (const tools of [undefined, [], [WEB_SEARCH]] as Array<GatewayRequest['tools']>) {
      const client = completionClient({ content: 'ok' }, 'stop');
      const gateway = gatewayWithOpenAI(client);
      await (gateway as any).executeOpenAI(GPT, request({ tools, toolChoice: 'none' }), 'req-4', Date.now());
      const params = sentParams(client);
      expect(params).not.toHaveProperty('tools');
      expect(params).not.toHaveProperty('tool_choice');
    }
  });

  it('trims a description past the 1024-character limit instead of sending a request the API refuses', async () => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);
    const verbose: AnaTool = { ...SEARCH, name: 'assess_boxed_warning', description: 'd'.repeat(1348) };

    await (gateway as any).executeOpenAI(GPT, request({ tools: [verbose, NAVIGATE] }), 'req-5', Date.now());

    const [first, second] = sentParams(client).tools;
    expect(first.function.name).toBe('assess_boxed_warning');
    expect(first.function.description).toHaveLength(1024);
    expect(first.function.description.startsWith('d'.repeat(1023))).toBe(true);
    // Only the long one is touched.
    expect(second).toEqual(asFunction(NAVIGATE));
  });

  it('does not offer a tool whose name the API would reject, keeping the rest of the request valid', async () => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);
    const dotted: AnaTool = { ...SEARCH, name: 'search.document' };

    await (gateway as any).executeOpenAI(GPT, request({ tools: [dotted, NAVIGATE] }), 'req-6', Date.now());

    expect(sentParams(client).tools).toEqual([asFunction(NAVIGATE)]);
  });

  it('sends at most 128 tools, keeping the first 128', async () => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);
    const many: AnaTool[] = Array.from({ length: 130 }, (_, i) => ({ ...NAVIGATE, name: `tool_${i}` }));

    await (gateway as any).executeOpenAI(GPT, request({ tools: many }), 'req-7', Date.now());

    const names = sentParams(client).tools.map((t: any) => t.function.name);
    expect(names).toHaveLength(128);
    expect(names[0]).toBe('tool_0');
    expect(names[127]).toBe('tool_127');
  });

  it('offers tools on the streaming path too', async () => {
    const { client } = await runStream(
      [{ choices: [{ delta: { content: 'ok' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }],
      { toolChoice: 'none' },
    );
    const params = sentParams(client);
    expect(params.tools).toEqual([asFunction(SEARCH), asFunction(NAVIGATE)]);
    expect(params.tool_choice).toBe('none');
    expect(params.stream).toBe(true);
  });

  it('offers tools on the Moonshot non-streaming path too', async () => {
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
    (gateway as any).moonshotClient = client;

    await (gateway as any).executeMoonshot(KIMI, request({ tools: [SEARCH] }), 'req-8', Date.now());

    expect(sentParams(client).tools).toEqual([asFunction(SEARCH)]);
  });

  it('never sends an empty message — a tools-only round leaves a blank assistant turn', async () => {
    // Moonshot refuses the whole request over one: "the message at position N
    // with role 'assistant' must not be empty".
    const client = completionClient({ content: 'ok' }, 'stop');
    const gateway = gatewayWithOpenAI(client);

    await (gateway as any).executeOpenAI(
      GPT,
      request({
        messages: [
          { role: 'system', content: 'You are AnA.' },
          { role: 'user', content: 'open the protocol' },
          { role: 'assistant', content: '' },
          { role: 'user', content: '[Tool Result for navigate_to (call_1)]:\nopened' },
        ],
      }),
      'req-9',
      Date.now(),
    );

    const messages = sentParams(client).messages;
    expect(messages).toHaveLength(4);
    for (const m of messages) expect(m.content.trim().length).toBeGreaterThan(0);
    expect(messages[2]).toEqual({ role: 'assistant', content: '(Continuing.)' });
    // Everything that was not blank goes out exactly as written.
    expect(messages[3].content).toBe('[Tool Result for navigate_to (call_1)]:\nopened');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('executeOpenAICompatibleStream — tool calls come back', () => {
  it('reassembles a call whose arguments are split mid-token across chunks', async () => {
    const { res } = await runStream([
      frag(0, { id: 'call_abc', name: 'search_document', args: '' }),
      frag(0, { args: '{"que' }),
      frag(0, { args: 'ry":"indem' }),
      frag(0, { args: 'nification"}' }),
      FINISH_TOOL_CALLS,
      USAGE,
    ]);

    // Before the fix `toolUses` is undefined — the call vanished.
    expect(res.toolUses).toEqual([
      { id: 'call_abc', name: 'search_document', input: { query: 'indemnification' } },
    ]);
    expect(res.finishReason).toBe('tool_calls');
    expect(res.usage.inputTokens).toBe(20);
  });

  it('keeps each call with its own arguments when two stream in parallel, interleaved by index', async () => {
    const { res } = await runStream([
      frag(0, { id: 'call_a', name: 'search_document', args: '' }),
      frag(1, { id: 'call_b', name: 'navigate_to', args: '' }),
      frag(1, { args: '{"scr' }),
      frag(0, { args: '{"query":' }),
      frag(1, { args: 'een":"protocol"}' }),
      frag(0, { args: '"scope"}' }),
      FINISH_TOOL_CALLS,
      USAGE,
    ]);

    expect(res.toolUses).toHaveLength(2);
    expect(res.toolUses.find((t: any) => t.id === 'call_a')).toEqual({
      id: 'call_a',
      name: 'search_document',
      input: { query: 'scope' },
    });
    expect(res.toolUses.find((t: any) => t.id === 'call_b')).toEqual({
      id: 'call_b',
      name: 'navigate_to',
      input: { screen: 'protocol' },
    });
  });

  it('keeps several calls delivered in one chunk apart', async () => {
    const { res } = await runStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_a', type: 'function', function: { name: 'search_document', arguments: '{"query":"a"}' } },
                { index: 1, id: 'call_b', type: 'function', function: { name: 'navigate_to', arguments: '{"screen":"b"}' } },
              ],
            },
          },
        ],
      },
      FINISH_TOOL_CALLS,
    ]);

    expect(res.toolUses.map((t: any) => [t.id, t.input])).toEqual([
      ['call_a', { query: 'a' }],
      ['call_b', { screen: 'b' }],
    ]);
  });

  it('streams narration as text and returns the calls beside it', async () => {
    const seen: Array<[string, string | undefined]> = [];
    const { res } = await runStream(
      [
        { choices: [{ delta: { content: 'Opening ' } }] },
        { choices: [{ delta: { content: 'the protocol.' } }] },
        frag(0, { id: 'call_n', name: 'navigate_to', args: '{"screen":"protocol"}' }),
        FINISH_TOOL_CALLS,
      ],
      { onStream: (chunk: string, meta?: { type: string }) => seen.push([chunk, meta?.type]) },
    );

    expect(res.content).toBe('Opening the protocol.');
    expect(seen).toEqual([
      ['Opening ', 'text'],
      ['the protocol.', 'text'],
    ]);
    expect(res.toolUses).toEqual([{ id: 'call_n', name: 'navigate_to', input: { screen: 'protocol' } }]);
  });

  it('reports arguments that do not parse instead of dispatching them as {}', async () => {
    const { res } = await runStream([
      frag(0, { id: 'call_bad', name: 'search_document', args: '{"query": "indem' }),
      frag(0, { args: 'nification' }), // the closing quote and brace never come
      FINISH_TOOL_CALLS,
    ]);

    const [toolUse] = res.toolUses;
    expect(toolUse.id).toBe('call_bad');
    expect(toolUse.input).toEqual({});
    expect(toolUse.inputParseError).toMatch(/not parseable JSON/);
  });

  it('reports arguments that parse to something other than an object', async () => {
    const { res } = await runStream([
      frag(0, { id: 'call_arr', name: 'search_document', args: '["indemnification"]' }),
      FINISH_TOOL_CALLS,
    ]);
    expect(res.toolUses[0].input).toEqual({});
    expect(res.toolUses[0].inputParseError).toMatch(/an array, not an object/);
  });

  it('treats an empty arguments string on a closed choice as a call with no arguments', async () => {
    const { res } = await runStream([frag(0, { id: 'call_z', name: 'list_app_screens', args: '' }), FINISH_TOOL_CALLS]);
    expect(res.toolUses).toEqual([{ id: 'call_z', name: 'list_app_screens', input: {} }]);
    expect(res.toolUses[0].inputParseError).toBeUndefined();
  });

  it('reports a call as lost when the stream drops before finish_reason', async () => {
    // Narration arrived, so the partial response is returned rather than
    // thrown; the call whose arguments were still arriving must not dispatch.
    const { res } = await runStream(
      [
        { choices: [{ delta: { content: 'Searching.' } }] },
        frag(0, { id: 'call_cut', name: 'search_document', args: '{"query":"ind' }),
        frag(1, { id: 'call_unstarted', name: 'navigate_to', args: '' }),
      ],
      {},
      new Error('connection reset'),
    );

    expect(res.content).toBe('Searching.');
    expect(res.toolUses).toHaveLength(2);
    for (const toolUse of res.toolUses) {
      expect(toolUse.input).toEqual({});
      expect(toolUse.inputParseError).toBe('the stream ended before the tool input was complete');
    }
  });

  it('fills id and name from a later fragment without appending repeats', async () => {
    // Some servers repeat id/name on every fragment; one sends the id late.
    const { res } = await runStream([
      frag(0, { name: 'search_document', args: '{"query"' }),
      frag(0, { id: 'call_late', name: 'search_document', args: ':"x"}' }),
      FINISH_TOOL_CALLS,
    ]);
    expect(res.toolUses).toEqual([{ id: 'call_late', name: 'search_document', input: { query: 'x' } }]);
  });

  it('returns no toolUses for a plain text answer', async () => {
    const { res } = await runStream([
      { choices: [{ delta: { content: 'Done.' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]);
    expect(res.toolUses).toBeUndefined();
    expect(res.content).toBe('Done.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('non-streaming OpenAI-compatible paths — message.tool_calls come back', () => {
  it('returns tool_calls as toolUses, parsing each call on its own', async () => {
    const client = completionClient({
      tool_calls: [
        { id: 'call_1', type: 'function', function: { name: 'search_document', arguments: '{"query":"scope"}' } },
        { id: 'call_2', type: 'function', function: { name: 'navigate_to', arguments: '{"screen": ' } },
        { id: 'call_3', type: 'function', function: { name: 'list_app_screens', arguments: '' } },
      ],
    });
    const gateway = gatewayWithOpenAI(client);

    const res = await (gateway as any).executeOpenAI(GPT, request({ tools: [SEARCH, NAVIGATE] }), 'req-10', Date.now());

    expect(res.content).toBe('');
    expect(res.finishReason).toBe('tool_calls');
    expect(res.toolUses).toHaveLength(3);
    expect(res.toolUses[0]).toEqual({ id: 'call_1', name: 'search_document', input: { query: 'scope' } });
    // A malformed one is reported, and does not take the good one down with it.
    expect(res.toolUses[1].input).toEqual({});
    expect(res.toolUses[1].inputParseError).toMatch(/not parseable JSON/);
    expect(res.toolUses[2]).toEqual({ id: 'call_3', name: 'list_app_screens', input: {} });
  });

  it('gives a call the server sent without an id a unique one', async () => {
    const client = completionClient({
      tool_calls: [
        { type: 'function', function: { name: 'navigate_to', arguments: '{"screen":"a"}' } },
        { type: 'function', function: { name: 'navigate_to', arguments: '{"screen":"b"}' } },
      ],
    });
    const gateway = gatewayWithOpenAI(client);

    const res = await (gateway as any).executeOpenAI(GPT, request({ tools: [NAVIGATE] }), 'req-11', Date.now());

    const [a, b] = res.toolUses;
    expect(a.id).toMatch(/^call_/);
    expect(b.id).toMatch(/^call_/);
    expect(a.id).not.toBe(b.id);
  });

  it('returns tool_calls on the Moonshot non-streaming path', async () => {
    const client = completionClient({
      tool_calls: [{ id: 'call_k', type: 'function', function: { name: 'search_document', arguments: '{"query":"k"}' } }],
    });
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
    (gateway as any).moonshotClient = client;

    const res = await (gateway as any).executeMoonshot(KIMI, request({ tools: [SEARCH] }), 'req-12', Date.now());

    expect(res.provider).toBe('moonshot');
    expect(res.toolUses).toEqual([{ id: 'call_k', name: 'search_document', input: { query: 'k' } }]);
  });

  it('returns no toolUses when the message has none', async () => {
    const client = completionClient({ content: 'plain answer' }, 'stop');
    const gateway = gatewayWithOpenAI(client);
    const res = await (gateway as any).executeOpenAI(GPT, request({ tools: [SEARCH] }), 'req-13', Date.now());
    expect(res.toolUses).toBeUndefined();
    expect(res.content).toBe('plain answer');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('route() — a turn that falls back to OpenAI keeps its tools', () => {
  it('returns the fallback model\'s tool calls after every Anthropic rung refuses', async () => {
    const gateway = new AIGateway({
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

    // A 400 is a hard client error: no retry, straight to the next rung.
    const refused = Object.assign(new Error('refused'), { status: 400 });
    const anthropicCreate = vi.fn(async () => {
      throw refused;
    });
    (gateway as any).anthropicClient = { messages: { create: anthropicCreate } };
    const openai = streamClient([
      frag(0, { id: 'call_nav', name: 'navigate_to', args: '{"screen":' }),
      frag(0, { args: '"protocol"}' }),
      FINISH_TOOL_CALLS,
      USAGE,
    ]);
    (gateway as any).openaiClient = openai;

    const res: any = await gateway.route(
      streamRequest({
        messages: [{ role: 'user', content: 'open the protocol' }],
        tools: [SEARCH, NAVIGATE],
      }),
    );

    expect(anthropicCreate).toHaveBeenCalled();
    expect(res.provider).toBe('openai');
    expect(sentParams(openai).tools).toEqual([asFunction(SEARCH), asFunction(NAVIGATE)]);
    // Before the fix this is undefined, and the loop ends as a text answer.
    expect(res.toolUses).toEqual([{ id: 'call_nav', name: 'navigate_to', input: { screen: 'protocol' } }]);
  });
});
