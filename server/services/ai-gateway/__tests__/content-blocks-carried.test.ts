/**
 * An image or document is never sent to a provider that would not see it.
 *
 * The OpenAI-compatible and Moonshot executors send message text only. Until
 * 2026-09-23, a vision request (AnaDocumentDraftingService.analyzeImage pins
 * Sonnet, as document_analysis) whose Anthropic rungs failed walked the
 * fallback ladder onto gpt-4o, which answered from the instructions alone —
 * and the reply came back as an extraction of a scan it had never been given.
 */
import { describe, it, expect, vi } from 'vitest';
import { AIGateway, GatewayPolicyError, MediaNotCarriedError } from '../gateway';
import { classifyGatewayError } from '../gateway-error-map';
import type { GatewayRequest } from '../types';

function makeGateway() {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: false,
    providers: (['anthropic', 'openai'] as const).map(name => ({ name, enabled: true, apiKey: 'test-key', defaultModel: '', models: [] })),
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 1000,
      maxRequestsPerMinutePerUser: 1000,
      blockedPatterns: [],
      contentFilters: false,
      piiDetection: false,
    },
  } as any);
}

/** Anthropic is down; every other provider answers. Records who was dispatched. */
function anthropicDown(gateway: AIGateway) {
  const dispatched: string[] = [];
  vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (...args: unknown[]) => {
    const model = args[0] as { id: string; provider: string; model: string };
    dispatched.push(`${model.provider}:${model.id}`);
    if (model.provider === 'anthropic') throw new Error(`simulated outage on ${model.id}`);
    return {
      content: 'Extracted: lot 4411, expiry 2027-03',
      provider: model.provider,
      model: model.model,
      latencyMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 1, estimatedCostUsd: 0 },
      cached: false,
      finishReason: 'end_turn',
    };
  });
  return dispatched;
}

const visionRequest = (blocks: GatewayRequest['messages'][number]['contentBlocks']): GatewayRequest => ({
  taskType: 'document_analysis',
  provider: 'anthropic',
  model: 'claude-sonnet-4',
  messages: [{ role: 'user', content: 'Extract the lot number and expiry.', contentBlocks: blocks }],
  maxTokens: 500,
});

const IMAGE = { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: 'iVBORw0KGgo=' } };
const TEXT = { type: 'text' as const, text: 'Extract the lot number and expiry.' };

describe('media is never sent where it would be dropped', () => {
  it('an image request whose Anthropic rungs fail is refused, not answered by a text-only model', async () => {
    const gateway = makeGateway();
    const dispatched = anthropicDown(gateway);

    const err = await gateway.route(visionRequest([IMAGE, TEXT])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MediaNotCarriedError);
    expect(err).toBeInstanceOf(GatewayPolicyError); // terminal: no further rung is tried
    expect(dispatched.some(d => d.startsWith('openai:'))).toBe(false);
    expect(classifyGatewayError(err).message).toMatch(/can read the attached file/);
  });

  it('control: the same request without media falls back to another provider as before', async () => {
    const gateway = makeGateway();
    const dispatched = anthropicDown(gateway);

    const res = await gateway.route(visionRequest(undefined));

    expect(res.provider).toBe('openai');
    expect(dispatched.some(d => d.startsWith('openai:'))).toBe(true);
  });

  it('text-only content blocks are not media and are not refused', async () => {
    const gateway = makeGateway();
    anthropicDown(gateway);

    const res = await gateway.route(visionRequest([TEXT]));

    expect(res.provider).toBe('openai');
  });
});
