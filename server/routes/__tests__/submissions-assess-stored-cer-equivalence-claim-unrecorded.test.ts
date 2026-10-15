/**
 * GET /api/submissions/device/cer/:reportId/assess-stored reads ?equivalenceClaimed
 * as true, false or unstated (2026-10-15).
 *
 * The route parsed `req.query.equivalenceClaimed === 'true' || … === '1'`, so a
 * request that did not say whether equivalence is claimed reached assessStoredCer
 * as "not claimed" — and a stored CER with no Equivalence section came back
 * ready. 'true'/'1' is a claim, 'false'/'0' is no claim, anything else is unstated
 * and the engine names the missing fact.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'submissions-assess-stored-cer-secret-32';
});

const stored = vi.hoisted(() => ({ assessStoredCer: vi.fn() }));
vi.mock('../../services/market-specs/stored-cer-assessment.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assessStoredCer: (...a: unknown[]) => stored.assessStoredCer(...a),
}));

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

const claimPassed = async (query: string): Promise<boolean | undefined> => {
  stored.assessStoredCer.mockClear();
  const res = await request(app).get(`/api/submissions/device/cer/CER-1/assess-stored${query}`);
  expect(res.status).toBe(200);
  expect(stored.assessStoredCer).toHaveBeenCalledTimes(1);
  const params = stored.assessStoredCer.mock.calls[0][0] as { reportId: string; organizationId: number; equivalenceClaimed?: boolean };
  expect(params).toMatchObject({ reportId: 'CER-1', organizationId: 7 });
  return params.equivalenceClaimed;
};

beforeEach(() => {
  stored.assessStoredCer.mockReset();
  stored.assessStoredCer.mockResolvedValue({ reportId: 'CER-1' });
});

describe('GET /device/cer/:reportId/assess-stored', () => {
  it('passes an absent equivalenceClaimed on as unstated, not "not claimed"', async () => {
    expect(await claimPassed(''), 'an absent claim was passed as "not claimed"').toBeUndefined();
  });

  it('reads true/1 as a claim and false/0 as no claim', async () => {
    expect(await claimPassed('?equivalenceClaimed=true')).toBe(true);
    expect(await claimPassed('?equivalenceClaimed=1')).toBe(true);
    expect(await claimPassed('?equivalenceClaimed=false')).toBe(false);
    expect(await claimPassed('?equivalenceClaimed=0')).toBe(false);
  });

  it('reads anything else as unstated', async () => {
    expect(await claimPassed('?equivalenceClaimed=maybe')).toBeUndefined();
    expect(await claimPassed('?equivalenceClaimed=')).toBeUndefined();
  });
});
