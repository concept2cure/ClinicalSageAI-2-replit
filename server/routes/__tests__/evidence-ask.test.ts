/**
 * POST /api/evidence/ask — fail-closed, JWT-derived provenance chain.
 *
 * These tests pin the P0 guarantees of the Evidence Ask route:
 *
 *   1. Identity is derived EXCLUSIVELY from the verified principal
 *      (req.tenantId / req.user). A request-body `organizationId` and an
 *      `x-org-uuid` header must NOT be able to steer retrieval or provenance
 *      at another tenant — they are ignored.
 *   2. When ZERO sources clear the retrieval threshold the endpoint REFUSES
 *      deterministically (no generated answer, model never called) rather
 *      than relying on the model to refuse.
 *   3. The retrieval + generation provenance writes are part of the success
 *      boundary: if they cannot be written the request fails rather than
 *      returning an untraceable answer.
 *
 * Side-effect edges (db pool, embedding retrieval, AI gateway) are mocked the
 * way the sibling route tests do.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

const searchHybrid = vi.fn();
vi.mock('../../services/enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({ searchHybrid: (...a: unknown[]) => searchHybrid(...a) }),
}));

const route = vi.fn();
const getEnabledProviders = vi.fn(() => ['anthropic']);
vi.mock('../../services/ai-gateway/index.js', () => ({
  getGateway: () => ({ getEnabledProviders, route: (...a: unknown[]) => route(...a) }),
}));

import evidenceAskRouter from '../evidence-ask';

const TENANT_ORG_ID = 7;
const TENANT_USER_ID = 42;
const TENANT_ORG_UUID = '11111111-1111-1111-1111-111111111111';

/** Mount the router behind a middleware that installs a fixed principal. */
function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = TENANT_ORG_ID;
    (req as any).userId = TENANT_USER_ID;
    (req as any).user = { userId: TENANT_USER_ID, organizationId: TENANT_ORG_ID };
    (req as any).tenantContext = {
      organizationId: TENANT_ORG_ID,
      userId: TENANT_USER_ID,
      organizationUuid: TENANT_ORG_UUID,
    };
    next();
  });
  a.use('/api/evidence', evidenceAskRouter);
  return a;
}

/** A GatewayResponse-shaped reply. */
function gatewayReply(content: string) {
  return {
    content,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    latencyMs: 12,
  };
}

/** Route pool.query through a SQL-aware dispatcher. */
function installQueryDispatcher(overrides: Partial<Record<string, unknown>> = {}) {
  query.mockImplementation((sql: string) => {
    const s = String(sql);
    if (/FROM projects/i.test(s)) {
      return Promise.resolve(overrides.projectOwned ?? { rowCount: 1, rows: [{ '?column?': 1 }] });
    }
    if (/INSERT INTO ai_retrieval_runs/i.test(s)) {
      return Promise.resolve({ rows: [{ id: 'rr-1' }] });
    }
    if (/INSERT INTO ai_retrieval_chunks/i.test(s)) {
      return Promise.resolve({ rows: [{ id: 'rc-1', rank: 1, atom_id: 'atom-1', score: 0.9 }] });
    }
    if (/INSERT INTO ai_threads/i.test(s)) {
      return Promise.resolve({ rows: [] });
    }
    if (/INSERT INTO ai_generation_runs/i.test(s)) {
      return Promise.resolve({ rows: [{ id: 'gr-1' }] });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

/** Find the first pool.query call whose SQL matches a pattern. */
function callMatching(pattern: RegExp) {
  return query.mock.calls.find((c) => pattern.test(String(c[0])));
}

beforeEach(() => {
  query.mockReset();
  searchHybrid.mockReset();
  route.mockReset();
  getEnabledProviders.mockReset();
  getEnabledProviders.mockReturnValue(['anthropic']);
});

describe('POST /api/evidence/ask — fail-closed JWT-derived provenance', () => {
  it('ignores body organizationId and x-org-uuid; anchors retrieval + provenance to the principal', async () => {
    installQueryDispatcher();
    searchHybrid.mockResolvedValue([
      { id: 'atom-1', title: 'Protocol', content: 'Grounded evidence [fact].', score: 0.9 },
    ]);
    route.mockResolvedValue(gatewayReply('The answer is grounded [SRC-1].'));

    const res = await request(app())
      .post('/api/evidence/ask')
      .set('x-org-uuid', '99999999-9999-9999-9999-999999999999') // attacker-controlled — must be ignored
      .send({
        message: 'What does the protocol say?',
        organizationId: 999, // attacker-controlled org override — must be ignored
      });

    expect(res.status).toBe(200);

    // Retrieval was scoped to the PRINCIPAL's org uuid, not the header.
    expect(searchHybrid).toHaveBeenCalledTimes(1);
    expect(searchHybrid.mock.calls[0][3]).toBe(TENANT_ORG_UUID);

    // Retrieval provenance recorded the PRINCIPAL's org + user, never body 999.
    const rrCall = callMatching(/INSERT INTO ai_retrieval_runs/i);
    expect(rrCall).toBeDefined();
    const rrParams = rrCall![1] as unknown[];
    expect(rrParams[0]).toBe(TENANT_ORG_ID); // organization_id
    expect(rrParams[2]).toBe(String(TENANT_USER_ID)); // user_id
    expect(rrParams).not.toContain(999);

    // Generation was dispatched under the principal's org too.
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0][0]).toMatchObject({
      organizationId: TENANT_ORG_ID,
      userId: TENANT_USER_ID,
    });

    expect(res.body.retrievalRunId).toBe('rr-1');
    expect(res.body.generationRunId).toBe('gr-1');
  });

  it('refuses (422, no generated answer, model never called) when zero sources clear the threshold', async () => {
    installQueryDispatcher();
    searchHybrid.mockResolvedValue([]); // nothing admissible

    const res = await request(app())
      .post('/api/evidence/ask')
      .send({ message: 'Anything grounded?' });

    expect(res.status).toBe(422);
    expect(res.body.refused).toBe(true);
    expect(res.body.code).toBe('NO_ADMISSIBLE_EVIDENCE');
    expect(res.body.answer).toBeNull();

    // The model must NOT be invoked, and no generation provenance written.
    expect(route).not.toHaveBeenCalled();
    expect(callMatching(/INSERT INTO ai_generation_runs/i)).toBeUndefined();
  });

  it('fails closed (500) when retrieval provenance cannot be written', async () => {
    query.mockImplementation((sql: string) => {
      if (/INSERT INTO ai_retrieval_runs/i.test(String(sql))) {
        return Promise.reject(Object.assign(new Error('relation missing'), { code: '42P01' }));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
    searchHybrid.mockResolvedValue([
      { id: 'atom-1', title: 'Protocol', content: 'Grounded evidence.', score: 0.9 },
    ]);
    route.mockResolvedValue(gatewayReply('Should never be returned.'));

    const res = await request(app())
      .post('/api/evidence/ask')
      .send({ message: 'What does the protocol say?' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('PROVENANCE_WRITE_FAILED');
    // No untraceable answer is generated.
    expect(route).not.toHaveBeenCalled();
  });
});
