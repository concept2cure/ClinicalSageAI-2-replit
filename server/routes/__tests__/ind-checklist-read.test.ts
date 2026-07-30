/**
 * GET /api/ind-checklist — the converged IND read for the v2 IndLifecycle surface.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape
 * the envelope. It reads ONLY the real eCTD submission core — no legacy/seed blob and
 * no fallback — so an org with no IND gets an honest empty list. (The full field
 * mapping is proven against real SQL in
 * ind-checklist-view-assembler.pglite.integration.test.ts.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgIndChecklists = vi.fn();
vi.mock('../../services/ind-lifecycle/ind-checklist-view-assembler', () => ({
  assembleOrgIndChecklists: (...a: unknown[]) => assembleOrgIndChecklists(...a),
}));

import indChecklistRouter from '../ind-checklist.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/ind-checklist', indChecklistRouter);
  return app;
}

beforeEach(() => assembleOrgIndChecklists.mockReset());

describe('GET /api/ind-checklist', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/ind-checklist');
    expect(res.status).toBe(403);
    expect(assembleOrgIndChecklists).not.toHaveBeenCalled();
  });

  it('returns the real-store IND for the acting org, source = submissions', async () => {
    assembleOrgIndChecklists.mockResolvedValue([
      {
        code: 'BX-301', drugName: 'BX-301', productName: 'BX-301 (anti-BCMA mAb)',
        indication: null, sponsorName: 'Concept2Cure', submissionType: 'IND',
        targetReceiptOffsetDays: 14,
        forms: [{ id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true }],
        sections: [{ code: 'm1.2', title: 'Cover Letter', module: 'M1', ref: '21 CFR 312.23(a)(1)', ai: true, status: 'signed' }],
      },
    ]);
    const res = await request(appWith(7)).get('/api/ind-checklist');
    expect(res.status).toBe(200);
    expect(assembleOrgIndChecklists).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('submissions');
    const first = res.body.data[0];
    for (const k of [
      'code', 'drugName', 'productName', 'indication', 'sponsorName',
      'submissionType', 'targetReceiptOffsetDays', 'forms', 'sections',
    ]) {
      expect(first).toHaveProperty(k);
    }
    expect(first.code).toBe('BX-301');
    expect(first.forms[0]).toHaveProperty('done');
    expect(first.sections[0]).toHaveProperty('status');
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has no IND — no fallback data', async () => {
    assembleOrgIndChecklists.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/ind-checklist');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });
});
