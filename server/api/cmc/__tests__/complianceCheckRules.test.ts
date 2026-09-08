/**
 * "Nothing assessed" must not be reported as "assessed and clear".
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * POST /compliance/check-rules answered a project with NO compliance_tracking
 * records with `complianceScore: 100`, `violations: 0`, `rules: []` — under a
 * comment reading "No compliance tracking records exist yet — return clean
 * state". A perfect compliance score is the strongest claim this endpoint can
 * make, and it was the answer for having looked at nothing.
 *
 * That is the failure CLAUDE.md's honest-empty-state rule exists to prevent, and
 * it is worse here than in most places for two compounding reasons:
 *
 *   - It is indistinguishable from a real 100. A caller cannot tell an assessed
 *     and clean project from an unassessed one.
 *   - Zero records is the DEFAULT state. Nothing in the product writes a
 *     compliance_tracking row until someone explicitly creates one, so a
 *     brand-new project scored 100% compliant on the day it was created.
 *
 * The endpoint now reports the absence as an absence: no score, and an explicit
 * `assessed: false`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const poolQuery = vi.fn();
vi.mock('../../../db', () => ({
  db: {},
  getDb: () => ({}),
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
}));

import cmcRouter from '../routes';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = { id: 42, organizationId: 7 };
  (req as any).tenantId = 7;
  next();
});
app.use('/api/cmc', cmcRouter);

const BODY = { insightId: 'ins-1', type: 'stability', section: '3.2.P.8' };

beforeEach(() => {
  poolQuery.mockReset();
  poolQuery.mockResolvedValue({ rows: [] });
});

describe('POST /compliance/check-rules — an unassessed project is not a compliant one', () => {
  it('does not report 100% compliance for a project with no records', async () => {
    const res = await request(app).post('/api/cmc/compliance/check-rules').send(BODY);
    expect(res.status).toBe(200);

    const check = res.body.complianceCheck;
    expect(check, 'no complianceCheck in the response').toBeTruthy();
    expect(
      check.complianceScore,
      'an unassessed project was scored 100% compliant',
    ).not.toBe(100);
    // The absence is stated, not implied by a zero.
    expect(check.assessed, 'the response does not say whether anything was assessed').toBe(false);
  });

  it('still scores a project that HAS records — the fix is not "never score anything"', async () => {
    poolQuery.mockResolvedValue({
      rows: [
        { id: 1, guideline: 'ICH Q1A', requirement: 'Stability data', status: 'compliant', risk_level: 'low' },
        { id: 2, guideline: 'ICH Q2', requirement: 'Method validation', status: 'non-compliant', risk_level: 'high', mitigation: 'Validate the assay' },
      ],
    });

    const res = await request(app).post('/api/cmc/compliance/check-rules').send(BODY);
    const check = res.body.complianceCheck;

    expect(check.assessed).toBe(true);
    expect(check.rules).toHaveLength(2);
    expect(check.violations).toBe(1);
    expect(typeof check.complianceScore).toBe('number');
    expect(check.complianceScore).toBeLessThan(100);
    expect(check.recommendedActions).toContain('Validate the assay');
  });

  it('fails loudly when the read itself fails, rather than scoring a clean state', async () => {
    // The 42703 case: `compliance_tracking` is declared incompatibly in two
    // lineages, and this handler reads the columns of only one of them. A read
    // failure must never be laundered into "no records, therefore compliant".
    poolQuery.mockRejectedValue(Object.assign(new Error('column "guideline" does not exist'), { code: '42703' }));

    const res = await request(app).post('/api/cmc/compliance/check-rules').send(BODY);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('100');
  });
});
