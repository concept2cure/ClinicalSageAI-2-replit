/**
 * The biostatistics platform routes record only what the request stated, and
 * act only for a signed-in user.
 *
 * POST /external-control/synthesize built a control with method
 * 'propensity_score' when the request named none, and stored '' as the
 * indication and endpoint. resolveUserId answered 0 for a request with no
 * user, so a synthetic control, a SAP version or a comment was recorded as
 * created by user 0. POST /estimand/define stored the request's `treatment` —
 * the ICH E9(R1) treatment condition — as the estimand's "variable", the
 * endpoint attribute.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({
  user: { id: 1, organizationId: 7 } as Record<string, unknown>,
  inserts: [] as Array<Record<string, unknown>>,
  synthesize: vi.fn(),
  createSapVersion: vi.fn(),
}));

vi.mock('../../db', () => {
  const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  return {
    pool: { query: q, connect: vi.fn() },
    getPool: () => ({ query: q, connect: vi.fn() }),
    db: {
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          S.inserts.push(v);
          return { returning: async () => [{ id: 31 }] };
        },
      }),
    },
  };
});

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  return {
    ...actual,
    authenticateToken: (req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = S.user;
      next();
    },
  };
});

vi.mock('../../services/external-control-arm-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/external-control-arm-service')>()),
  ExternalControlArmService: class {
    synthesizeControl = S.synthesize;
  },
}));
vi.mock('../../services/collaborative-sap-service', () => ({
  CollaborativeSapService: class {
    createSapVersion = S.createSapVersion;
  },
}));

const { default: biostatRouter } = await import('../biostatPlatform');

const app = express();
app.use(express.json());
app.use('/api/biostat', biostatRouter);

const CONTROL = { indication: 'NSCLC', endpoint: 'Overall survival', sourceIds: [4, 5] };

beforeEach(() => {
  S.user = { id: 1, organizationId: 7 };
  S.inserts.length = 0;
  S.synthesize.mockReset().mockResolvedValue({ id: 9 });
  S.createSapVersion.mockReset().mockResolvedValue({ id: 3 });
});

describe('POST /api/biostat/external-control/synthesize', () => {
  it('refuses a request that names no synthesis method, and builds nothing', async () => {
    const res = await request(app).post('/api/biostat/external-control/synthesize').send(CONTROL);
    expect(res.status, 'a propensity-score control was built for a request that named no method').toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/method/);
    expect(S.synthesize).not.toHaveBeenCalled();
  });

  it('refuses a method it does not have, naming the ones it does', async () => {
    const res = await request(app).post('/api/biostat/external-control/synthesize').send({ ...CONTROL, method: 'matching' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/propensity_score.*ipw.*bayesian_borrowing.*naive_pooling/);
    expect(S.synthesize).not.toHaveBeenCalled();
  });

  it('refuses a control with no indication, endpoint or source arms rather than storing blanks', async () => {
    const res = await request(app).post('/api/biostat/external-control/synthesize').send({ method: 'ipw' });
    expect(res.status, 'a control was built for indication "" and endpoint ""').toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/indication.*endpoint.*sourceIds/);
    expect(S.synthesize).not.toHaveBeenCalled();
  });

  it('builds the control with the stated method, for the signed-in user', async () => {
    const res = await request(app).post('/api/biostat/external-control/synthesize').send({ ...CONTROL, method: 'ipw' });
    expect(res.status).toBe(200);
    expect(S.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ipw', indication: 'NSCLC', endpoint: 'Overall survival', sourceArmIds: [4, 5] }),
      7,
      1,
    );
  });
});

describe('a request with no signed-in user', () => {
  it('is answered 401, and nothing is recorded as created by user 0', async () => {
    S.user = { organizationId: 7 };
    const control = await request(app).post('/api/biostat/external-control/synthesize').send({ ...CONTROL, method: 'ipw' });
    const sap = await request(app).post('/api/biostat/sap/create').send({ threadId: 2, sections: {} });

    expect(control.status, 'the control was recorded as created by user 0').toBe(401);
    expect(sap.status, 'the SAP version was recorded as created by user 0').toBe(401);
    expect(S.synthesize).not.toHaveBeenCalled();
    expect(S.createSapVersion).not.toHaveBeenCalled();
  });
});

describe('POST /api/biostat/estimand/define', () => {
  const ESTIMAND = {
    endpoint: 'Change from baseline in HbA1c at week 24',
    population: 'All randomized participants (ITT)',
    intercurrentEvents: [{ name: 'Rescue medication', strategy: 'hypothetical' }],
    summaryMeasure: 'Difference in means',
    strategy: 'treatment_policy',
  };

  it('does not store the treatment condition as the variable — it refuses an attribute it cannot record', async () => {
    const res = await request(app).post('/api/biostat/estimand/define').send({ ...ESTIMAND, treatment: 'Semaglutide 1 mg vs placebo' });
    expect(S.inserts.map((row) => row.variable), 'the treatment was stored as the ICH E9(R1) variable').not.toContain(
      'Semaglutide 1 mg vs placebo',
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/treatment/);
    expect(S.inserts).toEqual([]);
  });

  it('records the endpoint as the variable, as ICH E9(R1) defines it', async () => {
    const res = await request(app).post('/api/biostat/estimand/define').send(ESTIMAND);
    expect(res.status).toBe(200);
    expect(S.inserts[0]).toMatchObject({ endpointName: ESTIMAND.endpoint, variable: ESTIMAND.endpoint });
  });

  it('refuses an estimand with no endpoint, rather than storing no variable', async () => {
    const res = await request(app).post('/api/biostat/estimand/define').send({ ...ESTIMAND, endpoint: undefined });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/endpoint/);
    expect(S.inserts).toEqual([]);
  });
});
