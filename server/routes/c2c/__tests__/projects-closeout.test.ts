/**
 * /api/c2c/projects — close-out: archive, unarchive, soft delete.
 *
 * A program had no end state. It could be created and worked but never closed,
 * so a portfolio only ever grew, finished submissions sat beside live ones, and
 * the licensed seat a finished program held was never released.
 *
 * The properties worth locking are the ones that make close-out safe rather
 * than merely present: every transition is authorized like any other mutation,
 * writes an audit row in the SAME transaction as the status change, takes a row
 * lock so two concurrent close-outs cannot both claim to have made the change,
 * and never issues a hard DELETE — a regulated tenant does not get to make a
 * program vanish out from under its own audit trail.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const release = vi.fn();
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
  },
}));
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import projectsRouter from '../projects';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

const ID = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const ORG = 7;
const LEAD = 3;
const OTHER = 99;

/** The caller is a current member holding `role`; the route's own role checks still decide. */
function appAs(userId: number, role: string) {
  seatMember(ORG, userId, role);
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as Record<string, unknown>;
    r.organizationId = ORG; r.userId = userId; r.userRole = role;
    r.dbClient = { query: (...a: unknown[]) => query(...a) }; // the request's own connection
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

/**
 * The admission gate's lead read (a write needs canMutateProgram before the
 * route runs), BEGIN, the locking pre-read returning the program's current
 * state, then the in-transaction re-admission's FOR SHARE lead read.
 */
function programState(status: string, deletedAt: string | null = null, lead: number | null = LEAD) {
  query
    .mockResolvedValueOnce({ rows: [{ lead_user_id: lead }] })                         // gate: lead
    .mockResolvedValueOnce({ rows: [] })                                              // BEGIN
    .mockResolvedValueOnce({ rows: [{ lead_user_id: lead, status, deleted_at: deletedAt }] })
    .mockResolvedValueOnce({ rows: [{ lead_user_id: lead }] });                       // FOR SHARE re-read
}

const sqlCalls = () => query.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  query.mockResolvedValue({ rows: [] });
  delete process.env.PROGRAM_AUTHZ_MODE;
  clearSeats();
  seatProgram(ORG, ID);
});

describe('POST /:id/archive', () => {
  it('archives an active program and audits it in the same transaction', async () => {
    programState('active');
    const res = await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    expect(res.status).toBe(200);

    const sql = sqlCalls();
    const update = sql.findIndex((s) => s.includes("status = 'archived'"));
    const audit = sql.findIndex((s) => s.includes('INSERT INTO audit_logs'));
    const commit = sql.indexOf('COMMIT');
    expect(update).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(update);
    expect(commit).toBeGreaterThan(audit);
    expect(release).toHaveBeenCalled();
  });

  it('takes a row lock, so concurrent close-outs cannot both claim the change', async () => {
    programState('active');
    await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    expect(sqlCalls().some((s) => s.includes('FOR UPDATE'))).toBe(true);
  });

  it('scopes the pre-read to the caller org', async () => {
    programState('active');
    await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    const read = query.mock.calls.find((c) => String(c[0]).includes('FOR UPDATE'))!;
    expect(String(read[0])).toContain('organization_id = $2');
    expect(read[1]).toEqual([ID, ORG]);
  });

  it('DENIES a non-lead, non-manager and writes nothing', async () => {
    programState('active');
    const res = await request(appAs(OTHER, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PROJECT_WRITE_ACCESS_DENIED');
    const sql = sqlCalls();
    expect(sql.some((s) => s.includes("status = 'archived'"))).toBe(false);
    expect(sql.some((s) => s.includes('INSERT INTO audit_logs'))).toBe(false);
    // Since 14362ef00 the route admission gate refuses before the close-out
    // opens a transaction at all, so there is no BEGIN to roll back.
    expect(sql).not.toContain('BEGIN');
  });

  it('allows an org manager who does not lead the program', async () => {
    programState('active', null, LEAD);
    const res = await request(appAs(OTHER, 'admin')).post(`/api/c2c/projects/${ID}/archive`);
    expect(res.status).toBe(200);
  });

  it('refuses to archive twice', async () => {
    programState('archived');
    const res = await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    expect(res.status).toBe(400);
    expect(sqlCalls()).toContain('ROLLBACK');
  });

  it('refuses to archive a deleted program', async () => {
    programState('active', '2026-08-01T00:00:00Z');
    const res = await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    expect(res.status).toBe(400);
  });

  it('404s a program outside the caller org, without revealing it exists', async () => {
    clearSeats(); // the program is not in ORG, so the current-access gate answers 404 first
    const res = await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/archive`);
    expect(res.status).toBe(404);
    expect(sqlCalls().some((q) => q.includes('BEGIN'))).toBe(false);
  });
});

describe('POST /:id/unarchive', () => {
  it('restores an archived program to active', async () => {
    programState('archived');
    const res = await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/unarchive`);
    expect(res.status).toBe(200);
    expect(sqlCalls().some((s) => s.includes("status = 'active'"))).toBe(true);
  });

  it('refuses to unarchive something that is not archived', async () => {
    programState('active');
    const res = await request(appAs(LEAD, 'member')).post(`/api/c2c/projects/${ID}/unarchive`);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /:id', () => {
  it('soft deletes — sets deleted_at, never a hard DELETE', async () => {
    programState('active');
    const res = await request(appAs(LEAD, 'member')).delete(`/api/c2c/projects/${ID}`);
    expect(res.status).toBe(200);

    const sql = sqlCalls();
    expect(sql.some((s) => s.includes('deleted_at = now()'))).toBe(true);
    // The row has to survive: audit rows reference it, and so may a submission.
    expect(sql.some((s) => /DELETE\s+FROM\s+regulatory_programs/i.test(s))).toBe(false);
  });

  it('DENIES a non-lead, non-manager', async () => {
    programState('active');
    const res = await request(appAs(OTHER, 'member')).delete(`/api/c2c/projects/${ID}`);
    expect(res.status).toBe(403);
  });

  it('refuses to delete twice', async () => {
    programState('active', '2026-08-01T00:00:00Z');
    const res = await request(appAs(LEAD, 'member')).delete(`/api/c2c/projects/${ID}`);
    expect(res.status).toBe(400);
  });
});

describe('archived programs leave the portfolio', () => {
  it('excludes archived by default', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appAs(LEAD, 'member')).get('/api/c2c/projects');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("p.status <> 'archived'");
    expect(params[3]).toBe(false);
  });

  it('includes them on request, so close-out is reversible from the UI', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appAs(LEAD, 'member')).get('/api/c2c/projects?includeArchived=true');
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params[3]).toBe(true);
  });
});
