/**
 * Tests — the operator channel: a mid-conversation `role: 'system'` turn.
 *
 * ── What this is for ──────────────────────────────────────────────────────────
 * An instruction that arrives WHILE a turn is running — a human steering AnA
 * mid-answer — is neither the persona nor the user speaking. AnA carried it as
 * text appended to the tool-result user turn: the same message that carries
 * tool output, which is the untrusted half of the transcript. Nothing in the
 * prompt distinguished a human's redirect from a tool result that happened to
 * contain the same label.
 *
 * ── The bug that made the fix necessary ───────────────────────────────────────
 * `GatewayMessage.role` already allowed `'system'`, so this looked like it
 * would just work. It did not. Both Anthropic executors partitioned with
 * `messages.filter(m => m.role === 'system')` — a filter that ignores POSITION.
 * Every system message was hoisted into the top-level `system` parameter no
 * matter where it sat, so a mid-run instruction silently became part of the
 * persona. Worse, with prompt caching on (the agentic loop always sets it) a
 * hoisted steer can land on the cache breakpoint, invalidating the whole
 * cached prefix on every redirect.
 *
 * So the fix is a positional discriminator plus a partition fix, not a widening
 * of the role union — and the downgrade path has to be byte-identical to the
 * old wire format, which is what lets this land before anything depends on it.
 */

import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { GatewayMessage, GatewayRequest, ModelConfig } from '../types';

const base: Omit<ModelConfig, 'supportsInlineSystem'> = {
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

const CAPABLE: ModelConfig = { ...base, supportsInlineSystem: true };
const INCAPABLE: ModelConfig = { ...base, supportsInlineSystem: false };

/** Capture the params object the SDK would have been called with. */
async function sentParams(model: ModelConfig, messages: GatewayMessage[]) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  const create = vi.fn(async (..._args: unknown[]) => ({
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 1, output_tokens: 1 },
    stop_reason: 'end_turn',
    model: model.model,
  }));
  (gateway as any).anthropicClient = { messages: { create } };

  await (gateway as any).executeAnthropic(
    model,
    { taskType: 'chat', messages, maxTokens: 100 } as unknown as GatewayRequest,
    'req-1',
    Date.now(),
  );
  return create.mock.calls[0][0] as any;
}

const PERSONA: GatewayMessage = { role: 'system', content: 'You are AnA.' };
const ASK: GatewayMessage = { role: 'user', content: 'Draft section 2.5.' };
const WORKING: GatewayMessage = { role: 'assistant', content: 'Looking at the protocol.' };
const RESULTS: GatewayMessage = { role: 'user', content: '[Tool Result for search_document]: …' };
const STEER: GatewayMessage = {
  role: 'system',
  inlineSystem: true,
  content: 'Narrow to Class III devices only.',
};

describe('the operator channel, on a model that accepts it', () => {
  it('keeps the steer in messages[] and out of the persona', async () => {
    const params = await sentParams(CAPABLE, [PERSONA, ASK, WORKING, RESULTS, STEER]);

    // The persona is the ONLY thing in the system parameter. Before the
    // partition fix both system messages landed here.
    expect(params.system).toBe('You are AnA.');

    const roles = params.messages.map((m: any) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user', 'system']);
    expect(params.messages[3].content).toContain('Narrow to Class III');
  });

  it('leaves the cached prefix alone — the steer is not the breakpoint', async () => {
    const cached: GatewayMessage = { ...PERSONA, cacheControl: true };
    const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
    const create = vi.fn(async (..._args: unknown[]) => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: 'end_turn',
      model: CAPABLE.model,
    }));
    (gateway as any).anthropicClient = { messages: { create } };

    await (gateway as any).executeAnthropic(
      CAPABLE,
      {
        taskType: 'chat',
        messages: [cached, ASK, WORKING, RESULTS, STEER],
        maxTokens: 100,
        promptCache: { enabled: true, type: 'ephemeral' },
      } as unknown as GatewayRequest,
      'req-2',
      Date.now(),
    );

    const params = create.mock.calls[0][0] as any;
    // One system block, carrying the breakpoint — the steer did not join it
    // and did not displace it.
    expect(params.system).toHaveLength(1);
    expect(params.system[0].text).toBe('You are AnA.');
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('carries several steers in the order they were given', async () => {
    const second: GatewayMessage = { role: 'system', inlineSystem: true, content: 'And cite the guidance.' };
    const params = await sentParams(CAPABLE, [PERSONA, ASK, WORKING, RESULTS, STEER, second]);
    // The second follows a system turn, not a user turn, so the API's
    // placement rule sends it back to the persona — see the downgrade test.
    // What must NOT happen is losing it.
    const everywhere = JSON.stringify(params);
    expect(everywhere).toContain('And cite the guidance.');
  });
});

describe('the operator channel, downgraded', () => {
  it('folds into the preceding user turn, byte-identical to the old format', async () => {
    const params = await sentParams(INCAPABLE, [PERSONA, ASK, WORKING, RESULTS, STEER]);

    expect(params.system).toBe('You are AnA.');
    const roles = params.messages.map((m: any) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
    // Exactly the wire bytes the platform sent before the operator channel
    // existed. This is what makes the capability safe to ship on its own.
    expect(params.messages[2].content).toBe(
      '[Tool Result for search_document]: …\n\n[User interjection]: Narrow to Class III devices only.',
    );
  });

  it('a model that does not declare the capability is treated as not having it', async () => {
    // Omitted, not false. A capability we have not confirmed for an entry is
    // one we do not use for it — the same rule the substrate entries follow.
    const undeclared = { ...base } as ModelConfig;
    const params = await sentParams(undeclared, [PERSONA, ASK, WORKING, RESULTS, STEER]);
    expect(params.messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

describe('placement — an invalid shape is never sent', () => {
  it('never puts an operator turn first', async () => {
    // The API requires an inline system turn to follow a user turn and refuses
    // one at index 0. Losing the cache-preserving form costs far less than
    // losing the whole turn to a 400.
    const params = await sentParams(CAPABLE, [STEER, ASK]);
    expect(params.messages[0].role).toBe('user');
    expect(params.system).toContain('Narrow to Class III');
  });

  it('never puts an operator turn straight after an assistant turn', async () => {
    const params = await sentParams(CAPABLE, [PERSONA, ASK, WORKING, STEER]);
    const roles = params.messages.map((m: any) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
    expect(params.system).toContain('Narrow to Class III');
  });

  it('an ordinary system prompt still leads, wherever the caller put it', async () => {
    // Regression guard on the partition itself: a system message with no
    // inlineSystem flag behaves exactly as it always did.
    const params = await sentParams(CAPABLE, [PERSONA, ASK, { role: 'system', content: 'Also be terse.' }]);
    expect(params.system).toBe('You are AnA.\n\nAlso be terse.');
    expect(params.messages.map((m: any) => m.role)).toEqual(['user']);
  });
});
