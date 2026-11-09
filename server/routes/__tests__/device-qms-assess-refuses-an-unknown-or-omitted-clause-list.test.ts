/**
 * POST /api/submissions/device/qms/assess answers 400 VALIDATION for a clause list it cannot assess (S5b, 2026-11-09).
 *
 * Before: the route defaulted an omitted `presentClauseIds` to [], so `{}` answered 200, ready: false, with all ten
 * required clauses missing (an omitted list read as an empty one). An id that is not a clause id ('CAPA') counted
 * as no clause, so the clause it meant was reported missing. S5b's QMS engine refuses such an id by index
 * (`ComputationRefusal`, quality-system.ts). Without the route's own mapping, that refusal reached `fail()`, whose
 * status table has no entry for `invalid_input`, and answered 500 INTERNAL.
 */
import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'device-qms-route-test-secret-32-chars';
});

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { expandRoleClaims } from '../../middleware/auth';
import submissionsRouter from '../submissions';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, {
      user: { id: 3, userId: 3, organizationId: 7, role: 'admin', roles: expandRoleClaims('admin', undefined) },
    });
    next();
  });
  a.use('/api/submissions', submissionsRouter);
  return a;
}

const PATH = '/api/submissions/device/qms/assess';

describe('POST /api/submissions/device/qms/assess', () => {
  it('refuses an id that is not a clause id with 400, naming it (not 200, and not 500)', async () => {
    const r = await request(app()).post(PATH).send({ presentClauseIds: ['CAPA'] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: 'VALIDATION', field: 'presentClauseIds[0]' });
    expect(r.body.error.message).toMatch(/presentClauseIds\[0\] must be a clause id/);
  });

  it('refuses an omitted list with 400, instead of assessing no clause as in place', async () => {
    const r = await request(app()).post(PATH).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: 'VALIDATION' });
    expect(r.body).not.toHaveProperty('ready');
  });

  it('assesses a stated list of clause ids, as before', async () => {
    const r = await request(app()).post(PATH).send({ presentClauseIds: ['capa'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ready: false, presentCount: 1 });
    expect(r.body.missingRequiredClauses).not.toContain('capa');
    expect(r.body.missingRequiredClauses).toContain('design_controls');
  });
});
