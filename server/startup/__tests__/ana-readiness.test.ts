/**
 * Regression tests for the AnA readiness gate.
 *
 * The defect these exist to catch: a process with no AI provider configured
 * booted clean, reported `ready: true` on /readyz, took live traffic, and then
 * returned 503 GATEWAY_UNAVAILABLE on every single AnA turn. The platform was
 * up; the product was dead; nothing said so until a human typed a question.
 *
 * Per the repo working agreement, a gate that has only been seen to pass has
 * not been tested. The load-bearing case here is the LAST describe block:
 * every other dependency healthy, AnA down, and /readyz must still go red. If
 * the AnA check is ever removed from /readyz, that block fails and nothing
 * else does.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateAnaReadiness,
  getAnaReadiness,
  getAnaReadinessDetail,
  isAnaReadinessServing,
  logAnaReadinessBanner,
  resetAnaReadinessForTests,
  setAnaReadiness,
} from '../ana-readiness-state';
import { setSchemaReadiness, resetSchemaReadinessForTests } from '../readiness-state';
import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import { isolateLaneEnvironment, LANE, laneGateway, resetEmbeddingLaneFixtures } from './support/embedding-lane';

// The gateway is stubbed so each provider posture can be reproduced exactly.
// `gatewayStub` is reassigned per test; `getGateway` reads it at call time.
let gatewayStub: unknown;
let getGatewayThrows: Error | null = null;

// The embedding lane (DP-71): readiness embeds one short text through it
// before it says ready, so every case below meets a server, and the corpus
// check on the self-hosted lane. Both answer as healthy unless a case says
// otherwise (support/embedding-lane.ts).
vi.mock('openai', async () => (await import('./support/embedding-lane')).openaiModule);
vi.mock('../../services/embedding-corpus-policy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/embedding-corpus-policy')>()),
  findVectorsFromAnotherModel: (await import('./support/embedding-lane')).corpus.check,
}));
vi.mock('../../db/runtime.js', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }) }));

vi.mock('../../services/ai-gateway/index.js', () => ({
  getGateway: () => {
    if (getGatewayThrows) throw getGatewayThrows;
    return gatewayStub;
  },
}));

/**
 * Readiness now reads the model registry as well as the provider list (U3a),
 * so the stub carries one model per provider: the approved Claude flagship for
 * anthropic, an unapproved GPT for openai. The ids are real registry ids, so
 * the approval verdict is the canonical registry's, not the stub's.
 */
const STUB_MODEL_BY_PROVIDER: Record<string, { id: string; capabilities: string[] }> = {
  anthropic: { id: 'claude-opus-4', capabilities: ['chat', 'document_drafting', 'regulatory_review'] },
  openai: { id: 'gpt-4o', capabilities: ['chat', 'document_drafting', 'regulatory_review'] },
};

function gateway(opts: { providers: string[]; deterministic?: boolean }) {
  return {
    getEnabledProviders: () => opts.providers,
    isDeterministic: () => Boolean(opts.deterministic),
    getModels: () =>
      opts.providers
        .filter((p) => STUB_MODEL_BY_PROVIDER[p])
        .map((p) => ({ ...STUB_MODEL_BY_PROVIDER[p], provider: p, enabled: true })),
  };
}

