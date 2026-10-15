/**
 * POST /api/submissions/:id/program-anchor — anchor a submission that records no
 * project to one (P-14's remedy, docs/LAUNCH_DEFINITION_OF_DONE.md). The route
 * requires the reason for the change and reads the caller's organisation role
 * from the membership row, never the token or the body; the service applies the
 * rules (submission-program-anchor.pglite.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-program-anchor-secret-32-chars';
});

const svc = vi.hoisted(() => ({ anchor: vi.fn(), role: vi.fn(), candidates: vi.fn() }));
vi.mock('../../services/submission-service/submission-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/submission-service/submission-service')>();
  return {
    ...actual,
    anchorSubmissionToProgram: (...a: unknown[]) => svc.anchor(...a),
    listAnchorCandidates: (...a: unknown[]) => svc.candidates(...a),
  };
});
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: (...a: unknown[]) => svc.role(...a) }));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';
import { SubmissionError } from '../../services/submission-service/submission-service';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  // The token says admin; the membership row decides.
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'admin', roles: expandRoleClaims('admin', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

const PROGRAM = '0a000000-0000-4000-8000-00000000000a';
const REASON = 'Legacy IND created before submissions recorded their project.';

beforeEach(() => {
  svc.anchor.mockReset();
  svc.role.mockReset();
  svc.role.mockResolvedValue('member');
  svc.anchor.mockResolvedValue({ id: 12, programId: PROGRAM });
});

describe('the anchor route', () => {
  it('refuses with no reason, and anchors nothing', async () => {
    const res = await request(app).post('/api/submissions/12/program-anchor').send({ programId: PROGRAM });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
    expect(svc.anchor).not.toHaveBeenCalled();
  });

  it('refuses a project id that is not a uuid, and anchors nothing', async () => {
    const res = await request(app).post('/api/submissions/12/program-anchor').send({ programId: 'BX-204', reason: REASON });
    expect(res.status).toBe(400);
    expect(svc.anchor).not.toHaveBeenCalled();
  });

  it('passes the trimmed reason and the membership row’s role to the service', async () => {
    const res = await request(app).post('/api/submissions/12/program-anchor').send({ programId: PROGRAM, reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 12, programId: PROGRAM });
    expect(svc.role).toHaveBeenCalledWith(3, 7);
    expect(svc.anchor).toHaveBeenCalledWith(
      { submissionId: 12, programId: PROGRAM, reason: REASON },
      { organizationId: 7, userId: 3, orgRole: 'member' },
    );
  });

  it('answers a refusal with its status and the server’s words', async () => {
    svc.anchor.mockRejectedValue(new SubmissionError('FORBIDDEN', 'Only the project’s lead or an organization manager can anchor a submission to it. Nothing was changed.'));
    const res = await request(app).post('/api/submissions/12/program-anchor').send({ programId: PROGRAM, reason: REASON });
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: expect.stringMatching(/lead or an organization manager/) });
  });
});

/* QA 2026-10-08 (j6): the control offered every programme. The server now says
   which projects this submission may be anchored to (its own filing type), by
   the rule the anchor itself applies, so the client offers only those. */
describe('the anchor candidates route', () => {
  it('answers the projects of the submission’s filing type, from the service', async () => {
    svc.candidates.mockResolvedValue({ applicationType: 'nda', candidates: [{ id: PROGRAM, code: 'N-1', title: 'Program N-1' }], otherTypes: 20 });
    const res = await request(app).get('/api/submissions/12/program-anchor');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ applicationType: 'nda', candidates: [{ id: PROGRAM, code: 'N-1', title: 'Program N-1' }], otherTypes: 20 });
    expect(svc.candidates).toHaveBeenCalledWith(12, { organizationId: 7, userId: 3 });
  });

  it('answers a refusal with its status', async () => {
    svc.candidates.mockRejectedValue(new SubmissionError('NOT_FOUND', 'Submission not found for this organization.'));
    const res = await request(app).get('/api/submissions/12/program-anchor');
    expect(res.status).toBe(404);
  });

  it('a type mismatch on the anchor itself is a 409 in the server’s words', async () => {
    svc.anchor.mockRejectedValue(new SubmissionError('APPLICATION_TYPE_MISMATCH' as never, 'This submission is an NDA. Nothing was changed.'));
    const res = await request(app).post('/api/submissions/12/program-anchor').send({ programId: PROGRAM, reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'APPLICATION_TYPE_MISMATCH', message: 'This submission is an NDA. Nothing was changed.' });
  });
});
