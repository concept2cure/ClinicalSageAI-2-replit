/**
 * GET /api/safety-narratives/cases — the converged SAE case worklist read.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape the
 * envelope. It reads ONLY the real pharmacovigilance store (`adverse_events`) — no
 * legacy/seed blob and no fallback — so an org with no cases gets an honest empty list.
 * (The full mapping + live expedited-reporting clock is proven against real SQL in
 * sae-cases-view-assembler.pglite.integration.test.ts.) The narrative compute POSTs are
 * covered elsewhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgSaeCases = vi.fn();
vi.mock('../../services/pv/sae-cases-view-assembler', () => ({
  assembleOrgSaeCases: (...a: unknown[]) => assembleOrgSaeCases(...a),
}));
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

beforeEach(() => assembleOrgSaeCases.mockReset());

describe('GET /api/safety-narratives/cases', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/safety-narratives/cases');
    expect(res.status).toBe(403);
    expect(assembleOrgSaeCases).not.toHaveBeenCalled();
  });

  it('returns the real-store cases for the acting org, source = adverse_events', async () => {
    assembleOrgSaeCases.mockResolvedValue([
      {
        id: 'ICSR-8841', due: '2026-07-21', clock: '15-day expedited report', dueDays: 11,
        subjectId: '2041-0087', studyId: 'BX204-301', studyDrug: 'BX-099', dose: '200 mg IV',
        expectedness: 'unexpected', medicalHistory: [], concomitantMeds: [],
        event: { term: 'pneumonitis', seriousnessCriteria: ['hospitalization'], causality: 'possibly related' },
        reportingCategory: '15-day', reportingDueDate: '2026-07-21',
      },
    ]);
    const res = await request(appWith(7)).get('/api/safety-narratives/cases');
    expect(res.status).toBe(200);
    expect(assembleOrgSaeCases).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('adverse_events');
    const c = res.body.data[0];
    for (const k of ['id', 'due', 'clock', 'dueDays', 'subjectId', 'medicalHistory', 'concomitantMeds', 'event', 'reportingCategory']) {
      expect(c).toHaveProperty(k);
    }
    expect(c.event.term).toBe('pneumonitis');
    expect(Array.isArray(c.medicalHistory)).toBe(true);
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has no adverse events — no fallback data', async () => {
    assembleOrgSaeCases.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/safety-narratives/cases');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });
});
