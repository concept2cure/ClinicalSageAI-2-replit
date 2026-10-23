/**
 * GET /api/submissions/:id/application-number reads only what the caller's
 * project access admits (security review of P-44, 2026-10-22): it goes through
 * getSubmissionForRequest, as every submission read does, before the market's
 * number and its home agency are read. A refused read answers the refusal and
 * reads nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-market-number-route-secret-32';
});

const db = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
const { getSubmissionForRequest, readMarketApplicationNumber } = vi.hoisted(() => ({
  getSubmissionForRequest: vi.fn(), readMarketApplicationNumber: vi.fn(),
}));
vi.mock('../../services/submission-service/submission-request-read', async (importOriginal) => ({
  ...(await importOriginal<object>()), getSubmissionForRequest,
}));
vi.mock('../../services/submission-service/market-application-number', async (importOriginal) => ({
  ...(await importOriginal<object>()), readMarketApplicationNumber,
}));

import request from 'supertest';
import express from 'express';
import { expandRoleClaims } from '../../middleware/auth';
import { SubmissionReadError } from '../../services/submission-service/submission-request-read';
import submissionsRouter from '../submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('regulatory-author', undefined) };
  req.dbClient = db;
  next();
});
app.use('/api/submissions', submissionsRouter);

beforeEach(() => {
  getSubmissionForRequest.mockReset();
  readMarketApplicationNumber.mockReset();
  readMarketApplicationNumber.mockResolvedValue({ submissionId: 2, home: false, market: 'EU', homeAgency: 'FDA', applicationNumber: null, lastRecorded: null });
});

describe('GET /:id/application-number is held to project access', () => {
  it('answers the access refusal, and reads no number', async () => {
    getSubmissionForRequest.mockRejectedValue(new SubmissionReadError(403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this project.'));
    const res = await request(app).get('/api/submissions/2/application-number');
    expect(res.status).toBe(403);
    expect(readMarketApplicationNumber).not.toHaveBeenCalled();
  });

  it('reads the market\'s number once the read is admitted', async () => {
    getSubmissionForRequest.mockResolvedValue({ id: 2 });
    const res = await request(app).get('/api/submissions/2/application-number');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ market: 'EU', home: false });
    expect(getSubmissionForRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: 7 }), 2, expect.anything());
  });
});
