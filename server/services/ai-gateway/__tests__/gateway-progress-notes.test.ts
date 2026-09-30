/**
 * AnA's narration between moves, on a model that returns it as thinking.
 *
 * On Opus 5.5 a note longer than a sentence or two, written between tool
 * calls, comes back as a progress-update thinking block, empty under the
 * default display (claude-api skill, shared/model-migration.md). Reproduced
 * in the browser against a stand-in that returns notes that way: with every
 * round on the flagship, the training demonstration's three-sentence talking
 * points came back empty, and stops 1, 2 and 12 were never narrated. The
 * screens moved in silence.
 *
 * No live API: the client hands back what the SDK would.
 */
import { describe, expect, it, vi } from 'vitest';

import { AIGateway, DEFAULT_MODELS } from '../gateway';
import {
  INTERRUPTED_WORK_TEXT,
  PROGRESS_UPDATES_BETA,
  addBetaHeader,
  asParagraph,
  wantsProgressUpdates,
} from '../progress-updates';
import type { GatewayRequest, ModelConfig } from '../types';

const opus55 = DEFAULT_MODELS.find(m => m.model === 'claude-opus-5-5') as ModelConfig;
const opus5 = DEFAULT_MODELS.find(m => m.model === 'claude-opus-5') as ModelConfig;
const tools = [{ name: 'navigate_to', description: 'go', input_schema: { type: 'object', properties: {} } }];
const NOTE = 'Here is the Vault, where every source is tracked from captured to filed.';

function request(over: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [{ role: 'user', content: 'give me the training demo' }],
    maxTokens: 4096,
    tools,
    stream: true,
    onStream: () => {},
    ...over,
  } as unknown as GatewayRequest;
}

function sdkStream(events: Record<string, unknown>[]) {
  return {
    controller: new AbortController(),
    async *[Symbol.asyncIterator]() {
      yield* events;
    },
  };
}

function gatewayReturning(reply: unknown) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false }) as any;
  const create = vi.fn(async () => reply);
  gateway.anthropicClient = { messages: { create } };
  return { gateway, create };
}

const thinkingBlock = (index: number, text: string) => [
  { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } },
  ...(text ? [{ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: text } }] : []),
  { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig' } },
  { type: 'content_block_stop', index },
];
const textBlock = (index: number, text: string) => [
  { type: 'content_block_start', index, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index },
];
const toolBlock = (index: number) => [
  { type: 'content_block_start', index, content_block: { type: 'tool_use', id: 'toolu_1', name: 'navigate_to', input: {} } },
  { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: '{"target":"vault"}' } },
  { type: 'content_block_stop', index },
];
const reply = (...blocks: Record<string, unknown>[][]) => [
  { type: 'message_start', message: { model: 'claude-opus-5-5', usage: { input_tokens: 10 } } },
  ...blocks.flat(),
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
];

async function streamed(model: ModelConfig, events: Record<string, unknown>[], over: Partial<GatewayRequest> = {}) {
  const { gateway, create } = gatewayReturning(sdkStream(events));
  const shown: string[] = [];
  const reasoning: string[] = [];
  const onStream = (chunk: string, meta?: { type?: string; thinkingContent?: string }) => {
    if (meta?.type === 'thinking') reasoning.push(meta.thinkingContent ?? '');
    else shown.push(chunk);
  };
  const res = await gateway.executeAnthropicStream(model, request({ onStream, ...over } as any), 'r', Date.now());
  const [params, options] = create.mock.calls[0] as unknown as [any, any];
  return { res, shown: shown.join(''), reasoning: reasoning.join(''), params, beta: options?.headers?.['anthropic-beta'] ?? '' };
}

