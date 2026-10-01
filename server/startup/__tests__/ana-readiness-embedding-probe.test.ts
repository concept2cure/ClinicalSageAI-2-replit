/**
 * DP-71 (ADR-0014 §1.5, amended 2026-10-01: "Readiness tells the truth").
 *
 * Round 1 of P1-54 reported the self-hosted embedding lane ready because it
 * could be built and served every organization, while every embedding through
 * it was refused by the server: the runtime asked a 1024-wide model for 1536
 * values. A deployment is not ready for search until the lane has embedded one
 * text at the corpus width. The probe does that through the seam itself
 * (embedding-provider.ts::probeEmbeddingLane), so readiness and search cannot
 * disagree about the lane; for the self-hosted lane readiness also asks whether
 * any corpus holds vectors another model wrote.
 *
 * Built from the real gateway and the real embedding seam, as the R4 cases in
 * ana-readiness.test.ts are; the server behind the lane and the corpus check
 * are support/embedding-lane.ts. The red run (readiness from configuration) is
 * filed under docs/evidence/D6/2026-10-01-tranche-4/P1-54-embedding-lane/round-2/red/.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMBEDDING_PROBE_RETRY_MS,
  evaluateAnaReadiness,
  getAnaReadiness,
  getAnaReadinessDetail,
  isAnaReadinessServing,
  resetAnaReadinessForTests,
} from '../ana-readiness-state';
import { setSchemaReadiness, resetSchemaReadinessForTests } from '../readiness-state';
import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import {
  corpus,
  embeddingServer,
  isolateLaneEnvironment,
  LANE,
  laneGateway,
  resetEmbeddingLaneFixtures,
  teiServingBgeM3,
} from './support/embedding-lane';

// The gateway readiness inspects: each case builds the real one for its
// deployment (laneGateway) and hands it over here.
let gatewayStub: unknown;

vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: () => gatewayStub }));
vi.mock('openai', async () => (await import('./support/embedding-lane')).openaiModule);
vi.mock('../../services/embedding-corpus-policy.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/embedding-corpus-policy')>()),
  findVectorsFromAnotherModel: (await import('./support/embedding-lane')).corpus.check,
}));
vi.mock('../../db/runtime.js', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }) }));

beforeEach(async () => {
  resetAnaReadinessForTests();
  resetSchemaReadinessForTests();
  gatewayStub = undefined;
  await resetEmbeddingLaneFixtures();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('evaluateAnaReadiness — the embedding lane is ready only once it has embedded at the corpus width (DP-71)', () => {
  isolateLaneEnvironment();

  it('configuration alone is not a verdict: with the server unreachable the lane is NOT serving, and says why', async () => {
    embeddingServer.create.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.10.1.37:8080'), { name: 'APIConnectionError' }),
    );
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('embedding_lane_down');
    expect(isAnaReadinessServing(state)).toBe(false);
    const detail = getAnaReadinessDetail();
    expect(detail).toMatch(/could not be reached/);
    expect(detail).toMatch(/Vault and knowledge-base search/);
    // /readyz is public: no address, no upstream text.
    expect(detail).not.toContain('10.10.1.37');
    expect(detail).not.toContain('ECONNREFUSED');
  });

  it('the server bge-m3 runs on (TEI: never more than 1024) serves, because the lane asks for 1024 and pads', async () => {
    teiServingBgeM3();
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('ready');
    const detail = getAnaReadinessDetail();
    expect(detail).toContain('embeddings: local');
    expect(detail).toContain('BAAI/bge-m3');
    expect(detail).toMatch(/1536/);
    expect(detail).toMatch(/3072/);
    // It was asked, once per corpus width, in the model's own width.
    expect(embeddingServer.create).toHaveBeenCalledTimes(2);
    for (const [params] of embeddingServer.create.mock.calls) expect(params).toMatchObject({ dimensions: 1024 });
    expect(corpus.check).toHaveBeenCalledTimes(1);
  });

  it('a server that refuses is NOT serving, naming the HTTP status', async () => {
    embeddingServer.create.mockRejectedValue(Object.assign(new Error('Payload too large'), { status: 413 }));
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    expect(await evaluateAnaReadiness()).toBe('embedding_lane_down');
    expect(getAnaReadinessDetail()).toMatch(/HTTP 413/);
  });

  it('a server that serves another model is NOT serving: one corpus column holds one model', async () => {
    embeddingServer.create.mockImplementation(async (params: { input: string | string[]; model: string; dimensions?: number }) =>
      embeddingServer.answer({ ...params, model: 'BAAI/bge-large-en-v1.5' }),
    );
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    expect(await evaluateAnaReadiness()).toBe('embedding_lane_down');
    expect(getAnaReadinessDetail()).toContain('BAAI/bge-large-en-v1.5');
  });

  it('a corpus holding vectors another model wrote is NOT serving until it is re-embedded', async () => {
    corpus.check.mockResolvedValue({
      ...corpus.clean,
      findings: [{ corpus: 'vaultDocumentChunks', table: 'vault.document_chunks', rows: 4, scopes: ['organization 17'] }],
    });
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    const state = await evaluateAnaReadiness();

    expect(state).toBe('embedding_corpus_unverified');
    expect(isAnaReadinessServing(state)).toBe(false);
    const detail = getAnaReadinessDetail();
    expect(detail).toContain('vault.document_chunks');
    expect(detail).toContain('organization 17');
    expect(detail).toMatch(/re-embed/);
  });

  it('a corpus check that cannot run is NOT serving: unchecked is not clean', async () => {
    corpus.check.mockRejectedValue(new Error('permission denied for table rag_chunks'));
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    expect(await evaluateAnaReadiness()).toBe('embedding_corpus_unverified');
    expect(getAnaReadinessDetail()).toMatch(/could not be checked/);
  });

  it('outside production the probe runs too: an OpenAI lane that does not answer is NOT serving', async () => {
    embeddingServer.create.mockRejectedValue(Object.assign(new Error('Incorrect API key provided'), { status: 401 }));
    gatewayStub = await laneGateway('development', { ANTHROPIC_API_KEY: 'sk-ant-test' });

    expect(await evaluateAnaReadiness()).toBe('embedding_lane_down');
    expect(getAnaReadinessDetail()).toMatch(/HTTP 401/);
    // The corpus check is the self-hosted lane's: an OpenAI vector is never padded.
    expect(corpus.check).not.toHaveBeenCalled();
  });

});

describe('evaluateAnaReadiness — a lane that has not answered is probed again, and /readyz follows (DP-71)', () => {
  isolateLaneEnvironment();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a lane that comes up after boot is re-probed, and readiness turns ready without a restart', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    embeddingServer.create.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { name: 'APIConnectionError' }));
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });

    expect(await evaluateAnaReadiness()).toBe('embedding_lane_down');

    teiServingBgeM3();
    await vi.advanceTimersByTimeAsync(EMBEDDING_PROBE_RETRY_MS);
    await vi.waitFor(() => expect(getAnaReadiness()).toBe('ready'));
    expect(getAnaReadinessDetail()).toContain('embeddings: local');
  });

  it('/readyz answers 503 while the lane has not answered, and 200 once it has', async () => {
    embeddingServer.create.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { name: 'APIConnectionError' }));
    gatewayStub = await laneGateway('production', { ANTHROPIC_API_KEY: 'sk-ant-test', ...LANE });
    setSchemaReadiness('ready', '');
    delete process.env.REDIS_URL;
    delete process.env.REDIS_TLS_URL;
    const a = express();
    mountFastPathHealthEndpoints(a, { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never);

    await evaluateAnaReadiness();
    const down = await request(a).get('/readyz');
    expect(down.status).toBe(503);
    expect(down.body.dependencies.ana).toBe('down');
    expect(down.body.anaState).toBe('embedding_lane_down');
    expect(down.body.anaDetail).toMatch(/could not be reached/);

    teiServingBgeM3();
    await evaluateAnaReadiness();
    const up = await request(a).get('/readyz');
    expect(up.status).toBe(200);
    expect(up.body.anaState).toBe('ready');
  });
});
