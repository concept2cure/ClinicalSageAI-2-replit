/**
 * POST/PATCH /api/mdx/risk-items — the assignee must belong to the risk's
 * organization.
 *
 * `public.users` has no RLS, and the engineering panel joins users on
 * `risk_items.assigned_to` to show the owner's name. That join raised 42703
 * (it selected a `username` column that no deployed database has) until
 * 2026-09-22, which hid the fact that `assignedTo` was accepted unchecked:
 * the moment the read worked, an editor in one tenant could assign any user id
 * and read another tenant's user's name back
 * (docs/evidence/W2/2026-09-22/repro-mdx-owner-cross-tenant.txt).
 *
 * The write side now refuses a non-member with 422 and fails closed when
 * membership cannot be verified; nothing is written in either case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import riskRouter from '../mdx-risk-management';

const ORG = 7;
let membership: 'member' | 'revoked' | 'indeterminate';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG, id: 1, role: 'member' };
    Object.assign(req, { dbClient: { query: (...args: unknown[]) => query(...args) } });
    next();
  });
  a.use('/api/mdx', riskRouter);
  return a;
}

const wrote = () => query.mock.calls.some((c) => /\b(INSERT\s+INTO|UPDATE)\s+risk_items/i.test(String(c[0])));
const assigneeChecks = () => query.mock.calls.filter((c) => /SELECT ou\.role/.test(String(c[0]))
  && (c[1] as unknown[])[1] !== 1);
const item = { hazard: 'h', harm: 'x', severity: 3, probability: 2 };

beforeEach(() => {
  query.mockReset();
  membership = 'member';
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/SELECT ou\.role/.test(sql)) {
      if (params[1] === 1) return { rows: [{ role: 'member' }] };
      if (membership === 'indeterminate') throw new Error('membership store unavailable');
      return { rows: membership === 'member' ? [{ role: 'member' }] : [] };
    }
    return { rows: [{ id: 1, program_id: null }] };
  });
});

describe('risk assignee must be a member of the organization', () => {
  it('creates the risk when the assignee is a member', async () => {
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, assignedTo: 42 });
    expect(res.status).toBe(201);
    expect(assigneeChecks()).toHaveLength(1);
    expect(assigneeChecks()[0][1]).toEqual([ORG, 42]);
    expect(assigneeChecks()[0][0]).toContain('FOR SHARE OF ou,u,o');
    expect(wrote()).toBe(true);
  });

  it('refuses a user of another organization with 422 and writes nothing', async () => {
    membership = 'revoked';
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, assignedTo: 99 });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/not a member/);
    expect(wrote()).toBe(false);
  });

  it('fails closed when membership cannot be verified', async () => {
    membership = 'indeterminate';
    const res = await request(app()).post('/api/mdx/risk-items').send({ ...item, assignedTo: 42 });
    expect(res.status).toBe(503);
    expect(wrote()).toBe(false);
  });

  it('applies the same rule to PATCH', async () => {
    membership = 'revoked';
    const res = await request(app()).patch('/api/mdx/risk-items/1').send({ assignedTo: 99 });
    expect(res.status).toBe(422);
    expect(wrote()).toBe(false);
  });

  it('does not consult membership when no assignee is sent or it is cleared', async () => {
    await request(app()).post('/api/mdx/risk-items').send(item);
    await request(app()).patch('/api/mdx/risk-items/1').send({ assignedTo: null });
    await request(app()).patch('/api/mdx/risk-items/1').send({ severity: 4 });
    expect(assigneeChecks()).toEqual([]);
    expect(wrote()).toBe(true);
  });
});
