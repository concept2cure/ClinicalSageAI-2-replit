/**
 * Evidence sufficiency — a 500 carries the envelope, never the thrower's text
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * The assess, list and fetch handlers answered `{ error, detail: err.message }`.
 * The service reads and writes evidence_sufficiency_assessments, so the detail
 * is driver text in practice. Each case makes the service throw a sentinel that
 * stands for that text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL column "verdict" of relation "evidence_sufficiency_assessments" does not exist';

const { svc, logError } = vi.hoisted(() => ({
  svc: {
    assessSufficiency: vi.fn(),
    getAssessment: vi.fn(),
    listProgramAssessments: vi.fn(),
  },
  logError: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 5, organizationId: 7 };
    next();
  },
}));
// requireProgramAccess: the program is the caller's.
vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2' }] }) }) }),
  },
  // The program check (programInOrganization, D3) reads on the pool.
  pool: { query: async () => ({ rows: [{ id: 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2' }] }) },
}));
vi.mock('../../services/evidence-sufficiency/evidence-sufficiency.service', () => svc);
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })),
}));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../evidence-sufficiency';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-evsuff');
    next();
  });
  a.use('/api/evidence-sufficiency', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(res.body)).not.toMatch(/evidence_sufficiency_assessments|does not exist/);
  expect(res.body.detail).toBeUndefined();
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-evsuff');
}

beforeEach(() => vi.clearAllMocks());

describe('evidence-sufficiency 500s: envelope out, detail to the log', () => {
  it('POST /programs/:programId/assess', async () => {
    svc.assessSufficiency.mockRejectedValue(new Error(SENTINEL));
    const res = await request(app())
      .post('/api/evidence-sufficiency/programs/aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2/assess')
      .send({ pathway: '510K', profile: {} });
    expectContained(res);
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('GET /programs/:programId/assessments', async () => {
    svc.listProgramAssessments.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).get('/api/evidence-sufficiency/programs/aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2/assessments'));
  });

  it('GET /assessments/:id', async () => {
    svc.getAssessment.mockRejectedValue(new Error(SENTINEL));
    expectContained(await request(app()).get('/api/evidence-sufficiency/assessments/a-1'));
  });

  it('leaves the 422 and 404 answers unchanged', async () => {
    const bad = await request(app()).post('/api/evidence-sufficiency/programs/aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2/assess').send({ pathway: 'X' });
    expect(bad.status).toBe(422);
    expect(bad.body).toEqual({ error: 'pathway must be PMA, DE_NOVO, or 510K' });
    svc.getAssessment.mockResolvedValue(null);
    const missing = await request(app()).get('/api/evidence-sufficiency/assessments/a-1');
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Assessment not found' });
  });
});
