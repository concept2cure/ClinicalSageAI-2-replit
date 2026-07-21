import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockVerifyReauth = vi.fn();

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: async () => ({ query: mockQuery, release: vi.fn() }),
  }),
}));

// The section-approve endpoint re-authenticates the signer (§11) before any
// write; mock verifyReauth so the gate can be exercised without bcrypt/MFA.
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: (...a: unknown[]) => mockVerifyReauth(...a),
  recordGovernedAction: vi.fn(),
}));

import router from '../module3OperatingSystemRoutes';

describe('module3OperatingSystemRoutes', () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    // Route reads `req.tenantId || req.tenantContext?.organizationId` — the
    // x-organization-id header isn't converted to either field without the
    // tenant-context middleware. Set both directly so the route hands off
    // org id 101 to the SQL layer.
    req.tenantId = 101;
    req.tenantContext = { organizationId: 101 };
    req.user = { id: 1, organizationId: 101 };
    next();
  });
  app.use('/api/cmc/module3-os', router);

  beforeEach(() => {
    mockQuery.mockReset();
    mockVerifyReauth.mockReset();
    mockVerifyReauth.mockResolvedValue({ ok: true });
  });

  it('returns readiness snapshot from canonical section/contradiction data', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved', stale: false }, { approval_state: 'draft', stale: true }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }, { severity: 'high', status: 'resolved' }] });

    const res = await request(app).get('/api/cmc/module3-os/readiness/proj-1');

    expect(res.status).toBe(200);
    expect(res.body.data.totalSections).toBe(2);
    expect(res.body.data.approvedSections).toBe(1);
    expect(res.body.data.staleSections).toBe(1);
    expect(res.body.data.openCriticalContradictions).toBe(1);
    expect(res.body.data.exportReady).toBe(false);
  });

  it('returns section provenance feed', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'sec-1' }] })
      .mockResolvedValueOnce({ rows: [{ eventType: 'compiled' }, { eventType: 'approved' }] });

    const res = await request(app).get('/api/cmc/module3-os/provenance/proj-1/3.2.P.5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('resolves contradiction and returns resolved status', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'c-1', projectId: 'proj-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch('/api/cmc/module3-os/contradictions/c-1/resolve')
      .send({ resolutionNote: 'closed after CAPA' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('section approve fails closed with 401 when re-authentication fails — before any DB write', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: false, error: 'REAUTH_REQUIRED' });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve for filing', reauth: { password: 'wrong' } });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
    // The gate runs before the contradiction check and any write — no SQL ran.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('section approve proceeds past the re-auth gate on success (then honors the contradiction block)', async () => {
    mockVerifyReauth.mockResolvedValueOnce({ ok: true });
    // First query after the gate is the critical-contradiction check.
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c-1' }] });

    const res = await request(app)
      .post('/api/cmc/module3-os/sections/proj-1/3.2.P.5/approve')
      .send({ reason: 'approve for filing', reauth: { password: 'right', totp: '123456' } });

    expect(mockVerifyReauth).toHaveBeenCalledWith(1, { password: 'right', totp: '123456' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Critical contradictions');
  });

  it('blocks final export when not all sections approved and critical contradictions open', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ approval_state: 'approved' }, { approval_state: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ severity: 'critical', status: 'open' }] });

    const res = await request(app).post('/api/cmc/module3-os/guard/final-export/proj-1').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Critical contradictions');
  });
});
