import { describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  list: vi.fn(), readiness: vi.fn(), client: { query: vi.fn() },
}));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => { (req as any).user = { id: 3, organizationId: 7 }; next(); },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => h.client, requestConnectable: vi.fn() }));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../c2c/actions', () => ({ verifyReauth: vi.fn() }));
vi.mock('../../services/submission-gateways', () => ({
  getGatewayUnguarded: () => ({ isConfigured: async () => true }), gatewayTransportReadiness: h.readiness,
}));
vi.mock('../../services/submission-gateways/gateway-accounts', () => ({
  GatewayAccountInputError: class extends Error {}, listGatewayAccounts: h.list, writeGatewayAccount: vi.fn(),
}));

import accounts from '../gateway-accounts';
const app = express(); app.use('/api/gateway-accounts', accounts);

describe('account settings disclose credential state and agency qualification separately', () => {
  it('serializes readiness for each environment without promoting configured accounts to qualified', async () => {
    h.list.mockResolvedValue([
      { region: 'fda', gateway: 'esg', environment: 'production', status: 'ready' },
      { region: 'fda', gateway: 'esg', environment: 'staging', status: 'platform_not_configured' },
    ]);
    h.readiness.mockResolvedValue({ transport: 'as2', implementation: 'implemented', qualification: 'not_verified', qualified: false, reason: 'UAT not verified', missingDependencies: ['agency UAT'] });
    const response = await request(app).get('/api/gateway-accounts');
    expect(response.status).toBe(200);
    expect(response.body.organizationId).toBe(7);
    expect(response.body.accounts[0]).toMatchObject({ credentialsConfigured: true, transportReadiness: { qualified: false, qualification: 'not_verified' } });
    expect(response.body.accounts[1]).toMatchObject({ credentialsConfigured: false, transportReadiness: { qualified: false } });
    expect(h.list.mock.calls[0].slice(0, 2)).toEqual([h.client, 7]);
    expect(h.readiness.mock.calls).toEqual([['fda', 'esg', 'production'], ['fda', 'esg', 'staging']]);
  });
});