describe('Opus 5.5: the notes between moves are asked for, and shown as her words', () => {
  it('the registry says so for Opus 5.5, and for no model the docs do not name', () => {
    expect(opus55.progressUpdatesInThinking).toBe(true);
    const documented = /^claude-(opus-5-5|fable-5-1|fable-5|mythos-5-1)$/;
    for (const m of DEFAULT_MODELS.filter(e => e.progressUpdatesInThinking)) expect(m.model).toMatch(documented);
  });

  it('asks for display "updates", with the beta that display needs', async () => {
    const { params, beta } = await streamed(opus55, reply(toolBlock(0)));
    expect(params.thinking).toEqual({ type: 'adaptive', display: 'updates' });
    expect(beta.split(',')).toContain(PROGRESS_UPDATES_BETA);
  });

  it('a note comes back as text, before the move it introduces, and is not reasoning', async () => {
    const { res, shown, reasoning } = await streamed(opus55, reply(thinkingBlock(0, ''), thinkingBlock(1, NOTE), toolBlock(2)));
    expect(res.content, 'the talking point never reached the person').toBe(NOTE);
    expect(shown).toBe(NOTE);
    expect(reasoning).toBe('');
    expect(res.thinking).toBeUndefined();
    expect(res.toolUses?.[0]).toMatchObject({ name: 'navigate_to', input: { target: 'vault' } });
  });

  it("the API's placeholder for unfinished work is never shown as hers", async () => {
    const { res, shown } = await streamed(opus55, reply(thinkingBlock(0, INTERRUPTED_WORK_TEXT), toolBlock(1)));
    expect(res.content).toBe('');
    expect(shown).toBe('');
  });

  it('text around a note keeps to its own paragraph', async () => {
    const { res, shown } = await streamed(opus55, reply(textBlock(0, 'First, Projects.'), thinkingBlock(1, NOTE), textBlock(2, 'Opening it.'), toolBlock(3)));
    expect(res.content).toBe(`First, Projects.\n\n${NOTE}\n\nOpening it.`);
    expect(shown).toBe(res.content);
  });

  it('the non-streamed path reads the same notes', async () => {
    const { gateway, create } = gatewayReturning({
      content: [
        { type: 'thinking', thinking: '', signature: 's1' },
        { type: 'thinking', thinking: NOTE, signature: 's2' },
        { type: 'tool_use', id: 'toolu_1', name: 'navigate_to', input: { target: 'vault' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const res = await gateway.executeAnthropic(opus55, request({ stream: false, onStream: undefined }), 'r', Date.now());
    const [params, options] = create.mock.calls[0] as unknown as [any, any];
    expect(params.thinking).toEqual({ type: 'adaptive', display: 'updates' });
    expect(options.headers['anthropic-beta']).toContain(PROGRESS_UPDATES_BETA);
    expect(res.content).toBe(NOTE);
    expect(res.thinking).toBeUndefined();
  });
});

describe('everywhere else, thinking stays reasoning', () => {
  it('Opus 5 writes its notes as text: no display, no beta, its thinking is reasoning', async () => {
    const { res, reasoning, params, beta } = await streamed(opus5, reply(thinkingBlock(0, 'Weighing the stops.'), textBlock(1, NOTE), toolBlock(2)));
    expect(params.thinking).toBeUndefined();
    expect(beta).not.toContain(PROGRESS_UPDATES_BETA);
    expect(reasoning).toBe('Weighing the stops.');
    expect(res.content).toBe(NOTE);
  });

  it('a turn that asked for visible reasoning keeps its summary in the reasoning panel', async () => {
    const { res, reasoning, params, beta } = await streamed(opus55, reply(thinkingBlock(0, 'Weighing the stops.'), toolBlock(1)), {
      thinking: { enabled: true, budgetTokens: 8000 },
    });
    expect(params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(beta).not.toContain(PROGRESS_UPDATES_BETA);
    expect(reasoning).toBe('Weighing the stops.');
    expect(res.content).toBe('');
  });

  it('a request with no tools has no notes between calls to ask for', () => {
    expect(wantsProgressUpdates(opus55, { tools: [] })).toBe(false);
    expect(wantsProgressUpdates(opus55, {})).toBe(false);
    expect(wantsProgressUpdates(opus55, { tools } as any)).toBe(true);
  });
});

describe('the helpers', () => {
  it('asParagraph breaks only text that would run on', () => {
    expect(asParagraph('on screen.', 'Stop 2: Projects.')).toBe('\n\nStop 2: Projects.');
    expect(asParagraph('on screen.\n', 'Stop 2.')).toBe('Stop 2.');
    expect(asParagraph('on screen.', ' Stop 2.')).toBe(' Stop 2.');
    expect(asParagraph('', 'Stop 1.')).toBe('Stop 1.');
  });

  it('addBetaHeader keeps a beta already on the request', () => {
    const options: Record<string, unknown> = { headers: { 'anthropic-beta': 'files-api-2025-04-14' } };
    addBetaHeader(options, PROGRESS_UPDATES_BETA);
    addBetaHeader(options, PROGRESS_UPDATES_BETA);
    expect((options.headers as Record<string, string>)['anthropic-beta']).toBe(`files-api-2025-04-14,${PROGRESS_UPDATES_BETA}`);
  });
});
