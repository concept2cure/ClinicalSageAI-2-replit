/**
 * PUT /api/submissions/sequences/:seqId/leaves requires the reason for the
 * placement and hands it to the service, which records it on the audit row.
 *
 * A placement decides what content goes into a regulator-facing sequence. The
 * audit row recorded what changed (section code, lifecycle operation) and never
 * why: none of the three placement dialogs asked, and the schema had no field
 * (PX-1, docs/evidence/reviews/2026-09-24/lenses.md). The floor is the one rule
 * in server/routes/governed-reason.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-leaf-reason-secret-32-chars';
});

const svc = vi.hoisted(() => ({ upsertLeaf: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return { ...actual, upsertLeaf: (...a: unknown[]) => svc.upsertLeaf(...a) };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const LEAF = { sectionCode: '2.5', title: 'Clinical Overview', lifecycleOp: 'new' };

beforeEach(() => {
  svc.upsertLeaf.mockReset();
  svc.upsertLeaf.mockResolvedValue({ id: 99, sectionCode: '2.5', auditTrail: { persisted: true } });
});

describe('the leaf placement route requires its reason', () => {
  it('refuses a placement with no reason, and places nothing', async () => {
    const res = await request(app).put('/api/submissions/sequences/11/leaves').send(LEAF);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(res.body.error.message).toMatch(/reason for change of at least 8 characters/);
    expect(svc.upsertLeaf).not.toHaveBeenCalled();
  });

  it('refuses a reason under the floor', async () => {
    const res = await request(app).put('/api/submissions/sequences/11/leaves').send({ ...LEAF, reason: '  ok  ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(svc.upsertLeaf).not.toHaveBeenCalled();
  });

  it('passes the trimmed reason to the service with the placement', async () => {
    const res = await request(app)
      .put('/api/submissions/sequences/11/leaves')
      .send({ ...LEAF, reason: '  Clinical overview approved for sequence 0003  ' });
    expect(res.status).toBe(200);
    expect(svc.upsertLeaf).toHaveBeenCalledTimes(1);
    expect(svc.upsertLeaf.mock.calls[0][0]).toMatchObject({
      sequenceId: 11,
      sectionCode: '2.5',
      reason: 'Clinical overview approved for sequence 0003',
    });
  });
});
