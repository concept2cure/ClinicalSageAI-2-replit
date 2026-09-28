import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

const { mockQuery, mockConnect, authState } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockConnect: vi.fn(),
  authState: {
    id: 10,
    organizationId: 2,
    role: 'admin',
  },
}));

vi.mock('../../db', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = {
      id: authState.id,
      userId: authState.id,
      organizationId: authState.organizationId,
      role: authState.role,
    };
    next();
  },
}));

describe('Global compliance GDPR rights endpoints', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockReset();
    authState.id = 10;
    authState.organizationId = 2;
    authState.role = 'admin';
  });

  it('GET /gdpr/:orgId/data-subject/:dataSubjectId/export returns export payload summary', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 10, email: 'u@test.com', name: 'U' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ rows: [{ artifact_id: 11 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const mod = await import('../../routes/global-compliance');
    const app = express();
    app.use(express.json());
    app.use('/api/compliance', mod.default);

    const res = await request(app).get('/api/compliance/gdpr/2/data-subject/10/export');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.id).toBe(10);
    expect(res.body.summary.conversations).toBe(2);
    expect(res.body.summary.artifacts).toBe(1);
    expect(res.body.summary.comments).toBe(1);
  });

  /* 2026-09-28. This was a second erasure path beside AnA's erase_personal_data.
     It took no re-authentication and wrote no electronic signature, overwrote
     regulated artifact content (GxP retention, 21 CFR 11.10(c)), and could not
     succeed on the real schema: `COALESCE(metadata, '{}'::jsonb)` on the json
     column fails, so every call was a 500. The mocked statements this case used
     to feed it hid all three. One erasure now: the e-signature-tier governed
     action, which re-verifies the signer, signs first, retains regulated
     records and records the request — so this route touches nothing and names it. */
  it('DELETE /gdpr/:orgId/data-subject/:dataSubjectId erases nothing and names the signed path', async () => {
    const mod = await import('../../routes/global-compliance');
    const app = express();
    app.use(express.json());
    app.use('/api/compliance', mod.default);

    const res = await request(app)
      .delete('/api/compliance/gdpr/2/data-subject/10')
      .send({ reason: 'user request' });

    expect(res.status).toBe(410);
    expect(res.body.error).toBe('ERASURE_IS_A_GOVERNED_ACTION');
    expect(res.body.message).toMatch(/Nothing was erased/);
    expect(res.body.message).toMatch(/erase_personal_data/);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('GET export denies cross-subject access for non-admin users', async () => {
    authState.role = 'user';
    authState.id = 11;

    const mod = await import('../../routes/global-compliance');
    const app = express();
    app.use(express.json());
    app.use('/api/compliance', mod.default);

    const res = await request(app).get('/api/compliance/gdpr/2/data-subject/10/export');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('data subject scope');
  });

  it('denies org-mismatched access for org admins (non-global)', async () => {
    authState.role = 'admin';
    authState.id = 10;
    authState.organizationId = 99;

    const mod = await import('../../routes/global-compliance');
    const app = express();
    app.use(express.json());
    app.use('/api/compliance', mod.default);

    const res = await request(app).get('/api/compliance/gdpr/2/data-subject/10/export');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('organization scope mismatch');
  });
});
