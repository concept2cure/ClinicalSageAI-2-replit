/**
 * GET /api/ind-checklist — per-org IND checklist read contract.
 *
 * The v2 IndLifecycle surface adopts this list only when it carries the full
 * display shape. Locks: 403 without org, the { data } envelope with the display
 * keys ({ code, drugName, productName, indication, sponsorName, submissionType,
 * targetReceiptOffsetDays, forms, sections }, with id → code and forms/sections
 * rehydrated from JSONB), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

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

beforeEach(() => query.mockReset());

describe('GET /api/ind-checklist', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/ind-checklist');
    expect(res.status).toBe(403);
  });

  it('returns the IND checklist shaped to the display contract (id → code, forms/sections from JSONB)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'BX-301',
          drug_name: 'BX-301',
          product_name: 'BX-301 (anti-BCMA mAb)',
          indication: 'Relapsed/refractory multiple myeloma',
          sponsor_name: 'Concept2Cure',
          submission_type: 'IND',
          target_receipt_offset_days: 14,
          forms: [
            { id: 'FDA_1571', title: 'Form FDA 1571', label: 'IND Application', ref: '21 CFR 312.23(a)(1)', done: true },
          ],
          sections: [
            { code: 'm1.2', title: 'Cover Letter', module: 'M1', ref: '21 CFR 312.23(a)(1)', ai: true, status: 'signed' },
          ],
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/ind-checklist');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of [
      'code', 'drugName', 'productName', 'indication', 'sponsorName',
      'submissionType', 'targetReceiptOffsetDays', 'forms', 'sections',
    ]) {
      expect(first).toHaveProperty(k);
    }
    expect(first.code).toBe('BX-301');
    expect(Array.isArray(first.forms)).toBe(true);
    expect(first.forms[0]).toHaveProperty('id');
    expect(first.forms[0]).toHaveProperty('label');
    expect(first.forms[0]).toHaveProperty('ref');
    expect(first.forms[0]).toHaveProperty('done');
    expect(Array.isArray(first.sections)).toBe(true);
    expect(first.sections[0]).toHaveProperty('code');
    expect(first.sections[0]).toHaveProperty('module');
    expect(first.sections[0]).toHaveProperty('status');
    expect(res.body.meta.count).toBe(1);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/ind-checklist');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
