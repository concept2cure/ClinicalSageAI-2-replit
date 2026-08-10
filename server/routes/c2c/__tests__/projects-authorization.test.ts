/**
 * /api/c2c/projects — the per-program authorization boundary, at the HTTP layer.
 *
 * program-access.test.ts covers the decision function in isolation. This covers
 * the thing that actually protects a tenant: that the ROUTER consults it, on the
 * routes that mutate, and denies over the wire. A correct predicate nobody calls
 * is the exact defect being fixed here — every handler in this file used to gate
 * on `organization_id` alone, which answers "is this program in my org?", not
 * "may this caller change it?", so any org member could repin or unpin another
 * team's evidence — the set the AI generation path reads.
 *
 * Two properties are load-bearing and easy to regress:
 *   - READ routes must stay ungated. There is no membership store for uuid-keyed
 *     programs (project_members.project_id is an integer FK to the OTHER project
 *     table), so gating reads would deny every non-lead access to projects they
 *     legitimately work in. Asserted below, not assumed.
 *   - A program outside the caller's org must 404, never 403. A 403 would confirm
 *     the id exists in some other tenant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import projectsRouter from '../projects';

const PROGRAM_ID = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const ORG = 7;
const LEAD = 3;
const OTHER_MEMBER = 99;

/** Mount the router behind the fields the auth middleware populates from the JWT. */
function appAs(userId: number | null, role: string | null, org: number | null = ORG) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as Record<string, unknown>;
    if (org !== null) r.organizationId = org;
    if (userId !== null) r.userId = userId;
    if (role !== null) r.userRole = role;
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

/** The authz pre-read: the program exists in this org, led by `leadUserId`. */
function programLedBy(leadUserId: number | null) {
  query.mockResolvedValueOnce({ rows: [{ lead_user_id: leadUserId }] });
}

const validEvidence = { evidenceKind: 'artifact', evidenceRef: 'ref-1', title: 'Pivotal CSR' };

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  query.mockResolvedValue({ rows: [] });
  delete process.env.PROGRAM_AUTHZ_MODE;
});

afterEach(() => {
  delete process.env.PROGRAM_AUTHZ_MODE;
});

describe('POST /:id/evidence — authorization', () => {
  it('allows the program lead', async () => {
    programLedBy(LEAD);
    query.mockResolvedValueOnce({ rows: [{ id: 'ev1' }] }); // the INSERT
    const res = await request(appAs(LEAD, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(201);
  });

  it('DENIES an org member who is neither the lead nor a manager', async () => {
    programLedBy(LEAD);
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(403);
    // Denied before the write: the only statement issued is the authz pre-read.
    expect(query).toHaveBeenCalledTimes(1);
    const issued = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(issued).not.toContain('INSERT INTO c2c_project_pinned_evidence');
  });

  it('allows an org manager who does not lead the program', async () => {
    programLedBy(LEAD);
    query.mockResolvedValueOnce({ rows: [{ id: 'ev1' }] });
    const res = await request(appAs(OTHER_MEMBER, 'admin'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(201);
  });

  it('denies when the program has no lead — unowned is not everyone-owned', async () => {
    programLedBy(null);
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(403);
  });

  it('404s a program outside the caller org — never 403, which would confirm it exists', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // org-scoped pre-read finds nothing
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(404);
    // The org predicate is what makes the 404 honest rather than a guess.
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('organization_id = $2');
    expect(params).toEqual([PROGRAM_ID, ORG]);
  });

  it('warn mode ALLOWS the denied request, so the rule can soak before it rejects', async () => {
    process.env.PROGRAM_AUTHZ_MODE = 'warn';
    programLedBy(LEAD);
    query.mockResolvedValueOnce({ rows: [{ id: 'ev1' }] });
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(201);
  });

  it('an unrecognized mode falls back to enforce rather than opening up', async () => {
    process.env.PROGRAM_AUTHZ_MODE = 'off';
    programLedBy(LEAD);
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /:id/evidence/:evId — authorization', () => {
  it('DENIES a non-lead, non-manager org member', async () => {
    programLedBy(LEAD);
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .delete(`/api/c2c/projects/${PROGRAM_ID}/evidence/ev1`);
    expect(res.status).toBe(403);
    const issued = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(issued).not.toContain('DELETE FROM');
  });

  it('allows the lead', async () => {
    programLedBy(LEAD);
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ev1' }] });
    const res = await request(appAs(LEAD, 'member'))
      .delete(`/api/c2c/projects/${PROGRAM_ID}/evidence/ev1`);
    expect(res.status).toBeLessThan(400);
  });
});

describe('read routes stay ungated', () => {
  // Gating these would evaluate to "private to the lead" for every program that
  // exists, because nothing can record membership for a uuid-keyed program yet.
  // Read-side privacy waits on the id-space convergence (ADR-0011).
  const reads: Array<[string, string]> = [
    ['program metadata', `/api/c2c/projects/${PROGRAM_ID}`],
    ['team roster', `/api/c2c/projects/${PROGRAM_ID}/team`],
    ['pinned evidence', `/api/c2c/projects/${PROGRAM_ID}/evidence`],
    ['activity', `/api/c2c/projects/${PROGRAM_ID}/activity`],
    ['workstreams', `/api/c2c/projects/${PROGRAM_ID}/workstreams`],
    ['drafts', `/api/c2c/projects/${PROGRAM_ID}/drafts`],
  ];

  for (const [label, path] of reads) {
    it(`${label} is readable by a non-lead org member`, async () => {
      // Every statement the read issues resolves to a benign row set; what is
      // under test is that no 403 comes back from the authorization layer.
      query.mockResolvedValue({ rows: [{ id: PROGRAM_ID, name: 'BX-204' }] });
      const res = await request(appAs(OTHER_MEMBER, 'member')).get(path);
      expect(res.status).not.toBe(403);
    });
  }
});
