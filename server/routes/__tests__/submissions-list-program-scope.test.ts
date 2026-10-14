/**
 * GET /api/submissions?programId=<uuid> lists one program's submissions (QA j3 finding (b), 2026-10-08).
 *
 * The filing picker asks for its program's list, and the server answers with the
 * admitted rows in the success envelope, without disclosing hidden-row counts.
 * Without programId the admitted list keeps its existing bare-array shape. A malformed
 * programId is refused, not ignored: an ignored filter would offer everything.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-list-scope-secret-32-chars';
});

const svc = vi.hoisted(() => ({ listSubmissions: vi.fn() }));
vi.mock('../../services/submission-service/submission-request-read', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-request-read')>();
  return { ...actual, listSubmissionsForRequest: (...a: unknown[]) => svc.listSubmissions(...a) };
});

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

const app = express();
const q = { query: vi.fn() };
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  req.dbClient = q;
  next();
});
app.use('/api/submissions', submissionsRouter);

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ALL = [
  { id: 1, title: 'Own IND', programId: PROGRAM },
  { id: 2, title: 'Other IND', programId: '33333333-3333-4333-8333-333333333333' },
  { id: 3, title: 'Unanchored IND', programId: null },
];

/* The service answers as the database would: scoped by programId when given. */
function answer(_q: unknown, _ctx: unknown, programId?: string) {
  const admitted = [ALL[0]];
  return Promise.resolve(programId ? admitted.filter((row) => row.programId === programId) : admitted);
}

beforeEach(() => {
  svc.listSubmissions.mockReset();
  svc.listSubmissions.mockImplementation(answer);
});

describe('GET /api/submissions', () => {
  it('without programId, keeps the existing bare list shape for admitted records', async () => {
    const res = await request(app).get('/api/submissions');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([ALL[0]]);
    expect(svc.listSubmissions).toHaveBeenCalledTimes(1);
    expect(svc.listSubmissions.mock.calls[0][0]).toBe(q);
    expect(svc.listSubmissions.mock.calls[0][2]).toBeUndefined();
  });

  it("with programId, returns admitted submissions without a hidden-row count", async () => {
    const res = await request(app).get(`/api/submissions?programId=${PROGRAM.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [ALL[0]] });
    expect(svc.listSubmissions.mock.calls.map((c) => c[2])).toContain(PROGRAM);
  });

  it('refuses a programId that is not a program uuid, rather than ignoring it and offering everything', async () => {
    const res = await request(app).get('/api/submissions?programId=not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(svc.listSubmissions).not.toHaveBeenCalled();
  });
});
