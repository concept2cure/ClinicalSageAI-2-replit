/**
 * An evidence-sufficiency assessment is recorded as run by the signed-in user.
 *
 * What the code used to do (2026-10-15): POST /programs/:programId/assess
 * recorded `triggeredBy: 'system'` when the request carried no user id, so an
 * assessment nobody can be named for was stored as the platform's own act.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { svc, user } = vi.hoisted(() => ({
  svc: {
    assessSufficiency: vi.fn(),
    getAssessment: vi.fn(),
    listProgramAssessments: vi.fn(),
  },
  user: { current: { organizationId: 7 } as Record<string, unknown> },
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = user.current;
    next();
  },
}));
vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'prog-1' }] }) }) }),
  },
  pool: {},
}));
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: async () => true }));
vi.mock('../../services/evidence-sufficiency/evidence-sufficiency.service', () => svc);
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })),
}));

import router from '../evidence-sufficiency';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/evidence-sufficiency', router);
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe('POST /programs/:programId/assess names who ran it', () => {
  it('refuses a request that names no user, and records nothing', async () => {
    user.current = { organizationId: 7 };
    const res = await request(app())
      .post('/api/evidence-sufficiency/programs/prog-1/assess')
      .send({ pathway: '510K', profile: {} });
    expect(res.status).toBe(401);
    expect(svc.assessSufficiency).not.toHaveBeenCalled();
  });

  it('records the signed-in user as the one who ran it', async () => {
    user.current = { id: 5, organizationId: 7 };
    svc.assessSufficiency.mockResolvedValue({ id: 'a-1', verdict: 'incomplete' });
    const res = await request(app())
      .post('/api/evidence-sufficiency/programs/prog-1/assess')
      .send({ pathway: '510K', profile: {} });
    expect(svc.assessSufficiency).toHaveBeenCalledWith(expect.objectContaining({ triggeredBy: '5' }));
    expect(res.status).toBeLessThan(300);
  });
});
