/**
 * Tests — a self-hosted server is offered tools only when its operator says it
 * takes them.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * applyOpenAIToolParams offered AnA's tools on every OpenAI-compatible path,
 * provider 'local' included: vLLM, llama.cpp, Ollama and LiteLLM-style servers
 * behind LOCAL_AI_BASE_URL. Many are not launched to take tools. Sent them,
 * one answers 400 and the rung fails; another has its model print the call as
 * JSON in the answer, which runs nothing and reads as a garbled reply. Either
 * way the turn was lost to a capability the server never claimed.
 *
 * ── What is pinned here ──────────────────────────────────────────────────────
 *   - Without LOCAL_AI_SUPPORTS_TOOLS=1 the local provider gets no tools and
 *     no tool_choice, on both the non-streaming and streaming paths, and the
 *     turn comes back as the plain-text answer it is.
 *   - With it, the local provider gets them exactly as openai does.
 *   - openai is offered tools either way: the withholding is per provider.
 *   - The withholding is logged once per process, with the switch that ends
 *     it — not once per round.
 *   - A turn REQUIRED to call a tool is refused as a 400, not answered as text.
 *   - Told she has no tools, she is told in the leading system prompt, never
 *     in a system message after the conversation, which strict self-hosted
 *     chat templates refuse outright.
 *
 * No live API — the mock clients return canned completions or async
 * generators of wire chunks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { AIGateway, LOCAL_NO_TOOLS_NOTE } from '../gateway';
import type { AnaTool, GatewayConfig, GatewayRequest, ModelConfig } from '../types';

const LOCAL: ModelConfig = {
  id: 'local-default',
  provider: 'local',
  model: 'local-default',
  contextWindow: 32_000,
  qualityScore: 70,
  costPer1kInput: 0,
  costPer1kOutput: 0,
  capabilities: ['chat', 'summarization', 'document_analysis', 'general'],
  enabled: true,
  thinkingMode: 'none',
  supportsSamplingParams: true,
};

const GPT: ModelConfig = {
  ...LOCAL,
  id: 'gpt-4o',
  provider: 'openai',
  model: 'gpt-4o',
  contextWindow: 128_000,
  qualityScore: 95,
};

const NAVIGATE: AnaTool = {
  name: 'navigate_to',
  description: 'Open a screen in the app.',
  input_schema: { type: 'object', properties: { screen: { type: 'string' } } },
};

const NAVIGATE_FUNCTION = {
  type: 'function',
  function: { name: NAVIGATE.name, description: NAVIGATE.description, parameters: NAVIGATE.input_schema },
};

/** A client whose non-streaming create() answers with plain text. */
function completionClient(content = 'The Vault holds your controlled documents.') {
  return {
    chat: {
      completions: {
        create: vi.fn(async (_params: any, _opts?: any) => ({
          model: 'local-default',
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })),
      },
    },
  };
}

/** A client whose streaming create() yields a short plain-text answer. */
function streamClient() {
  async function* gen() {
    yield { choices: [{ delta: { content: 'Here is ' } }] };
    yield { choices: [{ delta: { content: 'the Vault.' } }] };
    yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
  }
  return { chat: { completions: { create: vi.fn(async (_params: any, _opts?: any) => gen()) } } };
}

type Client = { chat: { completions: { create: any } } };
const sentParams = (client: Client) => client.chat.completions.create.mock.calls[0][0];

function request(overrides: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [{ role: 'user', content: 'take me to the vault' }],
    maxTokens: 1000,
    tools: [NAVIGATE],
    ...overrides,
  } as GatewayRequest;
}

function gatewayWith(clients: { local?: unknown; openai?: unknown }, Gateway = AIGateway): AIGateway {
  const gateway = new Gateway({ deterministicMode: true, auditEnabled: false });
  if (clients.local) (gateway as any).localClient = clients.local;
  if (clients.openai) (gateway as any).openaiClient = clients.openai;
  return gateway;
}

const withheldWarnings = () =>
  logSpies.warn.mock.calls.filter(([message]) => String(message).includes('LOCAL_AI_SUPPORTS_TOOLS'));