beforeEach(async () => {
  resetAnaReadinessForTests();
  resetSchemaReadinessForTests();
  gatewayStub = gateway({ providers: ['anthropic'] });
  getGatewayThrows = null;
  await resetEmbeddingLaneFixtures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateAnaReadiness', () => {
  it('reports no_provider — the incident — when the gateway has zero providers', async () => {
    gatewayStub = gateway({ providers: [] });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('no_provider');
    expect(isAnaReadinessServing(state)).toBe(false);
    // The detail has to name the fix. An operator reading a red probe at 2am
    // should not have to grep the source to learn which variable is missing.
    expect(getAnaReadinessDetail()).toContain('ANTHROPIC_API_KEY');
  });

  it('reports ready and names the providers when at least one is enabled', async () => {
    gatewayStub = gateway({ providers: ['anthropic', 'openai'] });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('ready');
    expect(isAnaReadinessServing(state)).toBe(true);
    expect(getAnaReadinessDetail()).toContain('anthropic');
  });

  it('reports deterministic — never ready — when the fixture mode is opted into', async () => {
    // Deterministic mode has no providers by design. Reporting it as
    // `no_provider` would call a deliberate test posture an outage; reporting
    // it as `ready` would let canned fixtures pass for live model output.
    gatewayStub = gateway({ providers: [], deterministic: true });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('deterministic');
    expect(state).not.toBe('ready');
    expect(isAnaReadinessServing(state)).toBe(true);
  });

  it('reports error rather than throwing when the gateway cannot be constructed', async () => {
    getGatewayThrows = new Error('provider config is malformed');

    const state = await evaluateAnaReadiness();

    expect(state).toBe('error');
    expect(isAnaReadinessServing(state)).toBe(false);
    expect(getAnaReadinessDetail()).toContain('provider config is malformed');
  });

  it('reports error when getGateway returns nothing', async () => {
    gatewayStub = null;

    expect(await evaluateAnaReadiness()).toBe('error');
  });

  it('defaults to unknown, and unknown does not serve', async () => {
    // 'unknown' means no boot path recorded a verdict. That is not a yes.
    expect(getAnaReadiness()).toBe('unknown');
    expect(isAnaReadinessServing()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// U3a — a provider is not the same thing as a drafting model.
//
// Production passed OPENAI_API_KEY alone. Every model approvedForHighRisk in
// ai-governance/approved-models.ts is Claude, so the gateway refused every
// Authoring draft with ModelNotApprovedError — while /readyz said ana 'ok',
// because readiness counted providers and nothing else.
//
// These cases build the REAL gateway from the environment, not a stub: the
// defect lived in the gap between the gateway's registry, its per-provider
// enablement and the approval registry, and a hand-written stub would encode
// the test author's idea of that gap rather than the code's.

describe('evaluateAnaReadiness — regulatory drafting needs an approved model (U3a)', () => {
  const ENV_KEYS = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'KIMI_API_KEY',
    'MOONSHOT_API_KEY',
    'AI_BEDROCK_ENABLED',
    'AI_VERTEX_ENABLED',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AI_LOCAL_ENABLED',
    'AI_GATEWAY_DETERMINISTIC',
    'DETERMINISTIC_MODE',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  /** The production gateway, built from whatever keys the env carries now. */
  async function realGateway(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    Object.assign(process.env, env);
    const { AIGateway } = await vi.importActual<typeof import('../../services/ai-gateway/gateway')>(
      '../../services/ai-gateway/gateway'
    );
    return new AIGateway({ auditEnabled: false });
  }

  it('is NOT serving on an OpenAI-only deployment — the production posture', async () => {
    gatewayStub = await realGateway({ OPENAI_API_KEY: 'sk-test-openai-only' });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('no_high_risk_model');
    expect(isAnaReadinessServing(state)).toBe(false);
    // The detail must say what is missing and what would fix it, in terms an
    // operator can act on without reading approved-models.ts first.
    const detail = getAnaReadinessDetail();
    expect(detail).toContain('openai');
    expect(detail).toMatch(/approved for regulatory drafting/);
    expect(detail).toContain('claude-opus-4');
    expect(detail).toContain('anthropic');
    expect(detail).toContain('bedrock');
  });

  it('is serving when an Anthropic key is present, and names the drafting model', async () => {
    gatewayStub = await realGateway({ ANTHROPIC_API_KEY: 'sk-ant-test' });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('ready');
    expect(isAnaReadinessServing(state)).toBe(true);
    expect(getAnaReadinessDetail()).toContain('claude-opus-4');
  });

  it('is serving with OpenAI and Anthropic together', async () => {
    gatewayStub = await realGateway({ OPENAI_API_KEY: 'sk-test', ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(await evaluateAnaReadiness()).toBe('ready');
  });

  it('is serving on Bedrock alone — the private-cloud drafting path counts', async () => {
    gatewayStub = await realGateway({ AI_BEDROCK_ENABLED: 'true' });

    expect(await evaluateAnaReadiness()).toBe('ready');
    expect(getAnaReadinessDetail()).toContain('claude-opus-4-bedrock');
  });

  it('still reports no_provider — not no_high_risk_model — when nothing is configured', async () => {
    gatewayStub = await realGateway({});

    expect(await evaluateAnaReadiness()).toBe('no_provider');
  });

  it('fails closed when the gateway exposes no model registry to check', async () => {
    // A gateway readiness cannot inspect is not a gateway readiness may pass.
    gatewayStub = { getEnabledProviders: () => ['anthropic'], isDeterministic: () => false };

    const state = await evaluateAnaReadiness();

    expect(isAnaReadinessServing(state)).toBe(false);
    expect(getAnaReadinessDetail()).toMatch(/model registry/);
  });

  it('/readyz answers 503 with ana down on an OpenAI-only deployment', async () => {
    gatewayStub = await realGateway({ OPENAI_API_KEY: 'sk-test-openai-only' });
    await evaluateAnaReadiness();
    setSchemaReadiness('ready', '');
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TLS_URL;
    const a = express();
    mountFastPathHealthEndpoints(a, { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never);

    const res = await request(a).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.dependencies.ana).toBe('down');
    expect(res.body.anaState).toBe('no_high_risk_model');
    expect(res.body.anaDetail).toMatch(/approved for regulatory drafting/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//
// R4 (P1-54) — a lane an organization must elect is not a lane for every
// organization.
//
// In production the gateway applies the provider election (ADR-0014 §1,
// P1-45): OpenAI, Azure and Vertex serve an organization only when its
// placement policy names them. Readiness counted lanes without asking whom
// they serve, so a deployment whose embeddings ran only on OpenAI (the default
// when EMBEDDING_PROVIDER is unset), or whose only drafting model was Claude on
// Vertex, reported ready while every organization that had not elected that
// vendor was refused — Vault search for all of them, or every draft.
//
// Built from the real gateway and the real embedding seam, as U3a is.

// The environment helpers (LANE, isolateLaneEnvironment, laneGateway) are in
// support/embedding-lane.ts, shared with ana-readiness-embedding-probe.test.ts.

describe('evaluateAnaReadiness — an embedding lane an organization must elect (R4, P1-54)', () => {
  isolateLaneEnvironment();

  it('is NOT serving in production when embeddings run on OpenAI, the default lane', async () => {
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test' });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('needs_election');
    expect(isAnaReadinessServing(state)).toBe(false);
    const detail = getAnaReadinessDetail();
    expect(detail).toContain('openai');
    expect(detail).toMatch(/Vault and knowledge-base search/);
    expect(detail).toContain('EMBEDDING_PROVIDER=local');
  });

  it('an OpenAI key does not make the OpenAI lane serve an organization that has not elected it', async () => {
    gatewayStub = await laneGateway('production', {
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: 'sk-test-openai',
      EMBEDDING_PROVIDER: 'openai',
    });

    expect(await evaluateAnaReadiness()).toBe('needs_election');
  });

  it('is serving in production with the self-hosted embedding lane, and says which lane embeds', async () => {
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('ready');
    expect(isAnaReadinessServing(state)).toBe(true);
    expect(getAnaReadinessDetail()).toContain('embeddings: local');
  });

  it('is NOT serving when the self-hosted lane names no address', async () => {
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', EMBEDDING_PROVIDER: 'local' });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('no_embedding_lane');
    expect(isAnaReadinessServing(state)).toBe(false);
    expect(getAnaReadinessDetail()).toContain('EMBEDDING_LOCAL_BASE_URL');
  });

  it('outside production nothing needs an election, so the default embedding lane does not change the verdict', async () => {
    gatewayStub = await laneGateway('development', { ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(await evaluateAnaReadiness()).toBe('ready');
  });

  it('/readyz answers 503 with ana down when the only embedding lane needs an election', async () => {
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test' });
    await evaluateAnaReadiness();
    setSchemaReadiness('ready', '');
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TLS_URL;
    const a = express();
    mountFastPathHealthEndpoints(a, { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never);

    const res = await request(a).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.dependencies.ana).toBe('down');
    expect(res.body.anaState).toBe('needs_election');
    expect(res.body.anaDetail).toContain('EMBEDDING_PROVIDER=local');
  });
});

// DP-71 (the lane is ready only once it has embedded at the corpus width) is
// pinned in ana-readiness-embedding-probe.test.ts.

describe('evaluateAnaReadiness — a drafting lane an organization must elect (R4, P1-54)', () => {
  isolateLaneEnvironment();

  it('is NOT serving in production when drafting runs only on Vertex, a lane an organization must elect', async () => {
    gatewayStub = await laneGateway('production', { AI_VERTEX_ENABLED: 'true', ...LANE });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('needs_election');
    expect(isAnaReadinessServing(state)).toBe(false);
    const detail = getAnaReadinessDetail();
    expect(detail).toContain('claude-opus-4-vertex');
    expect(detail).toMatch(/regulatory drafting/);
    // The remedy names the lanes every organization reaches, from the registry.
    expect(detail).toContain('anthropic');
    expect(detail).toContain('bedrock');
  });

  it('Vertex beside Anthropic is serving: every organization still has a drafting lane', async () => {
    gatewayStub = await laneGateway('production', { AI_VERTEX_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    expect(await evaluateAnaReadiness()).toBe('ready');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('logAnaReadinessBanner', () => {
  it('prints to console.error when AnA cannot answer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('no_provider', 'No AI provider is configured.');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    // The banner is the half of the fix aimed at a human at a terminal, so its
    // job is to be unskimmable. Assert the words that carry the meaning.
    expect(spy.mock.calls[0][0]).toContain('AnA CANNOT ANSWER');
    expect(spy.mock.calls[0][0]).toContain('503 GATEWAY_UNAVAILABLE');
  });

  it('warns — not errors — that responses are fixtures in deterministic mode', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setAnaReadiness('deterministic', 'AI_GATEWAY_DETERMINISTIC is set');

    logAnaReadinessBanner();

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('DETERMINISTIC');
  });

  it('says drafting — not chat — is what failed when no model is approved for it', () => {
    // The 'AnA CANNOT ANSWER … every chat turn will fail' banner would be false
    // here: chat is answered. What fails is every draft.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('no_high_risk_model', 'AI provider(s) enabled: openai — but no enabled model is approved');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('AnA CANNOT DRAFT');
    expect(spy.mock.calls[0][0]).not.toContain('Every chat turn will fail');
    expect(spy.mock.calls[0][0]).toContain('NOT READY');
  });

  it('says who is refused when a lane serves elected organizations only (R4)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('needs_election', 'The embedding lane is openai (EMBEDDING_PROVIDER)');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('ELECTED');
    expect(spy.mock.calls[0][0]).toContain('The embedding lane is openai');
    expect(spy.mock.calls[0][0]).not.toContain('Every chat turn will fail');
    expect(spy.mock.calls[0][0]).toContain('NOT READY');
  });

  it('says search is what fails when the embedding lane cannot be built (R4)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('no_embedding_lane', 'EMBEDDING_PROVIDER=local requires EMBEDDING_LOCAL_BASE_URL');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('EMBEDDING LANE');
    expect(spy.mock.calls[0][0]).not.toContain('Every chat turn will fail');
    expect(spy.mock.calls[0][0]).toContain('NOT READY');
  });

  it('says search is what fails when the embedding lane has not answered at the corpus width (DP-71)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('embedding_lane_down', 'The embedding lane local could not be reached');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('AnA CANNOT SEARCH');
    expect(spy.mock.calls[0][0]).toContain('could not be reached');
    expect(spy.mock.calls[0][0]).not.toContain('Every chat turn will fail');
    expect(spy.mock.calls[0][0]).toContain('NOT READY');
  });

  it('says a corpus must be re-embedded when it holds vectors another model wrote (DP-71)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAnaReadiness('embedding_corpus_unverified', 'vault.document_chunks holds 4 vectors');

    logAnaReadinessBanner();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('ANOTHER MODEL');
    expect(spy.mock.calls[0][0]).toContain('vault.document_chunks');
    expect(spy.mock.calls[0][0]).toContain('NOT READY');
  });

  it('stays quiet on the happy path', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    setAnaReadiness('ready', 'AnA has 1 provider(s): anthropic');

    logAnaReadinessBanner();

    expect(errSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('/readyz — AnA is load-bearing', () => {
  /** A pool whose `select 1` succeeds, so `database` is never the failing dep. */
  const livePool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never;

  function app() {
    const a = express();
    mountFastPathHealthEndpoints(a, livePool);
    return a;
  }

  beforeEach(() => {
    // Everything except AnA is healthy for every case below, so AnA is the
    // only variable. Redis is unconfigured, which /readyz skips by design.
    setSchemaReadiness('ready', '');
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TLS_URL;
  });

  it('is NOT ready when AnA has no provider, with every other dependency green', async () => {
    // ── The regression. This is the exact production posture that shipped: a
    // healthy database, a verified schema, all routes mounted — and an AnA who
    // 503s on every turn. It used to answer 200 ready:true.
    setAnaReadiness('no_provider', 'No AI provider is configured. Set ANTHROPIC_API_KEY');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.failed).toEqual(['ana']);
    expect(res.body.dependencies.database).toBe('ok');
    expect(res.body.dependencies.schema).toBe('ok');
    expect(res.body.dependencies.ana).toBe('down');
    expect(res.body.anaDetail).toContain('ANTHROPIC_API_KEY');
  });

  it('is NOT ready when AnA readiness was never evaluated', async () => {
    // 'unknown' is the default. If a boot path ever returns without recording
    // a verdict, the probe must fail rather than assume the best.
    resetAnaReadinessForTests();

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.failed).toContain('ana');
    expect(res.body.anaDetail).toContain('never verified');
  });

  it('is NOT ready when the gateway failed to construct', async () => {
    setAnaReadiness('error', 'AI gateway could not be constructed: bad config');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(503);
    expect(res.body.failed).toContain('ana');
  });

  it('is ready when AnA has a live provider', async () => {
    setAnaReadiness('ready', 'AnA has 1 provider(s): anthropic');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.dependencies.ana).toBe('ok');
    expect(res.body.anaState).toBe('ready');
  });

  it('serves in deterministic mode but says so on the success path', async () => {
    // A 200 that hides the fixture posture is how "it looked fine in staging"
    // happens. The distinction has to survive onto the healthy response.
    setAnaReadiness('deterministic', 'AI_GATEWAY_DETERMINISTIC is set — fixed responses');

    const res = await request(app()).get('/readyz');

    expect(res.status).toBe(200);
    expect(res.body.anaState).toBe('deterministic');
    expect(res.body.anaDetail).toContain('AI_GATEWAY_DETERMINISTIC');
  });
});
