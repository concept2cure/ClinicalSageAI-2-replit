/**
 * Q-Sub route tests — input validation + tenant-error mapping.
 *
 * The service layer has its own tenant-gate tests; here we verify the route
 * layer enforces:
 *  - 403 when the request has no organization context
 *  - 422 for malformed input (bad enum, missing field, invalid date)
 *  - 403 when the service raises TenantAccessError
 *  - 404 when getQSubDetail returns null
 *  - 200/201 happy paths shape the response correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Hoisted control surface: lets each test override mocked service behavior.
const { svc, authState } = vi.hoisted(() => ({
  svc: {
    listQSubsForOrg: vi.fn(),
    getQSubDetail: vi.fn(),
    createQSubmission: vi.fn(),
    setCommitmentRolledIn: vi.fn(),
  },
  authState: {
    user: {
      id: 'u-1',
      organizationId: '7',
    } as Record<string, any> | null,
  },
}));

// Auth middleware — uses the hoisted authState so tests can null out the user.
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = authState.user;
    next();
  },
}));

// Service mocks — TenantAccessError is the real class.
class TenantAccessError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'TenantAccessError';
  }
}

vi.mock('../../services/q-sub/q-sub.service', () => ({
  listQSubsForOrg: (...args: any[]) => svc.listQSubsForOrg(...args),
  getQSubDetail: (...args: any[]) => svc.getQSubDetail(...args),
  createQSubmission: (...args: any[]) => svc.createQSubmission(...args),
  setCommitmentRolledIn: (...args: any[]) => svc.setCommitmentRolledIn(...args),
  TenantAccessError,
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  authState.user = { id: 'u-1', organizationId: '7' };

  const mod = await import('../../routes/q-sub');
  app = express();
  app.use(express.json());
  app.use('/api/q-sub', mod.default);
});

describe('GET /api/q-sub', () => {
  it('returns 403 when no organization context', async () => {
    authState.user = null;
    const res = await request(app).get('/api/q-sub');
    expect(res.status).toBe(403);
  });

  it('returns 422 when type is not in the canonical set', async () => {
    const res = await request(app).get('/api/q-sub?type=garbage');
    expect(res.status).toBe(422);
  });

  it('returns 422 when stage is not in the canonical set', async () => {
    const res = await request(app).get('/api/q-sub?stage=garbage');
    expect(res.status).toBe(422);
  });

  it('passes filters to the service and returns rows', async () => {
    svc.listQSubsForOrg.mockResolvedValue([{ id: 'q-1' }]);
    const res = await request(app).get('/api/q-sub?type=presub&stage=await&program_id=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');
    expect(res.status).toBe(200);
    // The route wraps in the canonical { data: ... } envelope via ok().
    expect(res.body.data?.count).toBe(1);
    expect(res.body.data?.rows).toEqual([{ id: 'q-1' }]);
    expect(svc.listQSubsForOrg).toHaveBeenCalledWith(7, {
      type: 'presub',
      stage: 'await',
      programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    });
  });
});

describe('POST /api/q-sub', () => {
  it('returns 422 when programId missing', async () => {
    const res = await request(app)
      .post('/api/q-sub')
      .send({ qSubType: 'presub', title: 'x' });
    expect(res.status).toBe(422);
  });

  it('returns 422 when programId is not a UUID', async () => {
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: 'not-a-uuid', qSubType: 'presub', title: 'x' });
    expect(res.status).toBe(422);
    // The route returns `{ error: 'Invalid body', details: { programId: [...] } }`
    // via clientError(res, 422, 'Invalid body', fieldErrors). The UUID-specific
    // message lives in details.programId, not in the top-level error string.
    expect(res.body.error).toBe('Invalid body');
    expect(JSON.stringify(res.body.details ?? {})).toMatch(/uuid/i);
  });

  it('returns 422 when qSubType is invalid', async () => {
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', qSubType: 'pre-sub', title: 'x' });
    expect(res.status).toBe(422);
  });

  it('returns 422 when title is empty', async () => {
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', qSubType: 'presub', title: '   ' });
    expect(res.status).toBe(422);
  });

  it('returns 422 when targetDate is malformed', async () => {
    const res = await request(app)
      .post('/api/q-sub')
      .send({
        programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
        qSubType: 'presub',
        title: 'x',
        targetDate: 'not-a-date',
      });
    expect(res.status).toBe(422);
  });

  it('returns 403 when service raises TenantAccessError', async () => {
    svc.createQSubmission.mockRejectedValue(new TenantAccessError('nope'));
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', qSubType: 'presub', title: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns 201 on success', async () => {
    svc.createQSubmission.mockResolvedValue({ id: 'q-new', programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1' });
    const res = await request(app)
      .post('/api/q-sub')
      .send({ programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', qSubType: 'presub', title: 'x' });
    expect(res.status).toBe(201);
    // Wrapped in { data: ... } envelope by created() helper.
    expect(res.body.data?.id).toBe('q-new');
  });
});

describe('GET /api/q-sub/:id', () => {
  it('returns 404 when service returns null', async () => {
    svc.getQSubDetail.mockResolvedValue(null);
    const res = await request(app).get('/api/q-sub/q-missing');
    expect(res.status).toBe(404);
  });

  it('returns 200 with detail body', async () => {
    svc.getQSubDetail.mockResolvedValue({ id: 'q-1', summary: 'x' });
    const res = await request(app).get('/api/q-sub/q-1');
    expect(res.status).toBe(200);
    // Wrapped in { data: ... } envelope by ok() helper.
    expect(res.body.data?.id).toBe('q-1');
  });
});

describe('PATCH /api/q-sub/commitments/:id/rolled-in', () => {
  it('returns 422 when rolledIn is not a boolean', async () => {
    const res = await request(app)
      .patch('/api/q-sub/commitments/c-1/rolled-in')
      .send({ rolledIn: 'true' });
    expect(res.status).toBe(422);
  });

  it('returns 403 when service raises TenantAccessError', async () => {
    svc.setCommitmentRolledIn.mockRejectedValue(new TenantAccessError('nope'));
    const res = await request(app)
      .patch('/api/q-sub/commitments/c-1/rolled-in')
      .send({ rolledIn: true });
    expect(res.status).toBe(403);
  });

  it('returns 200 on success and forwards user id when rolling in', async () => {
    svc.setCommitmentRolledIn.mockResolvedValue({ id: 'c-1', rolledIn: true });
    const res = await request(app)
      .patch('/api/q-sub/commitments/c-1/rolled-in')
      .send({ rolledIn: true });
    expect(res.status).toBe(200);
    expect(svc.setCommitmentRolledIn).toHaveBeenCalledWith(7, {
      commitmentId: 'c-1',
      rolledIn: true,
      rolledInBy: 'u-1',
    });
  });

  it('clears rolledInBy when toggling rolledIn off', async () => {
    svc.setCommitmentRolledIn.mockResolvedValue({ id: 'c-1', rolledIn: false });
    await request(app)
      .patch('/api/q-sub/commitments/c-1/rolled-in')
      .send({ rolledIn: false });
    expect(svc.setCommitmentRolledIn).toHaveBeenCalledWith(7, {
      commitmentId: 'c-1',
      rolledIn: false,
      rolledInBy: null,
    });
  });
});

describe('PUT /api/q-sub/:id/sections/:sectionKey — authorship is never invented', () => {
  const VALID_ID = '11111111-1111-4111-8111-111111111111';

  it('refuses to author a section body with no identified actor', async () => {
    // The prose is regulatory text bound for FDA and its clause-level author
    // lineage is written to document_span_lineage.asserted_by, whose CHECK
    // requires that column for an author_assertion. This used to satisfy that
    // constraint with the literal 'system' — a placeholder standing in for the
    // very attribution the constraint exists to guarantee. It now refuses,
    // matching create_qms_document / approve_qms_document.
    authState.user = { organizationId: '7' }; // org context, no user id
    svc.getQSubDetail.mockResolvedValue({ id: VALID_ID });

    const res = await request(app)
      .put(`/api/q-sub/${VALID_ID}/sections/device_description`)
      .send({ content: 'The device is a single-use catheter.' });

    expect(res.status).toBe(401);
    // Refused BEFORE any write is attempted — no prose, no lineage, no row.
    expect(JSON.stringify(res.body)).toMatch(/sign-in required/i);
  });

  it('still authors normally when the actor is identified', async () => {
    // Guards the refusal above against over-reach: a real signed-in author must
    // not be turned away. This gets past the 401 and fails later, at the DB,
    // which is enough to prove the actor check is not what stopped it.
    authState.user = { id: 'u-1', organizationId: '7' };
    svc.getQSubDetail.mockResolvedValue({ id: VALID_ID });

    const res = await request(app)
      .put(`/api/q-sub/${VALID_ID}/sections/device_description`)
      .send({ content: 'The device is a single-use catheter.' });

    expect(res.status).not.toBe(401);
  });
});
