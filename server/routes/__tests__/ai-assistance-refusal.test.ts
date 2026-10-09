/**
 * /api/ai-assistance answers a gateway refusal as a refusal (D6).
 *
 * Both handlers caught a tenant placement refusal as an outage, re-sent the
 * refused content through the legacy router, and answered 200 with template
 * text marked `success: true` — so content the organization's placement
 * policy excluded read as a completed review (review finding, 2026-09-26).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const S = vi.hoisted(() => ({ gatewayCalls: 0, legacyCalls: 0 }));

function placementRefusal(): Error {
  const err = new Error(
    "DENY_TENANT_POLICY: this request was not sent to any AI service, because your organization's " +
      'data-placement policy does not permit it (anthropic is not an AI service the organization allows).',
  ) as Error & { reasonCode: string; stage: string };
  err.name = 'GatewayPolicyError';
  err.reasonCode = 'DENY_TENANT_POLICY';
  err.stage = 'selection';
  return err;
}

// Plain functions, not spies: a rejecting vi.fn reached through a mock is
// reported as a failure by this harness even when the route catches it.
vi.mock('../../lib/unified-ai-client.js', () => ({
  ai: {
    complete: async () => {
      S.gatewayCalls += 1;
      throw placementRefusal();
    },
  },
}));

let router: express.Router;
beforeEach(async () => {
  vi.resetModules();
  S.gatewayCalls = 0;
  S.legacyCalls = 0;
  process.env.OPENAI_API_KEY = 'test-key';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const mod = await import('../ai-assistance');
  mod.setAIService({
    route: async () => {
      S.legacyCalls += 1;
      return { content: 'legacy answer' };
    },
  } as never);
  router = mod.default as express.Router;
  await new Promise(r => setTimeout(r, 0));
});
afterEach(() => vi.restoreAllMocks());

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/ai-assistance', router);
  return a;
}

describe('a placement refusal is final on /api/ai-assistance', () => {
  it('/assist answers 403 with the reason, sends nothing to the legacy router, and invents no recommendation', async () => {
    const res = await request(app()).post('/api/ai-assistance/assist').send({ content: 'Review this CMC section.' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: { code: 'PLACEMENT_REFUSED' }, isRealAI: false });
    expect(res.body.error.message).toMatch(/placement policy/);
    expect(res.body.recommendation).toBeUndefined();
    expect(S.gatewayCalls).toBe(1);
    expect(S.legacyCalls).toBe(0);
  });

  it('/verify answers 403 and reports no verification', async () => {
    const res = await request(app()).post('/api/ai-assistance/verify').send({ content: 'The device met its endpoint.' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PLACEMENT_REFUSED');
    expect(res.body.credibility).toBeUndefined();
    expect(S.legacyCalls).toBe(0);
  });
});
