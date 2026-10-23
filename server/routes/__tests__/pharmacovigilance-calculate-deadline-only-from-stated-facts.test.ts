/**
 * POST /api/pharmacovigilance/calculate-deadline answers a deadline only from
 * the facts stated, and 422 DEADLINE_UNDETERMINED (with the reason) otherwise.
 *
 * What it used to do (changed 2026-10-15, untested until now): the deadline was
 * counted from today when no report date was given, every SAE/AESI took the
 * expedited clock, and expeditedReport was true for any serious event.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import createPharmacovigilanceRoutes from '../pharmacovigilance-routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as unknown as { tenantId: number }).tenantId = 7; next(); });
  a.use('/api/pharmacovigilance', createPharmacovigilanceRoutes());
  return a;
}
const post = (body: Record<string, unknown>) => request(app()).post('/api/pharmacovigilance/calculate-deadline').send(body);

describe('calculate-deadline', () => {
  it('an SAE (not recorded as unexpected): 422 with the reason', async () => {
    const res = await post({ eventType: 'SAE', seriousnessCriteria: 'hospitalization', region: 'FDA', reportDate: '2026-10-01' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('DEADLINE_UNDETERMINED');
    expect(res.body.detail).toMatch(/SUSAR/);
  });

  it('a SUSAR with its criterion and report date: 200, expedited, counted from the report date', async () => {
    const res = await post({ eventType: 'SUSAR', seriousnessCriteria: 'death', region: 'FDA', reportDate: '2026-10-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.data.expeditedReport).toBe(true);
    expect(res.body.data.deadline).toBe('2026-10-08T00:00:00.000Z');
  });

  it('no report date: 422 naming it — the clock is not started today', async () => {
    const res = await post({ eventType: 'SUSAR', seriousnessCriteria: 'death', region: 'FDA' });
    expect(res.status).toBe(422);
    expect(res.body.detail).toMatch(/report date/);
  });
});
