/**
 * GET /api/v1/endpoints/recommend and /api/v1/trial-design/suggest say which
 * endpoint sources were read. An unreadable CSR corpus is a 503 that names it,
 * and a missing indication is refused rather than guessed.
 *
 * ── What the routes used to do (until 2026-10-15) ───────────────────────────
 * The recommender swallowed every failure into an empty list. A CSR corpus that
 * could not be read therefore came back as HTTP 200, with recommendations the
 * language model made up to fill the gap and nothing saying the corpus was
 * never read. A request with no indication was answered as indication 'general':
 * a LIKE '%general%' corpus match, then a model asked about "general" trials.
 *
 * The recommender itself runs here for real. Only its database, the literature
 * search and the model are doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateApiKeyMock, recommendStrategyMock, hf, academic, holder } = vi.hoisted(() => ({
  validateApiKeyMock: vi.fn(),
  recommendStrategyMock: vi.fn(),
  hf: { queryHuggingFace: vi.fn() },
  academic: { searchAcademicKnowledge: vi.fn(), getRecentlyProcessedDocuments: vi.fn() },
  holder: { db: null as unknown },
}));

vi.mock('../../services/api-key-service.js', () => ({ validateApiKey: validateApiKeyMock }));
vi.mock('../../services/tenant/tenant-lifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>();
  return {
    ...actual,
    getTenantAccessPosture: vi.fn(async () => ({
      organizationId: 7, state: 'active', decision: 'allow', code: 'TENANT_ACTIVE', reason: 'Active.',
    })),
  };
});
vi.mock('../../services/usage-metering.js', () => ({
  recordUsage: vi.fn(async () => {}),
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
}));
vi.mock('../../services/csr-search-service.js', () => ({ csrSearchService: { searchCSRs: vi.fn() } }));
vi.mock('../../services/precedent-engine.js', () => ({ precedentEngine: { recommendStrategy: recommendStrategyMock } }));
// The recommender's own dependencies.
const dbDouble = vi.hoisted(() => ({ get db() { return holder.db; } }));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../huggingface-service', () => ({ huggingFaceService: hf }));
vi.mock('../../services/academic-document-processor', () => ({ academicDocumentProcessor: academic }));

import express from 'express';
import request from 'supertest';

/** A readable corpus with no matching report: every query answers no rows. */
function emptyCorpus() {
  const chain: Record<string, unknown> = {};
  for (const step of ['from', 'where', 'orderBy', 'limit', 'innerJoin']) chain[step] = () => chain;
  chain.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve([]).then(resolve, reject);
  return { select: () => chain };
}

/** A corpus whose read fails, as a missing relation or a fail-closed tenant scope does. */
function unreadableCorpus() {
  return {
    select: () => {
      throw new Error('relation "csr_reports" does not exist');
    },
  };
}

async function mountApp() {
  const { default: publicApiRouter } = await import('../public-api');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return app;
}
const call = async (path: string) => request(await mountApp()).get(path).set('x-api-key', 'csai_test');

beforeEach(() => {
  vi.clearAllMocks();
  holder.db = emptyCorpus();
  validateApiKeyMock.mockResolvedValue({
    valid: true, organizationId: 7, scopes: ['endpoints:read', 'trial-design:read'], keyId: 1,
  });
  recommendStrategyMock.mockResolvedValue({ basis: 'no-precedents', recommendedStrategy: null });
  academic.searchAcademicKnowledge.mockResolvedValue([]);
  academic.getRecentlyProcessedDocuments.mockReturnValue([{ id: 'doc-1' }]); // a loaded literature store
  hf.queryHuggingFace.mockResolvedValue('["Change from baseline in eGFR at month 12"]');
});

describe('GET /api/v1/endpoints/recommend', () => {
  it('refuses a request that names no indication, instead of recommending for "general"', async () => {
    const res = await call('/api/v1/endpoints/recommend');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/indication is required/);
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });

  it('answers 503 naming the CSR corpus when it cannot be read, instead of 200 with model endpoints', async () => {
    holder.db = unreadableCorpus();

    const res = await call('/api/v1/endpoints/recommend?indication=Fabry%20disease');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'ENDPOINT_CORPUS_UNAVAILABLE', unavailable: ['csr_corpus'] });
    expect(JSON.stringify(res.body)).not.toContain('does not exist');
  });

  it('says which sources were read, and that the literature search failed', async () => {
    academic.searchAcademicKnowledge.mockRejectedValue(new Error('embedding service down'));

    const res = await call('/api/v1/endpoints/recommend?indication=Fabry%20disease');

    expect(res.status).toBe(200);
    expect(res.body.sources).toMatchObject({
      csr_corpus: { status: 'no_matches' },
      academic_literature: { status: 'unavailable', detail: 'the literature search failed' },
      language_model: { status: 'read' },
    });
    expect(res.body.recommendations[0]).toMatchObject({
      endpoint: 'Change from baseline in eGFR at month 12',
      evidence_basis: 'ai_suggested',
    });
  });
});

describe('GET /api/v1/trial-design/suggest', () => {
  it('does not recommend endpoints for a guessed indication when none is given', async () => {
    const res = await call('/api/v1/trial-design/suggest?submissionType=NDA');

    expect(res.status).toBe(200);
    expect(res.body.recommendedEndpoints).toBeNull();
    expect(res.body.endpointsNotAssessed).toBe('indication was not supplied');
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });

  it('answers 503 naming the CSR corpus when it cannot be read', async () => {
    holder.db = unreadableCorpus();

    const res = await call('/api/v1/trial-design/suggest?submissionType=NDA&indication=Fabry%20disease');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'ENDPOINT_CORPUS_UNAVAILABLE', unavailable: ['csr_corpus'] });
  });

  it('carries the endpoint sources beside the endpoints it recommends', async () => {
    const res = await call('/api/v1/trial-design/suggest?submissionType=NDA&indication=Fabry%20disease');

    expect(res.status).toBe(200);
    expect(res.body.endpointSources).toMatchObject({ csr_corpus: { status: 'no_matches' } });
    expect(res.body.endpointsNotAssessed).toBeNull();
  });
});
