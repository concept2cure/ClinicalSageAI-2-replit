/**
 * GET /api/evidence-asks — the converged latest-real-ask read for the v2 Evidence surface.
 *
 * The route is thin: guard the org, delegate to the AI-trace-chain assembler, and
 * return the LATEST ask (or honest null). No blob, no fallback; answer prose is
 * honestly null (only its hash is retained by the provenance chain) and suggestions
 * are honestly empty. (The mapping is proven against real SQL in
 * evidence-asks-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgEvidenceAsks = vi.fn();
vi.mock('../../services/evidence/evidence-asks-view-assembler', () => ({
  assembleOrgEvidenceAsks: (...a: unknown[]) => assembleOrgEvidenceAsks(...a),
}));

import evidenceRouter from '../evidence-asks.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/evidence-asks', evidenceRouter);
  return app;
}

beforeEach(() => {
  assembleOrgEvidenceAsks.mockReset();
});

describe('GET /api/evidence-asks', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/evidence-asks');
    expect(res.status).toBe(403);
    expect(assembleOrgEvidenceAsks).not.toHaveBeenCalled();
  });

  it('returns the LATEST real ask with honest nulls, source = ai_retrieval_runs', async () => {
    assembleOrgEvidenceAsks.mockResolvedValueOnce([
      {
        id: 'r-2', question: 'Latest?', askedAt: '2026-07-02T10:00:00.000Z', pedigree: 'model_assisted',
        answer: null, answerRetained: false, cites: [], model: 'claude-sonnet-5',
        chunks: [{ n: 1, doc: 'Protocol BX204-301', page: null, sim: 0.92, snip: '…' }],
      },
      { id: 'r-1', question: 'Older?', askedAt: '2026-07-01T10:00:00.000Z', pedigree: 'deterministic_query', answer: null, answerRetained: false, cites: [], model: null, chunks: [] },
    ]);
    const res = await request(appWith(7)).get('/api/evidence-asks');
    expect(res.status).toBe(200);
    expect(assembleOrgEvidenceAsks).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('ai_retrieval_runs');
    const data = res.body.data;
    expect(data.question).toBe('Latest?');
    expect(data.answer).toBeNull();
    expect(data.answerRetained).toBe(false);
    // suggestions are the org's REAL recent questions (distinct), never invented.
    expect(data.suggestions).toEqual(['Latest?', 'Older?']);
    for (const k of ['n', 'doc', 'page', 'sim', 'snip']) expect(data.chunks[0]).toHaveProperty(k);
    expect(res.body.meta.count).toBe(2);
  });

  it('honest null when the org has never run an ask — no fallback data', async () => {
    assembleOrgEvidenceAsks.mockResolvedValueOnce([]);
    const res = await request(appWith(7)).get('/api/evidence-asks');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.count).toBe(0);
  });

  // Regression: this used to assert 200 + `meta.pendingStore`, i.e. the route
  // reported an unreadable provenance chain with the same shape it uses for
  // "this org has never run an ask" (data: null). A caller could not tell the
  // two apart, so a missing trace store read as "no evidence was ever
  // retrieved" — a false negative about whether grounded evidence exists. The
  // 200 was the defect; the assertion below encodes the fix.
  it('503s when the trace store is not provisioned (42P01) — never a 200 empty', async () => {
    assembleOrgEvidenceAsks.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/evidence-asks');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EVIDENCE_TRACE_STORE_UNPROVISIONED');
    expect(res.body.data).toBeUndefined();
  });

  it('500s on any other read failure — never a 200 empty', async () => {
    assembleOrgEvidenceAsks.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/evidence-asks');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.data).toBeUndefined();
  });
});
