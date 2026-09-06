/**
 * /api/ivd-assessments — a 5xx must not carry the database's own words.
 *
 * This router kept a private `fail()` helper that put `Error.message` into the
 * response as `detail`. server/lib/api-response.ts documents removing exactly
 * that disclosure from every other MDX endpoint, and its reasoning applies here
 * unchanged: a Postgres failure shipped its table, column and constraint names
 * to whatever read the response — a devtools panel, a proxy log, a saved HAR —
 * and client-side redaction hides the symptom on screen without containing it
 * at the boundary.
 *
 * The real message belongs in the log, keyed by the request id the caller is
 * shown; the caller gets a code, a sentence, and that id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const listAssessments = vi.fn();
const saveAssessment = vi.fn();

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
}));
vi.mock('../../services/regulatory/ivd-assessments.service', async () => {
  const actual = await vi.importActual<any>('../../services/regulatory/ivd-assessments.service');
  return {
    ...actual,
    listAssessments: (...a: unknown[]) => listAssessments(...a),
    saveAssessment: (...a: unknown[]) => saveAssessment(...a),
    getAssessment: vi.fn(),
    deleteAssessment: vi.fn(),
    saveGeneratedDocument: vi.fn(),
    listGeneratedDocuments: vi.fn(),
  };
});

import router from '../ivd-assessments';

/** What a driver actually throws: the constraint, the table, the column. */
const PG_ERROR = Object.assign(
  new Error(
    'null value in column "assessment_type" of relation "ivd_assessments" violates ' +
      'not-null constraint — failing row contains (91, 7, null, cdx_pairing_v2)',
  ),
  { code: '23502', table: 'ivd_assessments', column: 'assessment_type' },
);

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).user = { id: 42, organizationId: 7 };
    res.setHeader('X-Request-Id', 'req-abc123');
    next();
  });
  a.use('/api/ivd-assessments', router);
  return a;
}

beforeEach(() => {
  listAssessments.mockReset();
  saveAssessment.mockReset();
});

describe('IVD assessments 5xx envelope', () => {
  it('does not put the database error in the response body', async () => {
    listAssessments.mockRejectedValueOnce(PG_ERROR);
    const res = await request(app()).get('/api/ivd-assessments');
    expect(res.status).toBe(500);

    const body = JSON.stringify(res.body);
    for (const leak of [
      'ivd_assessments',
      'assessment_type',
      'not-null constraint',
      'failing row contains',
      '23502',
    ]) {
      expect(body, `leaked ${leak}`).not.toContain(leak);
    }
    expect(res.body.detail).toBeUndefined();
  });

  it('answers with a code, a sentence, and the request id the caller can quote', async () => {
    listAssessments.mockRejectedValueOnce(PG_ERROR);
    const res = await request(app()).get('/api/ivd-assessments');
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toContain('listing IVD assessments');
    expect(res.body.correlationId).toBe('req-abc123');
  });

  it('holds on the write path too', async () => {
    saveAssessment.mockRejectedValueOnce(PG_ERROR);
    const res = await request(app())
      .post('/api/ivd-assessments')
      .send({ assessmentType: 'cdx_pairing', result: { verdict: 'ok' } });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('ivd_assessments');
    expect(res.body.message).toContain('saving the IVD assessment');
  });

  /* The rule is about INTERNAL failures, not about refusing to talk: a 422 for
     a bad assessmentType still has to name the accepted values. */
  it('still tells the caller what a rejected assessmentType should have been', async () => {
    const res = await request(app()).post('/api/ivd-assessments').send({ assessmentType: 'nope', result: {} });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('assessmentType must be one of');
  });
});
