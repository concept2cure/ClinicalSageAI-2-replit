/**
 * PATCH cannot activate an RBM record. The signature is the only way to 'active'.
 *
 * WHAT WENT WRONG
 * `POST /rbm-assessments/:id/approve` is a full 21 CFR Part 11 e-signature: a
 * reason for change, the signer's password and second factor re-verified at the
 * moment of signing (§11.200), a signing-authority check against their org role
 * (§11.10(g)), and the two-person rule against `created_by` (§11.10(d)).
 *
 * Every bit of it was reachable around. `patchAssessBody` was
 * `createAssessBody.partial()`, whose `status` enum includes 'active', and
 * `ASSESS_COL` maps `status` straight into the UPDATE. So
 * `PATCH { status: 'active' }` activated a governing risk assessment with no
 * reason, no credentials, no role check and no independent reviewer — and left
 * `approved_by` and `approved_at` NULL while the row read as approved. The
 * monitoring-plan PATCH had the identical hole.
 *
 * A gate with a door beside it is not a gate, and this one was the easiest path
 * to reach of the two.
 *
 * WHAT IS PINNED
 * That PATCH refuses 'active' on both routes, and that it still accepts 'draft'
 * and 'archived' — those carry no signature meaning, so ordinary editing and
 * retirement must keep working. The refusal is a 422 from the body schema,
 * which fires before any database access, so no DB fixture is needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* A benign pool. The guard is asserted by the 422 AND by `query` never being
   called — a throwing mock surfaced as an unhandled error and attributed itself
   to every test in the file, which hid which one actually regressed. */
const query = vi.hoisted(() => vi.fn(async () => ({ rows: [], rowCount: 0 })));
vi.mock('../../db', () => ({
  pool: { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) },
}));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: vi.fn() }));
vi.mock('../../services/ana-ri/governed-action-signoff', () => ({
  verifySignerCredentials: vi.fn(),
  defaultSignoffDeps: {},
}));

import rbmRouter from '../mdx-rbm';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 7, userId: 7, organizationId: 1, role: 'admin' };
    next();
  });
  a.use('/api/mdx', rbmRouter);
  return a;
}

beforeEach(() => query.mockClear());

describe('PATCH /rbm-assessments/:id cannot set status=active', () => {
  it('refuses active, and never reaches the database', async () => {
    const res = await request(app()).patch('/api/mdx/rbm-assessments/42').send({ status: 'active' });
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('still accepts draft', async () => {
    const res = await request(app()).patch('/api/mdx/rbm-assessments/42').send({ status: 'draft' });
    // Past the schema and into the UPDATE: not refused by the status guard.
    expect(res.status).not.toBe(422);
    expect(query).toHaveBeenCalled();
  });

  it('still accepts archived', async () => {
    const res = await request(app()).patch('/api/mdx/rbm-assessments/42').send({ status: 'archived' });
    expect(res.status).not.toBe(422);
  });

  it('still accepts a non-status edit', async () => {
    const res = await request(app()).patch('/api/mdx/rbm-assessments/42').send({ title: 'Renamed' });
    expect(res.status).not.toBe(422);
  });
});

describe('PATCH /rbm-monitoring-plans/:id cannot set status=active', () => {
  it('refuses active, and never reaches the database', async () => {
    const res = await request(app()).patch('/api/mdx/rbm-monitoring-plans/42').send({ status: 'active' });
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('still accepts draft and archived', async () => {
    for (const status of ['draft', 'archived']) {
      const res = await request(app()).patch('/api/mdx/rbm-monitoring-plans/42').send({ status });
      expect(res.status, `plan PATCH refused ${status}`).not.toBe(422);
    }
  });
});
