/**
 * Tenant isolation contract for /api/ind-submissions.
 *
 * Pre-fix, two P0 IDOR holes existed:
 *   1. Routes fell back to `organizationId = 1` when the JWT was
 *      missing — an unauthenticated request could read/write org 1's
 *      submissions.
 *   2. GET /:submissionId fetched by submission ID alone — any
 *      authenticated user from any org could read another org's
 *      submission by guessing its id.
 *
 * These tests pin the fixed contract:
 *   - No JWT → 401 (authenticateToken rejects).
 *   - JWT with no organizationId claim → 403.
 *   - JWT with foreign org viewing another org's submission → 404
 *     (existence not enumerable).
 *   - JWT with matching org → 200.
 *   - PUT can't relocate a submission to another org via body.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

// Storage mock — module is imported by the router under test, so we
// stub it before the import resolves.
const storageMock = {
  getIndSubmission: vi.fn(),
  getIndSubmissionBySession: vi.fn(),
  getActiveIndSubmission: vi.fn(),
  createIndSubmission: vi.fn(),
  updateIndSubmission: vi.fn(),
};

vi.mock('../../storage', () => ({ storage: storageMock }));

// Stub the auth middleware so the test focuses on TENANT ISOLATION,
// not JWT verification (which is covered by environment.test.ts and
// the middleware's own tests). The fake middleware:
//   - rejects requests without `Authorization: TestToken ...`
//   - parses the token as `userId:orgId` or `userId:` (no org) so
//     individual tests can simulate the three states we care about:
//     no auth, authed-no-org, authed-with-org.
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    const header = req.headers.authorization as string | undefined;
    if (!header || !header.startsWith('TestToken ')) {
      return _res.status(401).json({ error: 'No token' });
    }
    const value = header.slice('TestToken '.length);
    const [userIdStr, orgIdStr] = value.split(':');
    req.user = {
      id: Number(userIdStr),
      userId: Number(userIdStr),
      organizationId: orgIdStr ? Number(orgIdStr) : undefined,
    };
    next();
  },
}));

let app: express.Express;

function tokenFor(userId: number, orgId?: number): string {
  return `TestToken ${userId}:${orgId ?? ''}`;
}

beforeAll(async () => {
  const router = (await import('../ind-submissions.routes')).default;
  app = express();
  app.use(express.json());
  app.use('/api/ind-submissions', router);
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ind-submissions — authentication gate', () => {
  it('rejects unauthenticated GET /:submissionId with 401', async () => {
    const res = await request(app).get('/api/ind-submissions/SUB-1');
    expect(res.status).toBe(401);
    expect(storageMock.getIndSubmission).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated GET /active with 401', async () => {
    const res = await request(app).get('/api/ind-submissions/active');
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated POST /create with 401', async () => {
    const res = await request(app)
      .post('/api/ind-submissions/create')
      .send({ drugName: 'X' });
    expect(res.status).toBe(401);
    expect(storageMock.createIndSubmission).not.toHaveBeenCalled();
  });

  it('rejects authenticated JWT with no organizationId claim (403)', async () => {
    const token = tokenFor(99);
    const res = await request(app)
      .get('/api/ind-submissions/SUB-1')
      .set('Authorization', token);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/tenant/i);
  });
});

describe('ind-submissions — tenant isolation on GET /:submissionId', () => {
  it('returns 404 (not 403) when the submission belongs to another org', async () => {
    storageMock.getIndSubmission.mockResolvedValueOnce({
      submissionId: 'SUB-1',
      organizationId: 42,
      drugName: 'Confidential X',
    });

    const token = tokenFor(1, 7);
    const res = await request(app)
      .get('/api/ind-submissions/SUB-1')
      .set('Authorization', token);

    expect(res.status).toBe(404);
    // The response must not leak the existence or any content of the
    // foreign-tenant submission.
    expect(JSON.stringify(res.body)).not.toMatch(/Confidential X|organizationId/);
  });

  it('returns 200 with the submission when the org matches', async () => {
    storageMock.getIndSubmission.mockResolvedValueOnce({
      submissionId: 'SUB-1',
      organizationId: 7,
      drugName: 'My Drug',
    });

    const token = tokenFor(1, 7);
    const res = await request(app)
      .get('/api/ind-submissions/SUB-1')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.data.drugName).toBe('My Drug');
  });

  it('returns 404 when storage returns a submission with no organizationId', async () => {
    // Defensive: a malformed row without an org should never be served.
    storageMock.getIndSubmission.mockResolvedValueOnce({
      submissionId: 'SUB-1',
      organizationId: null,
    });

    const token = tokenFor(1, 7);
    const res = await request(app)
      .get('/api/ind-submissions/SUB-1')
      .set('Authorization', token);

    expect(res.status).toBe(404);
  });
});

describe('ind-submissions — tenant isolation on PUT /:submissionId', () => {
  it('rejects updates to another org submission with 404', async () => {
    storageMock.getIndSubmission.mockResolvedValueOnce({
      submissionId: 'SUB-1',
      organizationId: 42,
    });

    const token = tokenFor(1, 7);
    const res = await request(app)
      .put('/api/ind-submissions/SUB-1')
      .set('Authorization', token)
      .send({ drugName: 'Hijacked' });

    expect(res.status).toBe(404);
    expect(storageMock.updateIndSubmission).not.toHaveBeenCalled();
  });

  it('strips body.organizationId so updates can\'t move a record cross-tenant', async () => {
    storageMock.getIndSubmission.mockResolvedValueOnce({
      submissionId: 'SUB-1',
      organizationId: 7,
    });
    storageMock.updateIndSubmission.mockResolvedValueOnce({ submissionId: 'SUB-1' });

    const token = tokenFor(1, 7);
    await request(app)
      .put('/api/ind-submissions/SUB-1')
      .set('Authorization', token)
      .send({ drugName: 'Y', organizationId: 99, submissionId: 'SUB-99', createdById: 12345 });

    expect(storageMock.updateIndSubmission).toHaveBeenCalledOnce();
    const updates = storageMock.updateIndSubmission.mock.calls[0][1];
    expect(updates.organizationId).toBeUndefined();
    expect(updates.submissionId).toBeUndefined();
    expect(updates.createdById).toBeUndefined();
    expect(updates.lastModifiedBy).toBe(1);
  });
});
