/**
 * A 502 from POST /api/firecrawl/scrape carries no caught-error text (security
 * audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch answered `firecrawlError('provider_error', error.message)`, so the
 * thrown text became the envelope's sentence. The Firecrawl client builds that
 * text as `provider_error:<status>:<first 200 bytes of the provider's body>`,
 * or `provider_error:FIRECRAWL_API_KEY missing` — the upstream response and the
 * deployment's configuration, delivered to the browser. The 502 keeps its
 * status and its `provider_error` code (the coded shape every other refusal in
 * this route uses) and now says the code's own static sentence, with the
 * route's correlation id; the thrown text goes to the log against that id.
 *
 * The provider and the stores are doubles; the route is real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'provider_error:500:SENTINEL-UPSTREAM-BODY {"error":"invalid key fc-set-b-secret"}';

const { scrape, quota } = vi.hoisted(() => ({ scrape: vi.fn(), quota: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', () => ({ requireAuthedOrgId: () => ({ ok: true, orgId: 7 }) }));
vi.mock('../../db', () => ({ getPool: () => ({ query: vi.fn(async () => ({ rows: [] })) }) }));
vi.mock('../../integrations/firecrawl/guards', () => ({ evaluateScrapeGuards: () => ({ ok: true }) }));
vi.mock('../../integrations/firecrawl/usage', () => ({
  getFirecrawlQuotaStatus: (...a: unknown[]) => quota(...a),
  recordSuccessfulFirecrawlScrape: vi.fn(),
}));
vi.mock('../../integrations/firecrawl/scrape', () => ({ firecrawlScrape: (...a: unknown[]) => scrape(...a) }));
vi.mock('../../services/research-intelligence', () => ({ normalizeEvidence: vi.fn(), persistEvidence: vi.fn() }));
vi.mock('../../services/search/opensearchClient', () => ({ indexGovernedDocument: vi.fn() }));

import router from '../firecrawl';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/firecrawl', router);
  return a;
}

beforeEach(() => {
  scrape.mockReset();
  quota.mockReset();
  quota.mockResolvedValue({ allowed: true, remaining: 5 });
});

describe('POST /api/firecrawl/scrape: the 502 body is contained', () => {
  it('answers a provider failure with provider_error, the static sentence and the correlation id, never the thrown text', async () => {
    scrape.mockRejectedValueOnce(new Error(SENTINEL));
    const r = await request(app())
      .post('/api/firecrawl/scrape')
      .set('x-correlation-id', 'fc-corr-set-b')
      .send({ url: 'https://example.org/label.pdf' });
    expect(r.status).toBe(502);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-UPSTREAM-BODY');
    expect(body).not.toContain('fc-set-b-secret');
    expect(body).not.toContain('provider_error:500');
    expect(r.body).toMatchObject({
      success: false,
      error: { code: 'provider_error', message: 'Firecrawl provider returned an error.' },
      correlationId: 'fc-corr-set-b',
    });
  });

  it('leaves the quota 429 exactly as it was', async () => {
    quota.mockResolvedValue({ allowed: false, remaining: 0 });
    const r = await request(app())
      .post('/api/firecrawl/scrape')
      .set('x-correlation-id', 'fc-corr-set-b')
      .send({ url: 'https://example.org/label.pdf' });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({
      success: false,
      error: { code: 'quota_exhausted', message: 'Workspace daily Firecrawl allowance is exhausted.' },
      correlationId: 'fc-corr-set-b',
    });
    expect(scrape).not.toHaveBeenCalled();
  });
});
