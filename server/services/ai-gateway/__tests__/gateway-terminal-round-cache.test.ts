/**
 * The terminal round stopped rebuilding the entire prompt cache.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * AnA's agentic loop runs its last round with `includeTools === false` to force
 * a grounded text answer instead of more tool calls. Both loops implemented that
 * by REMOVING the tools array from the request:
 *
 *     ...(includeTools && streamTools.length > 0 ? { tools: streamTools } : {})
 *     if (!includeTools) { delete roundRequest.tools; }
 *
 * Anthropic's prompt cache is a prefix match rendered `tools -> system ->
 * messages`, and its invalidation hierarchy has exactly one change that
 * preserves NO cache tier at all: a change to the tool DEFINITIONS. Removing the
 * array is such a change. So the final round of every single turn rebuilt tools,
 * system AND messages from scratch — at the moment the conversation was longest
 * and the rebuild most expensive.
 *
 * `tool_choice: 'none'` forbids tool use while leaving the definitions alone. It
 * sits on the row that preserves the tools and system caches and invalidates
 * only the messages tier, which the new turn's content was going to invalidate
 * anyway. Same behaviour — a grounded answer, no tool calls — for one cache tier
 * instead of none.
 *
 * ── Why 'none' specifically ───────────────────────────────────────────────────
 * The other forced-choice values are not interchangeable here: `any` and
 * `{type:'tool'}` are rejected on some current models. `none` is not.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AIGateway } from '../gateway';
import type { GatewayRequest, ModelConfig } from '../types';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const STREAM = readFileSync(path.join(repoRoot, 'server', 'routes', 'ana-ri', 'stream.ts'), 'utf8');
const EXECUTOR = readFileSync(
  path.join(repoRoot, 'server', 'services', 'ana', 'AnaToolExecutor.ts'),
  'utf8',
);

const MODEL: ModelConfig = {
  id: 'claude-opus-4',
  provider: 'anthropic',
  model: 'claude-opus-5',
  contextWindow: 1_000_000,
  qualityScore: 99,
  costPer1kInput: 0.005,
  costPer1kOutput: 0.025,
  capabilities: ['chat'],
  enabled: true,
  thinkingMode: 'adaptive',
  supportsSamplingParams: false,
};

const TOOLS = [
  { name: 'search_document', description: 'x', input_schema: { type: 'object' as const, properties: {} } },
];

async function call(request: Partial<GatewayRequest>) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  const create = vi.fn(async (..._args: unknown[]) => ({
    content: [{ type: 'text', text: 'the grounded answer' }],
    usage: { input_tokens: 5, output_tokens: 9 },
    stop_reason: 'end_turn',
    model: MODEL.model,
  }));
  (gateway as any).anthropicClient = { messages: { create } };
  await (gateway as any).executeAnthropic(
    MODEL,
    { taskType: 'chat', messages: [{ role: 'user', content: 'go' }], maxTokens: 500, ...request } as GatewayRequest,
    'req-1',
    Date.now(),
  );
  return create.mock.calls[0][0] as any;
}

describe('tool_choice reaches the wire', () => {
  it("sends tool_choice none while KEEPING the tools array", async () => {
    // Both halves matter. Without the tools array this is the old behaviour by
    // another name; without tool_choice the model is free to call them.
    const params = await call({ tools: TOOLS as any, toolChoice: 'none' });
    expect(params.tool_choice).toEqual({ type: 'none' });
    expect(params.tools).toHaveLength(1);
    expect(params.tools[0].name).toBe('search_document');
  });

  it('leaves tool_choice off when the caller set none', async () => {
    const params = await call({ tools: TOOLS as any });
    expect(params.tool_choice).toBeUndefined();
    expect(params.tools).toHaveLength(1);
  });

  it('still maps the other choices it always did', async () => {
    expect((await call({ tools: TOOLS as any, toolChoice: 'auto' })).tool_choice).toEqual({
      type: 'auto',
    });
    expect(
      (await call({ tools: TOOLS as any, toolChoice: { type: 'tool', name: 'search_document' } }))
        .tool_choice,
    ).toEqual({ type: 'tool', name: 'search_document' });
  });
});

describe('neither loop withdraws its tools any more', () => {
  it('the streaming route keeps the array on every round', () => {
    // The old form is the regression to guard: it reads as a tidy conditional
    // and costs the whole cache once per turn.
    expect(STREAM).not.toMatch(/includeTools && streamTools\.length > 0 \? \{ tools: streamTools \}/);
    expect(STREAM).toMatch(/\.\.\.\(streamTools\.length > 0 \? \{ tools: streamTools \} : \{\}\)/);
    expect(STREAM).toMatch(/includeTools \? \{\} : \{ toolChoice: 'none'/);
  });

  it('the non-SSE loop does the same', () => {
    expect(EXECUTOR).not.toMatch(/delete roundRequest\.tools;/);
    expect(EXECUTOR).toMatch(/roundRequest\.toolChoice = 'none';/);
  });

  it('both still forbid tool use on the terminal round — the behaviour is unchanged', () => {
    // The point is that the ANSWER is still grounded and tool-free. If a future
    // edit drops the tool_choice while keeping the array, the terminal round
    // would be free to call more tools and the loop would not terminate.
    expect(STREAM).toMatch(/toolChoice: 'none'/);
    expect(EXECUTOR).toMatch(/toolChoice = 'none'/);
  });
});
