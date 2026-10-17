/** F15: optional API-key creation reason is validated and audited, while
 * tenant/user identity still comes only from the authenticated request. */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenantId: 7 as number | undefined,
  userId: 3 as number | undefined,
  generateApiKey: vi.fn(),
  audit: vi.fn(),
  client: {query: vi.fn(async () => ({rows: []}))},
}));
vi.mock('../../auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.tenantId = mocks.tenantId;
    req.userId = mocks.userId;
    req.dbClient = mocks.client as never;
    next();
  },
  requireAdminRole: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/api-key-service.js', async original => ({
  ...await original<typeof import('../../services/api-key-service.js')>(),
  generateApiKey: mocks.generateApiKey,
  validateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  getApiKeyUsage: vi.fn(),
}));
vi.mock('../../services/auditService', () => ({ default: { logAction: mocks.audit } }));

import apiKeyRouter from '../api-keys';

const RAW_KEY = 'csai_TEST_ONLY_RAW_KEY_THAT_MUST_NEVER_REACH_AUDIT';
const valid = { name: 'Integration reader', scopes: ['documents:read'] };

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/api-keys', apiKeyRouter);
  return server;
}

beforeEach(() => {
  mocks.tenantId = 7;
  mocks.userId = 3;
  mocks.generateApiKey.mockReset().mockResolvedValue({ rawKey: RAW_KEY, keyId: 12, keyPrefix: 'csai_TEST' });
  mocks.audit.mockReset().mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});

describe('POST /api/api-keys creation reason', () => {
  it('trims and records the access reason without recording the returned raw key', async () => {
    const result = await request(app()).post('/api/api-keys').send({
      ...valid, name: '  Integration reader  ', reason: '  Approved read-only integration  ',
      organizationId: 999, userId: 999,
    });
    expect(result.status).toBe(201);
    expect(result.body.apiKey).toBe(RAW_KEY);
    expect(mocks.generateApiKey).toHaveBeenCalledWith(expect.objectContaining({organizationId:7,name:'Integration reader',scopes:['documents:read'],createdBy:3,auditContext:expect.objectContaining({reason:'Approved read-only integration'})}),mocks.client);
    expect(result.body.meta.auditTrail).toEqual({persisted:true,chained:true});
    // The service transaction owns the one audit row; the route must not write a duplicate.
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(RAW_KEY);
  });

  it('preserves the existing API contract when a caller omits the optional reason', async () => {
    const result = await request(app()).post('/api/api-keys').send(valid);
    expect(result.status).toBe(201);
    expect(mocks.generateApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.generateApiKey).toHaveBeenCalledWith(expect.objectContaining({organizationId:7,name:'Integration reader',scopes:['documents:read'],createdBy:3,auditContext:expect.objectContaining({reason:undefined})}),mocks.client);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(['', 'x', ' ab ', 'x'.repeat(501), 123, null])('refuses an invalid supplied reason (%j) before issuing a key', async reason => {
    const result = await request(app()).post('/api/api-keys').send({ ...valid, reason });
    expect(result.status).toBe(400);
    expect(result.body.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'reason' })]));
    expect(mocks.generateApiKey).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([
    { name: '  ' },
    { name: 'x'.repeat(256) },
    { scopes: [] },
    { scopes: ['documents:write'] },
    { scopes: ['not-a-scope'] },
  ])('refuses invalid name/scopes without issuing or auditing a key (%j)', async invalid => {
    const result = await request(app()).post('/api/api-keys').send({ ...valid, reason: 'Approved integration', ...invalid });
    expect(result.status).toBe(400);
    expect(mocks.generateApiKey).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each(['tenantId', 'userId'] as const)('refuses issuance when authenticated %s is absent', async field => {
    mocks[field] = undefined;
    const result = await request(app()).post('/api/api-keys').send({ ...valid, reason: 'Approved integration', organizationId: 999, userId: 999 });
    expect(result.status).toBe(401);
    expect(mocks.generateApiKey).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
