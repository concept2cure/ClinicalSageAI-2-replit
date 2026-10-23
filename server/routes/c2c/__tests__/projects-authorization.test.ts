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
 *   - READ routes admit every current member, not just the lead. Since 14362ef00
 *     reads are no longer ungated: every /:id route goes through
 *     requireCurrentProgramAccess (project-route-access.ts), which admits through
 *     the program's integer project anchor and the durable sharing roster. What
 *     must not regress is that the LEAD rule leaks onto reads. Asserted below.
 *   - A program outside the caller's org must 404, never 403. A 403 would confirm
 *     the id exists in some other tenant.
 *
 * The gate's four reads (org, member, anchor, roster) are answered by the shared
 * double (support/current-member.ts) and proven on PostgreSQL by its own suites;
 * the lead/role decision after them stays real and is what this file drives.
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
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});

import projectsRouter from '../projects';
import { clearSeats, seatMember, seatProgram } from './support/current-member';

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
    r.dbClient = { query: (...a: unknown[]) => query(...a) };
    next();
  });
  app.use('/api/c2c/projects', projectsRouter);
  return app;
}

/**
 * The program's lead, as the mutation pre-read sees it. A write reads it twice
 * (the route admission, then again FOR SHARE inside the write transaction), so
 * the answer is keyed on the statement rather than queued. The pin/unpin
 * statements succeed; everything else (BEGIN, audit chain, COMMIT) is empty.
 */
function programLedBy(leadUserId: number | null) {
  query.mockImplementation(async (sql: string) => {
    if (/SELECT lead_user_id FROM regulatory_programs/.test(sql)) return { rows: [{ lead_user_id: leadUserId }] };
    if (/(INSERT INTO|DELETE FROM) c2c_project_pinned_evidence/.test(sql)) return { rowCount: 1, rows: [{ id: 'ev1' }] };
    return { rows: [] };
  });
}

const validEvidence = { evidenceKind: 'artifact', evidenceRef: 'ref-1', title: 'Pivotal CSR' };

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  query.mockResolvedValue({ rows: [] });
  delete process.env.PROGRAM_AUTHZ_MODE;
  clearSeats();
  seatMember(ORG, LEAD, 'member');
  seatMember(ORG, OTHER_MEMBER, 'member');
  seatProgram(ORG, PROGRAM_ID);
});

afterEach(() => {
  delete process.env.PROGRAM_AUTHZ_MODE;
});

describe('POST /:id/evidence — authorization', () => {
  it('allows the program lead', async () => {
    programLedBy(LEAD);
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
    seatMember(ORG, OTHER_MEMBER, 'admin');
    programLedBy(LEAD);
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
    clearSeats();
    seatMember(ORG, OTHER_MEMBER, 'admin'); // even a manager here
    seatProgram(ORG + 1, PROGRAM_ID);       // the id exists — in another tenant
    const res = await request(appAs(OTHER_MEMBER, 'admin'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
    // Refused at admission: no statement, so no write. The org predicate that
    // makes the real gate's 404 honest (programInOrganization) is pinned in
    // server/services/c2c/__tests__/program-access.test.ts.
    expect(query).not.toHaveBeenCalled();
  });

  // Behaviour change (14362ef00): PROGRAM_AUTHZ_MODE=warn no longer opens a
  // mutation. Admission now rests on the caller's current membership and role,
  // and there is no soak mode on it; warn was a pre-launch observation aid that
  // let any org member repin another team's evidence. The env is ignored.
  it.each(['warn', 'off'])('PROGRAM_AUTHZ_MODE=%s does not open a denied mutation — the gate has no soak mode', async (mode) => {
    process.env.PROGRAM_AUTHZ_MODE = mode;
    programLedBy(LEAD);
    const res = await request(appAs(OTHER_MEMBER, 'member'))
      .post(`/api/c2c/projects/${PROGRAM_ID}/evidence`).send(validEvidence);
    expect(res.status).toBe(403);
    const issued = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(issued).not.toContain('INSERT INTO c2c_project_pinned_evidence');
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
    const res = await request(appAs(LEAD, 'member'))
      .delete(`/api/c2c/projects/${PROGRAM_ID}/evidence/ev1`);
    expect(res.status).toBeLessThan(400);
  });
});

describe('the lead rule does not apply to reads (sharing admission is proven in the pglite gate suites)', () => {
  // Behaviour change (14362ef00): reads are no longer ungated. They pass the
  // current-access gate (org, current membership, one anchor, sharing roster),
  // which is what the durable roster now makes possible. What this pins is that
  // the LEAD rule stays off reads: a non-lead current member is admitted.
  const reads: Array<[string, string]> = [
    ['program metadata', `/api/c2c/projects/${PROGRAM_ID}`],
    ['team roster', `/api/c2c/projects/${PROGRAM_ID}/team`],
    ['pinned evidence', `/api/c2c/projects/${PROGRAM_ID}/evidence`],
    ['activity', `/api/c2c/projects/${PROGRAM_ID}/activity`],
    ['dossier', `/api/c2c/projects/${PROGRAM_ID}/dossier`],
    ['drafts', `/api/c2c/projects/${PROGRAM_ID}/drafts`],
  ];

  for (const [label, path] of reads) {
    it(`${label} is readable by a non-lead org member`, async () => {
      // Every statement the read issues resolves to a benign row set; what is
      // under test is that no 403 comes back from the authorization layer.
      query.mockResolvedValue({ rows: [{ id: PROGRAM_ID, name: 'BX-204' }] });
      const res = await request(appAs(OTHER_MEMBER, 'member')).get(path);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(503);
    });
  }

  it('a caller who is not a current member is refused, concealed as 404', async () => {
    query.mockResolvedValue({ rows: [{ id: PROGRAM_ID, name: 'BX-204' }] });
    const res = await request(appAs(12345, 'member')).get(`/api/c2c/projects/${PROGRAM_ID}`);
    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
});
