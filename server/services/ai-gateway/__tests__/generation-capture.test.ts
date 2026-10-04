/**
 * What a model wrote inside a tool call is known to the turn that ran it
 * (2026-10-04, AnA reasoning).
 *
 * AnA's answer check credits a figure or an identifier when it appears in a
 * source of the turn. A tool whose handler asks a model to write part of its
 * result (batch drafting, a drafting council, a plan narration) returns that
 * model's words as if they were data. A list of such tools would only be a
 * claim about them, and drift; the gateway knows at run time. Every generation
 * that succeeds inside a capture is noted there, and the check excludes what
 * the model wrote from what the tool's result can credit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const logSpies = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { AIGateway } from '../gateway';
import { newGenerationCapture, runCapturingGenerations } from '../generation-capture';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../providers/org-placement';
import type { GatewayRequest } from '../types';

function gatewayAnswering(reply: (req: GatewayRequest) => string | Error): AIGateway {
  const gateway = new AIGateway({
    deterministicMode: false,
    auditEnabled: true,
    providers: [{ name: 'anthropic', enabled: true, apiKey: 'x', defaultModel: 'x', models: [] }],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 10_000,
      maxRequestsPerMinutePerUser: 10_000,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: true,
    },
  });
  vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (model: any, req: any) => {
    const out = reply(req);
    if (out instanceof Error) throw out;
    return {
      content: out,
      provider: model.provider,
      model: model.model,
      requestId: 'fake',
      latencyMs: 1,
      cached: false,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    };
  });
  return gateway;
}

const ask = (content: string): GatewayRequest => ({
  taskType: 'document_drafting',
  organizationId: 42,
  messages: [{ role: 'user', content }],
});

afterEach(() => {
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

describe('the generation capture', () => {
  it('notes what a model wrote inside the capture', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering(() => 'ORR was 47% in 212 patients.');
    const capture = newGenerationCapture();

    await runCapturingGenerations(capture, () => gateway.route(ask('Draft 2.7.3.')));

    expect(capture.calls).toBe(1);
    expect(capture.texts).toEqual(['ORR was 47% in 212 patients.']);
    expect(capture.overflow).toBe(false);
  });

  it('notes nothing outside a capture, and a call outside is not noted inside', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering((req) => `echo ${req.messages[0].content}`);
    const capture = newGenerationCapture();

    await Promise.all([
      runCapturingGenerations(capture, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return gateway.route(ask('inside'));
      }),
      gateway.route(ask('outside')),
    ]);

    expect(capture.texts).toEqual(['echo inside']);
  });

  it('keeps two concurrent tool calls apart', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering((req) => `wrote for ${req.messages[0].content}`);
    const a = newGenerationCapture();
    const b = newGenerationCapture();

    await Promise.all([
      runCapturingGenerations(a, () => gateway.route(ask('a'))),
      runCapturingGenerations(b, async () => {
        await gateway.route(ask('b1'));
        return gateway.route(ask('b2'));
      }),
    ]);

    expect(a.texts).toEqual(['wrote for a']);
    expect(b.texts).toEqual(['wrote for b1', 'wrote for b2']);
  });

  it('a capture opened inside another also notes into the outer one', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering(() => 'inner draft');
    const outer = newGenerationCapture();
    const inner = newGenerationCapture();

    await runCapturingGenerations(outer, () => runCapturingGenerations(inner, () => gateway.route(ask('x'))));

    expect(inner.texts).toEqual(['inner draft']);
    expect(outer.texts).toEqual(['inner draft']);
  });

  it('a generation that failed wrote nothing the tool could return', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering(() => new Error('provider down'));
    const capture = newGenerationCapture();

    await runCapturingGenerations(capture, () => gateway.route(ask('x'))).catch(() => undefined);

    expect(capture.calls).toBe(0);
  });

  it('the tool calls a model chose inside the capture are noted too', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering(() => '');
    vi.spyOn(gateway as any, 'dispatchProvider').mockImplementation(async (model: any) => ({
      content: '',
      toolUses: [{ id: 't1', name: 'compute_x', input: { dose_mg: 240 } }],
      provider: model.provider,
      model: model.model,
      requestId: 'fake',
      latencyMs: 1,
      cached: false,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 },
    }));
    const capture = newGenerationCapture();

    await runCapturingGenerations(capture, () => gateway.route(ask('x')));

    expect(capture.calls).toBe(1);
    expect(capture.texts.join('\n')).toContain('"dose_mg":240');
  });

  it('a capture that outgrows its bound says so rather than keeping a part', async () => {
    setOrgPlacementResolver({ resolve: async () => null });
    const gateway = gatewayAnswering(() => 'x'.repeat(300_000));
    const capture = newGenerationCapture();

    await runCapturingGenerations(capture, async () => {
      await gateway.route(ask('1'));
      return gateway.route(ask('2'));
    });

    expect(capture.calls).toBe(2);
    expect(capture.overflow).toBe(true);
  });

  it('the stream captures every tool handler it runs', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../routes/ana-ri/stream.ts'), 'utf8');
    expect(src).toMatch(/runCapturingGenerations\(generated, \(\) =>\s*runWithRunScope\(\{ runId \}, \(\) =>\s*handler\(toolUse\.input, \{/);
  });
});
