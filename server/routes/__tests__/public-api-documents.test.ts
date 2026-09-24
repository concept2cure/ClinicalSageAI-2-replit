/**
 * /api/v1/documents — the routes that make `documents:read` mean something.
 *
 * The gap these close: `documents:read` was grantable in
 * shared/schema/api-keys.ts, offered in the admin key editor, and advertised by
 * the public API's own /docs response — while NO route anywhere required it. An
 * operator could grant it and believe document access was switched on; the key
 * holder had nothing to call.
 *
 * The read model is covered end-to-end against real Postgres in
 * server/services/vault/__tests__/vault-document-index.pglite.integration.test.ts.
 * What is under test HERE is the HTTP contract: scope enforcement, input
 * refusal, and — the one that matters — that an unavailable store becomes a 503
 * and never an empty page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { validateApiKeyMock, listMock, getMock, StoreUnavailable } = vi.hoisted(() => {
  class StoreUnavailable extends Error {
    readonly code = '42P01';
    constructor() {
      super('unavailable');
      this.name = 'VaultStoreUnavailableError';
    }
  }
  return {
    validateApiKeyMock: vi.fn(),
    listMock: vi.fn(),
    getMock: vi.fn(),
    StoreUnavailable,
  };
});

vi.mock('../../services/api-key-service.js', () => ({ validateApiKey: validateApiKeyMock }));
vi.mock('../../services/tenant/tenant-lifecycle.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-lifecycle')>();
  return {
    ...actual,
    getTenantAccessPosture: vi.fn(async () => ({
      organizationId: 7, state: 'active', decision: 'allow',
      code: 'TENANT_ACTIVE', reason: 'Active.',
    })),
  };
});
vi.mock('../../services/usage-metering.js', () => ({
  recordUsage: vi.fn(async () => {}),
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
}));
vi.mock('../../services/vault/vault-document-index.service.js', () => ({
  listVaultDocuments: listMock,
  getVaultDocument: getMock,
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  VaultStoreUnavailableError: StoreUnavailable,
  VAULT_CLASSIFICATIONS: ['CONFIDENTIAL', 'INTERNAL', 'CONTROLLED', 'PUBLIC'],
  VAULT_PROCESSING_STATUSES: ['PENDING', 'EXTRACTING', 'VECTORIZING', 'INDEXED', 'FAILED', 'ARCHIVED'],
}));
// The remaining data services, stubbed only so the router's module graph loads.
vi.mock('../../services/csr-search-service.js', () => ({ csrSearchService: { searchCSRs: vi.fn() } }));
vi.mock('../../services/regulatory-pathway-intelligence.js', () => ({ getRegulatoryPathwayIntelligence: () => ({}) }));
vi.mock('../../services/endpoint-recommender-service.js', () => ({ getEndpointRecommenderService: () => ({}) }));
vi.mock('../../services/precedent-engine.js', () => ({ precedentEngine: {} }));

import express from 'express';
import { API_KEY_SCOPES } from '../../../shared/schema/api-keys';
import request from 'supertest';

const DOC_ID = '2f1c9d8e-0b3a-4c5d-8e7f-a1b2c3d4e5f6';

async function mountApp() {
  const { default: publicApiRouter } = await import('../public-api');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return app;
}

function keyWithScopes(...scopes: string[]) {
  validateApiKeyMock.mockResolvedValue({ valid: true, organizationId: 7, scopes, keyId: 1 });
}

const call = async (path: string) =>
  request(await mountApp()).get(path).set('x-api-key', 'csai_test');

beforeEach(() => {
  vi.clearAllMocks();
  keyWithScopes('documents:read');
  listMock.mockResolvedValue({ documents: [], total: 0 });
  getMock.mockResolvedValue(null);
});

describe('documents:read is actually enforced', () => {
  it('refuses a key WITHOUT documents:read on both routes', async () => {
    keyWithScopes('csr:read');
    for (const path of ['/api/v1/documents', `/api/v1/documents/${DOC_ID}`]) {
      const res = await call(path);
      expect(res.status, path).toBe(403);
      // The shared fleet-wide guard runs first and names what is missing.
      expect(res.body.missing, path).toContain('documents:read');
    }
    expect(listMock).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('admits a key WITH documents:read', async () => {
    const res = await call('/api/v1/documents');
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('scopes the query to the organization the key belongs to, never the caller’s input', async () => {
    await call('/api/v1/documents?organizationId=999');
    expect(listMock.mock.calls[0][0]).toMatchObject({ organizationId: 7 });
  });
});

describe('an unavailable store is a 503, never an empty page', () => {
  it('maps VaultStoreUnavailableError to 503 on list', async () => {
    listMock.mockRejectedValue(new StoreUnavailable());
    const res = await call('/api/v1/documents');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('VAULT_STORE_UNAVAILABLE');
    // The one thing this must never be.
    expect(res.body.documents).toBeUndefined();
  });

  it('maps VaultStoreUnavailableError to 503 on fetch-by-id', async () => {
    getMock.mockRejectedValue(new StoreUnavailable());
    const res = await call(`/api/v1/documents/${DOC_ID}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('VAULT_STORE_UNAVAILABLE');
  });

  it('an unrelated failure is a 500, not a 503 and not an empty page', async () => {
    listMock.mockRejectedValue(new Error('boom'));
    const res = await call('/api/v1/documents');
    expect(res.status).toBe(500);
    expect(res.body.documents).toBeUndefined();
  });
});

describe('input refusal', () => {
  it.each([
    ['/api/v1/documents?programId=not-a-uuid', 'programId'],
    ['/api/v1/documents?classification=SUPER_SECRET', 'classification'],
    ['/api/v1/documents?processingStatus=NOPE', 'processingStatus'],
    ['/api/v1/documents/not-a-uuid', 'id'],
  ])('refuses %s with 400 before touching the store', async (path, parameter) => {
    const res = await call(path);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_PARAMETER', parameter });
    expect(listMock).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });

  it('accepts a valid classification case-insensitively', async () => {
    const res = await call('/api/v1/documents?classification=confidential');
    expect(res.status).toBe(200);
    expect(listMock.mock.calls[0][0]).toMatchObject({ classification: 'CONFIDENTIAL' });
  });
});

describe('paging window', () => {
  it('caps the page size at 200 and floors a negative offset at 0', async () => {
    await call('/api/v1/documents?limit=5000&offset=-40');
    expect(listMock.mock.calls[0][0]).toMatchObject({ limit: 200, offset: 0 });
  });

  it('reports the window so a short page is distinguishable from the end of the cabinet', async () => {
    listMock.mockResolvedValue({ documents: [{ id: DOC_ID }], total: 137 });
    const res = await call('/api/v1/documents?limit=1&offset=10');
    expect(res.status).toBe(200);
    expect(res.body.page).toEqual({ limit: 1, offset: 10, returned: 1, total: 137 });
  });
});

describe('fetch by id', () => {
  it('404s for a document that is missing or belongs to another tenant', async () => {
    getMock.mockResolvedValue(null);
    const res = await call(`/api/v1/documents/${DOC_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('DOCUMENT_NOT_FOUND');
  });

  it('returns the document when it resolves', async () => {
    getMock.mockResolvedValue({ id: DOC_ID, title: 'Protocol' });
    const res = await call(`/api/v1/documents/${DOC_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ id: DOC_ID, title: 'Protocol' });
    expect(getMock).toHaveBeenCalledWith(7, DOC_ID);
  });
});

describe('the API describes itself truthfully', () => {
  type Listed = { path: string; method: string; scope: string };
  const listed = async (): Promise<Listed[]> =>
    (await request(await mountApp()).get('/api/v1/docs')).body.endpoints;
  const concrete = (path: string) => path.replace(':id', DOC_ID);
  /** A scope refusal names the scope; a quota or tenant 403 does not. */
  const refusedFor = (body: { required?: string; missing?: string[] }, scope: string) =>
    body.required === scope || (body.missing ?? []).includes(scope);

  /*
   * These used to read the endpoint list from /docs and compare it with /docs'
   * own scope list — so a route that stopped requiring its scope, or a listed
   * path no route serves, still passed. They now CALL every listed endpoint.
   */
  it('every grantable scope is advertised and required by a listed endpoint', async () => {
    const res = await request(await mountApp()).get('/api/v1/docs');
    expect(res.status).toBe(200);
    expect([...res.body.authentication.scopes].sort()).toEqual([...API_KEY_SCOPES].sort());
    const routeScopes = new Set((res.body.endpoints as Listed[]).map((e) => e.scope));
    for (const scope of API_KEY_SCOPES) {
      expect(routeScopes.has(scope), `scope ${scope} is grantable but no endpoint lists it`).toBe(true);
    }
  });

  it('every listed endpoint REFUSES a key holding every scope but its own', async () => {
    for (const e of await listed()) {
      keyWithScopes(...API_KEY_SCOPES.filter((s) => s !== e.scope));
      const res = await call(concrete(e.path));
      expect(res.status, `${e.method} ${e.path} served a key without ${e.scope}`).toBe(403);
      expect(refusedFor(res.body, e.scope), `${e.path}: 403 did not name ${e.scope}`).toBe(true);
    }
  });

  it('every listed endpoint is served — the scope admits it to a real route', async () => {
    for (const e of await listed()) {
      keyWithScopes(e.scope);
      const res = await call(concrete(e.path));
      expect(res.status, `${e.path} refused its own scope`).not.toBe(403);
      // An unmatched path is Express's HTML 404; a route's own 404 is JSON with a code.
      const unmatched = res.status === 404 && !res.body?.error;
      expect(unmatched, `${e.method} ${e.path} is listed but no route serves it`).toBe(false);
    }
  });

  it('/health reports the endpoint count /docs actually lists', async () => {
    const app = await mountApp();
    const health = await request(app).get('/api/v1/health');
    const docs = await request(app).get('/api/v1/docs');
    expect(health.body.endpoints).toBe(docs.body.endpoints.length);
  });
});
