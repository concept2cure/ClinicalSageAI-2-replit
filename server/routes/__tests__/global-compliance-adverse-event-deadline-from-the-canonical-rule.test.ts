/**
 * POST /api/global-compliance/pharmacovigilance/:orgId/adverse-event computes
 * the reporting deadline with the one canonical rule
 * (calculateReportingDeadline), from the stated report date and region.
 *
 * What it used to do (until 2026-10-15): it carried its own 7/15/30-day rule,
 * counted from TODAY, gave every SAE the expedited clock, and the INSERT left
 * report_date to its DEFAULT CURRENT_DATE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../db', () => ({ pool: { query } }));
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: unknown, next: () => void) => { req.user = { id: 9, organizationId: 7, role: 'member' }; next(); },
}));

import router from '../global-compliance';

const app = () => { const a = express(); a.use(express.json()); a.use('/api/global-compliance', router); return a; };
const post = (body: Record<string, unknown>) =>
  request(app()).post('/api/global-compliance/pharmacovigilance/7/adverse-event').send({ eventDescription: 'Hepatic failure', ...body });
const inserted = () => query.mock.calls.find(([sql]) => /INSERT INTO pv_adverse_events/.test(sql))!;

beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [{ id: 1 }] }); });

describe('the adverse-event deadline comes from the canonical rule', () => {
  it('a fatal SUSAR in the US: 7 days from the stated report date', async () => {
    const res = await post({ eventType: 'SUSAR', seriousnessCriteria: ['death'], countryOfOccurrence: 'US', reportDate: '2026-10-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.reporting.deadline, 'the deadline was counted from today').toBe('2026-10-08T00:00:00.000Z');
    expect(res.body.reporting.expedited).toBe(true);
  });

  it('an SAE (not recorded as unexpected): no deadline, with the reason; expedited undetermined', async () => {
    const res = await post({ eventType: 'SAE', seriousnessCriteria: ['hospitalization'], countryOfOccurrence: 'US', reportDate: '2026-10-01' });
    expect(res.status).toBe(200);
    expect(res.body.reporting.deadline).toBeNull();
    expect(res.body.reporting.reason).toMatch(/SUSAR/);
    expect(res.body.reporting.expedited).toBeNull();
    expect(inserted()[1][11]).toBeNull();
  });

  it('no report date: no deadline, and report_date is stored as not recorded rather than today', async () => {
    const res = await post({ eventType: 'SUSAR', seriousnessCriteria: ['death'], countryOfOccurrence: 'US' });
    expect(res.body.reporting.deadline).toBeNull();
    expect(res.body.reporting.reason).toMatch(/report date/);
    expect(inserted()[0]).toMatch(/report_date/);
  });
});