const savedEnv = process.env.LOCAL_AI_SUPPORTS_TOOLS;
beforeEach(() => {
  delete process.env.LOCAL_AI_SUPPORTS_TOOLS;
  logSpies.warn.mockClear();
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.LOCAL_AI_SUPPORTS_TOOLS;
  else process.env.LOCAL_AI_SUPPORTS_TOOLS = savedEnv;
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the local provider without LOCAL_AI_SUPPORTS_TOOLS', () => {
  it('sends no tools and no tool_choice, and the turn comes back as text', async () => {
    const client = completionClient();
    const gateway = gatewayWith({ local: client });

    const res = await (gateway as any).executeOpenAI(LOCAL, request({ toolChoice: 'none' }), 'req-1', Date.now());

    const params = sentParams(client);
    // Before the fix `params.tools` carries navigate_to to a server that never said it takes tools.
    expect(params).not.toHaveProperty('tools');
    expect(params).not.toHaveProperty('tool_choice');
    // The conversation is untouched, and she is told that this turn has no
    // hands — her prompt still describes tools and, driving, tells her to use
    // them, so without the note she says she opened a screen she cannot. With
    // no system prompt to carry it, the note is one, first.
    expect(params.messages).toEqual([
      { role: 'system', content: LOCAL_NO_TOOLS_NOTE },
      { role: 'user', content: 'take me to the vault' },
    ]);
    expect(res.content).toBe('The Vault holds your controlled documents.');
    expect(res.toolUses).toBeUndefined();
    expect(res.provider).toBe('local');
  });

  it('sends no tools on the streaming path either, and streams the text through', async () => {
    const client = streamClient();
    const gateway = gatewayWith({});
    const seen: string[] = [];

    const res = await (gateway as any).executeOpenAICompatibleStream(
      client,
      LOCAL,
      request({ stream: true, onStream: (chunk: string) => seen.push(chunk) }),
      'req-2',
      Date.now(),
    );

    expect(sentParams(client)).not.toHaveProperty('tools');
    expect(sentParams(client)).not.toHaveProperty('tool_choice');
    expect(sentParams(client).messages[0]).toEqual({ role: 'system', content: LOCAL_NO_TOOLS_NOTE });
    expect(seen.join('')).toBe('Here is the Vault.');
    expect(res.content).toBe('Here is the Vault.');
  });

  /* Many self-hosted chat templates (Mistral's, Gemma's) take a system
     message only first, and refuse the whole request over one anywhere else.
     The note used to be sent as a system message of its own after the
     conversation — so on such a server every turn that carried tools was the
     400 this path exists to spare it. It rides the leading system prompt,
     after what that prompt promised. */
  it('tells her at the end of the leading system prompt, never in a system message after the conversation', async () => {
    const shapes = [
      { stream: false, client: completionClient() },
      { stream: true, client: streamClient() },
    ];
    for (const { stream, client } of shapes) {
      const req = request({
        messages: [
          { role: 'system', content: 'You are AnA. Use navigate_to to take the person to a screen.' },
          { role: 'user', content: 'take me to the vault' },
          { role: 'assistant', content: 'Which program?' },
          { role: 'user', content: 'BX-301' },
        ],
        ...(stream ? { stream: true, onStream: () => {} } : {}),
      });
      if (stream) {
        await (gatewayWith({}) as any).executeOpenAICompatibleStream(client, LOCAL, req, 'req-2b', Date.now());
      } else {
        await (gatewayWith({ local: client }) as any).executeOpenAI(LOCAL, req, 'req-1b', Date.now());
      }
      const messages = sentParams(client).messages as Array<{ role: string; content: string }>;
      expect(messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(messages[0].content).toBe(
        `You are AnA. Use navigate_to to take the person to a screen.\n\n${LOCAL_NO_TOOLS_NOTE}`,
      );
    }
  });

  it('refuses a turn that was required to call a tool, as a 400, without sending it', async () => {
    // Answering it as text would be a turn that was told to act quietly not
    // acting. The 400 is not retried, does not count against the server's
    // health, and moves the fallback walk to a model that can honour it.
    for (const toolChoice of ['any', { type: 'tool', name: 'navigate_to' }] as const) {
      const client = completionClient();
      const gateway = gatewayWith({ local: client });

      const err = await (gateway as any)
        .executeOpenAI(LOCAL, request({ toolChoice: toolChoice as GatewayRequest['toolChoice'] }), 'req-3', Date.now())
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/LOCAL_AI_SUPPORTS_TOOLS=1/);
      expect(client.chat.completions.create).not.toHaveBeenCalled();
    }
  });
});

