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

  it('DELETE /gdpr/:orgId/data-subject/:dataSubjectId performs redaction workflow', async () => {
    const clientQuery = vi.fn()
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // users
      .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // conversations
      .mockResolvedValueOnce({ rows: [{ artifact_id: 99 }] }) // artifacts
      .mockResolvedValueOnce({ rows: [{ id: 333 }] }) // comments
      .mockResolvedValueOnce({ rows: [] }) // dsr insert
      .mockResolvedValueOnce(undefined); // COMMIT

    mockConnect.mockResolvedValue({
      query: clientQuery,
      release: vi.fn(),
    });

    const mod = await import('../../routes/global-compliance');
    const app = express();
    app.use(express.json());
    app.use('/api/compliance', mod.default);

    const res = await request(app)
      .delete('/api/compliance/gdpr/2/data-subject/10')
      .send({ reason: 'user request' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.redactedUser).toBe(true);
    expect(res.body.data.redactedConversations).toBe(2);
    expect(res.body.data.redactedArtifacts).toBe(1);
    expect(res.body.data.redactedComments).toBe(1);
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
