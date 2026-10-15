/**
 * POST /api/validate-completeness/validate with `withPredictive: true` refuses a
 * submission type that has no required-section profile with 422, naming it.
 *
 * scoreSubmissionDraft throws CompletenessNotAssessedError (a 422 by its own
 * contract) for such a type, and the route answered every throw through
 * serverError(): a 500 INTERNAL_ERROR for a request that was the caller's to
 * fix, saying nothing about which type was not assessed. The engine, the
 * orchestrator and the route are real here; only the auth and the pool are
 * doubles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mockPool } from '../../../tests/setup';

vi.mock('../../db/runtime', () => ({ pool: mockPool, getPool: () => mockPool, db: mockPool, getDb: () => mockPool }));
vi.mock('../../auth.js', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));

import router from '../validate-completeness';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 5, role: 'member', organizationId: 7 };
  next();
});
app.use('/api/validate-completeness', router);

beforeEach(() => {
  mockPool.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('POST /api/validate-completeness/validate — withPredictive', () => {
  it('answers a type with no required-section profile with 422 naming the type, not 500', async () => {
    const res = await request(app)
      .post('/api/validate-completeness/validate')
      .send({ submissionType: 'ANDA', presentSections: ['1.1', '2.3'], withPredictive: true });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body).toMatchObject({ success: false, code: 'COMPLETENESS_NOT_ASSESSED', submissionType: 'ANDA' });
    expect(res.body.error).toMatch(/ANDA/);
    // Nothing was predicted, so nothing was written for calibration.
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('still answers the rule-based not-assessed result (200) when no prediction was asked for', async () => {
    const res = await request(app)
      .post('/api/validate-completeness/validate')
      .send({ submissionType: 'ANDA', presentSections: ['1.1', '2.3'] });

    expect(res.status).toBe(200);
    expect(res.body.data.assessment.status).toBe('not_assessed');
  });
});