describe('the local provider with LOCAL_AI_SUPPORTS_TOOLS=1', () => {
  it('is offered tools exactly as openai is', async () => {
    process.env.LOCAL_AI_SUPPORTS_TOOLS = '1';
    const client = completionClient();
    const gateway = gatewayWith({ local: client });

    await (gateway as any).executeOpenAI(LOCAL, request({ toolChoice: 'any' }), 'req-4', Date.now());

    expect(sentParams(client).tools).toEqual([NAVIGATE_FUNCTION]);
    expect(sentParams(client).tool_choice).toBe('required');
    expect(withheldWarnings()).toHaveLength(0);
    // A server that takes tools is not told it has none.
    expect(JSON.stringify(sentParams(client).messages)).not.toContain(LOCAL_NO_TOOLS_NOTE);
  });

  it('is offered tools on the streaming path too', async () => {
    process.env.LOCAL_AI_SUPPORTS_TOOLS = '1';
    const client = streamClient();

    await (gatewayWith({}) as any).executeOpenAICompatibleStream(
      client,
      LOCAL,
      request({ stream: true, onStream: () => {} }),
      'req-5',
      Date.now(),
    );

    expect(sentParams(client).tools).toEqual([NAVIGATE_FUNCTION]);
  });
});

describe('openai — the withholding is per provider', () => {
  it('is offered tools with LOCAL_AI_SUPPORTS_TOOLS unset', async () => {
    const client = completionClient();
    const gateway = gatewayWith({ openai: client });

    await (gateway as any).executeOpenAI(GPT, request(), 'req-6', Date.now());

    expect(sentParams(client).tools).toEqual([NAVIGATE_FUNCTION]);
    expect(withheldWarnings()).toHaveLength(0);
  });
});

describe('the withholding is reported once per process', () => {
  it('warns on the first withheld round, names the switch, and is silent after', async () => {
    // A fresh module, so the once-per-process flag starts unset whatever ran
    // earlier in this file.
    vi.resetModules();
    const { AIGateway: FreshGateway } = await import('../gateway');
    const client = completionClient();
    const gateway = gatewayWith({ local: client }, FreshGateway);

    for (let round = 0; round < 3; round++) {
      await (gateway as any).executeOpenAI(LOCAL, request(), `req-7-${round}`, Date.now());
    }
    await (gateway as any).executeOpenAICompatibleStream(
      streamClient(),
      LOCAL,
      request({ stream: true, onStream: () => {} }),
      'req-7-stream',
      Date.now(),
    );

    const warnings = withheldWarnings();
    expect(warnings, 'the withholding was logged once per round instead of once').toHaveLength(1);
    expect(String(warnings[0][0])).toMatch(/local\/local-default: tools not offered/);
    // Every round was still withheld — only the report is once.
    for (const [params] of client.chat.completions.create.mock.calls) expect(params).not.toHaveProperty('tools');
  });
});

describe('route() — a deployment whose only provider is a local server', () => {
  it('answers a tool-bearing turn as text instead of failing it', async () => {
    const gateway = new AIGateway({
      deterministicMode: false,
      defaultStrategy: 'task_based',
      auditEnabled: false,
      providers: [
        { name: 'local', enabled: true, baseUrl: 'http://vllm.invalid/v1', defaultModel: 'local-default', models: [] },
      ],
      policy: {
        maxTokensPerRequest: 16_000,
        maxRequestsPerMinutePerOrg: 10_000,
        maxRequestsPerMinutePerUser: 10_000,
        blockedPatterns: [],
        contentFilters: false,
        piiDetection: false,
      },
    } as Partial<GatewayConfig>);
    // A server that, like many, refuses a request carrying tools outright.
    const create = vi.fn(async (params: any) => {
      if (params.tools) throw Object.assign(new Error('400 "tools" is not supported'), { status: 400 });
      return {
        model: 'local-default',
        choices: [{ message: { role: 'assistant', content: 'The Vault is under Documents.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 6, total_tokens: 16 },
      };
    });
    (gateway as any).localClient = { chat: { completions: { create } } };

    // Before the fix this rejects: the only rung 400s over the tools it was sent.
    const res = await gateway.route(request());

    expect(res.provider).toBe('local');
    expect(res.content).toBe('The Vault is under Documents.');
  });
});
