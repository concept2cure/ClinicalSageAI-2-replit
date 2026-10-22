/**
 * POST /api/endpoint/recommend (the compatibility facade) answers from what its
 * sources returned, says which ones were read, and refuses a request with no
 * indication.
 *
 * ── What the facade used to do (until 2026-10-15) ───────────────────────────
 * It defaulted indication to 'General' and phase to 'Phase 2'. An empty request
 * was therefore answered for a guessed indication, narrowed to Phase 2 trials.
 * Each item's `summary` was its first evidence line. For a model-suggested
 * endpoint that line was "Based on analysis of similar trial endpoints for X",
 * although no analysis happened. With no evidence, the summary fell back to
 * "<phase> <indication> endpoint recommendation based on available evidence."
 * The answer was a bare array, so an unreadable CSR corpus (swallowed upstream
 * into an empty list) came back as 200 with model endpoints.
 *
 * The real recommender runs behind the facade. Its database, the literature
 * search and the model are doubles.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { hf, academic, holder } = vi.hoisted(() => ({
  hf: { queryHuggingFace: vi.fn() },
  academic: { searchAcademicKnowledge: vi.fn(), getRecentlyProcessedDocuments: vi.fn() },
  holder: { db: null as unknown },
}));
const dbDouble = vi.hoisted(() => ({ get db() { return holder.db; } }));
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../huggingface-service', () => ({ huggingFaceService: hf }));
vi.mock('../../services/academic-document-processor', () => ({ academicDocumentProcessor: academic }));

import express from 'express';
import request from 'supertest';
import type { Pool } from 'pg';
import { createAnaRiInlineRoutes } from '../ana-ri-inline-routes';
import { EndpointRecommenderService } from '../../services/endpoint-recommender-service';

function emptyCorpus() {
  const chain: Record<string, unknown> = {};
  for (const step of ['from', 'where', 'orderBy', 'limit', 'innerJoin']) chain[step] = () => chain;
  chain.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve([]).then(resolve, reject);
  return { select: () => chain };
}

function unreadableCorpus() {
  return {
    select: () => {
      throw new Error('relation "csr_reports" does not exist');
    },
  };
}

/** `withOrg`: the session the /api auth boundary attaches; the corpus read is its organization's. */
function mountApp(withOrg = true) {
  const service = new EndpointRecommenderService(hf as never);
  const app = express();
  app.use(express.json());
  if (withOrg) {
    app.use((req, _res, next) => {
      (req as unknown as { user: { id: number; organizationId: number } }).user = { id: 41, organizationId: 7 };
      next();
    });
  }
  app.use(
    '/api',
    createAnaRiInlineRoutes({} as Pool, { csrSearchService: {}, getEndpointRecommenderService: () => service }),
  );
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  holder.db = emptyCorpus();
  academic.searchAcademicKnowledge.mockResolvedValue([]);
  academic.getRecentlyProcessedDocuments.mockReturnValue([{ id: 'doc-1' }]); // a loaded literature store
  hf.queryHuggingFace.mockResolvedValue('["Change from baseline in eGFR at month 12"]');
});

describe('POST /api/endpoint/recommend', () => {
  it('refuses a request that names no indication, instead of answering for "General" Phase 2', async () => {
    const res = await request(mountApp()).post('/api/endpoint/recommend').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/indication is required/);
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });

  it('summarises a model suggestion as model output, and says which sources were read', async () => {
    const res = await request(mountApp()).post('/api/endpoint/recommend').send({ indication: 'Fabry disease' });

    expect(res.status).toBe(200);
    const [first] = res.body.recommendations ?? res.body;
    expect(first.endpoint).toBe('Change from baseline in eGFR at month 12');
    expect(first.summary).not.toMatch(/analysis|based on available evidence/i);
    expect(first.evidenceBasis).toBe('ai_suggested');
    expect(res.body.sources).toMatchObject({ csr_corpus: { status: 'no_matches' }, language_model: { status: 'read' } });
  });

  it('answers 503 naming the CSR corpus when it cannot be read', async () => {
    holder.db = unreadableCorpus();

    const res = await request(mountApp()).post('/api/endpoint/recommend').send({ indication: 'Fabry disease' });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'ENDPOINT_CORPUS_UNAVAILABLE', unavailable: ['csr_corpus'] });
  });

  // 2026-10-15: the corpus read has an organization predicate; with no organization
  // it is refused rather than read across organizations.
  it('refuses a request with no authenticated organization, rather than read every organization', async () => {
    const res = await request(mountApp(false)).post('/api/endpoint/recommend').send({ indication: 'Fabry disease' });

    expect(res.status).toBe(401);
    expect(hf.queryHuggingFace).not.toHaveBeenCalled();
  });
});
