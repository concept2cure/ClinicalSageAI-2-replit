/**
 * GET /api/safety-narratives/cases — SAE case worklist read contract.
 *
 * The v2 SafetyNarrative surface adopts this list (expedited-reporting clock +
 * subject/event facts) and runs the deterministic ICH E3 §16 composer over the
 * selected case. Locks: 403 without org, the { data } envelope with the display
 * keys (including the nested event + array facts rehydrated from JSONB), and
 * 42P01 fail-closed to an empty list. The narrative compute POSTs are covered
 * elsewhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../services/safety-narrative-service', () => ({ safetyNarrativeService: {} }));

import snRouter from '../safety-narrative';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/safety-narratives', snRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/safety-narratives/cases', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/safety-narratives/cases');
    expect(res.status).toBe(403);
  });

  it('returns cases shaped to the SaeCase display contract', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'ICSR-8841', due: 'Day 15', clock: 'FDA 15-day', due_days: 6,
        subject_id: '2041-0087', age: 67, sex: 'Female', study_id: 'BX204-301',
        treatment_arm: 'BX-099 200 mg Q3W', study_drug: 'BX-099', dose: '200 mg IV', first_dose_date: '12 Mar 2026',
        medical_history: ['NSCLC'], concomitant_meds: ['amlodipine'],
        event: { term: 'pneumonitis', seriousnessCriteria: ['hospitalization'], causality: 'possibly related' },
      }],
    });
    const res = await request(appWith(7)).get('/api/safety-narratives/cases');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const c = res.body.data[0];
    for (const k of ['id', 'due', 'clock', 'dueDays', 'subjectId', 'medicalHistory', 'concomitantMeds', 'event']) {
      expect(c).toHaveProperty(k);
    }
    expect(c.dueDays).toBe(6);
    expect(c.event.term).toBe('pneumonitis');
    expect(Array.isArray(c.medicalHistory)).toBe(true);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/safety-narratives/cases');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
