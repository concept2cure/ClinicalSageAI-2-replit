/**
 * AI section editing and template generation say whether their Data Room
 * retrieval succeeded, found nothing, or failed.
 *
 * Both caught a retrieval failure, logged it, and answered with
 * `sourcesRetrieved: 0` — the same response as a Data Room with nothing
 * relevant. A reviewer could not tell an ungrounded edit from a grounded one.
 * They now carry `retrievalStatus` ('ok' | 'empty' | 'failed', or
 * 'not_requested' with no project) and a fixed sentence, never the error text
 * (services/data-room-retrieval.ts).
 *
 * The retrieval helper is real; only the embedding search, the model, the
 * database and the auth middleware are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { searchHybrid, gatewayRoute, query } = vi.hoisted(() => ({
  searchHybrid: vi.fn(),
  gatewayRoute: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../../db', () => ({ db: {}, pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../../auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, n: () => void) => n(),
  requireOrganizationContext: (_q: unknown, _s: unknown, n: () => void) => n(),
}));
vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  concept2cureRateLimiter: (_q: unknown, _s: unknown, n: () => void) => n(),
  logAuditEntry: vi.fn(async () => undefined),
  getUserId: () => 42,
  getOrganizationId: () => 7,
}));
vi.mock('../../../services/enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({ searchHybrid: (...a: unknown[]) => searchHybrid(...a) }),
}));
vi.mock('../../../services/ai-gateway/gateway.js', () => ({
  getGateway: () => ({ getEnabledProviders: () => ['anthropic'], route: (...a: unknown[]) => gatewayRoute(...a) }),
}));
vi.mock('../../../services/intelligence/index.js', () => ({
  computeReadinessScore: async () => null,
  generateRecommendations: async () => null,
}));

import { runWithTenantScope } from '../../../db/tenantStore';
import router from '../ai-editing';

const ORG_UUID = '77777777-7777-4777-8777-777777777777';
const OUTAGE = 'connect ECONNREFUSED 10.0.0.12:443 (embedding endpoint)';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, _res: Response, next: NextFunction) =>
    runWithTenantScope(
      { tenantId: '7', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'ai-editing.test' },
      () => next(),
    ),
  );
  a.use('/api/concept2cure', router);
  return a;
}

const HIT = { id: 'a1', title: 'Study 101 CSR', content: 'Renal clearance was measured.', score: 0.8, sourceId: 'art-1' };

beforeEach(() => {
  searchHybrid.mockReset();
  gatewayRoute.mockReset();
  query.mockReset();
  query.mockResolvedValue({ rows: [{ id: 'row-1' }], rowCount: 1 });
  gatewayRoute.mockResolvedValue({
    content: 'Edited text.',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    latencyMs: 1,
  });
});

const edit = (body: Record<string, unknown>) =>
  request(app()).post('/api/concept2cure/ai/edit-section').send({ action: 'rewrite', text: 'Draft text.', ...body });
const generate = (body: Record<string, unknown>) =>
  request(app())
    .post('/api/concept2cure/ai/templates/csr-synopsis/generate')
    .send({
      variables: {
        STUDY_TITLE: 'Study 101',
        PROTOCOL: 'P-101',
        PRODUCT_NAME: 'ABC-123',
        INDICATION: 'CKD stage 3',
        DESIGN: 'randomized, double-blind',
        PRIMARY_ENDPOINT: 'eGFR change at week 24',
      },
      ...body,
    });

describe.each([
  ['edit-section', edit, (b: any) => b.data?.provenance ?? b.provenance],
  ['template generation', generate, (b: any) => b.data ?? b],
])('%s reports its retrieval outcome', (_name, call, carrier) => {
  it('failed: an outage is reported as failed, without its error text', async () => {
    searchHybrid.mockRejectedValue(new Error(OUTAGE));
    const res = await call({ projectId: 11 });
    expect(res.status).toBe(200);
    const c = carrier(res.body);
    expect(c.retrievalStatus).toBe('failed');
    expect(c.retrievalMessage).toMatch(/not grounded/i);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('empty: retrieval ran and nothing cleared the floor', async () => {
    searchHybrid.mockResolvedValue([]);
    const c = carrier((await call({ projectId: 11 })).body);
    expect(c.retrievalStatus).toBe('empty');
  });

  it('ok: evidence was found (positive control)', async () => {
    searchHybrid.mockResolvedValue([HIT]);
    const c = carrier((await call({ projectId: 11 })).body);
    expect(c.retrievalStatus).toBe('ok');
  });

  it('not_requested: no project, no retrieval attempted', async () => {
    const c = carrier((await call({ contextAttachment: 'adhoc' })).body);
    expect(searchHybrid).not.toHaveBeenCalled();
    expect(c.retrievalStatus).toBe('not_requested');
  });
});
