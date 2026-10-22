/**
 * IND lifecycle — dates arrive as JSON strings, and are parsed at the boundary:
 * a valid one is read, an unparseable one is refused 400 naming the field.
 *
 * What the routes used to do (until 2026-10-15):
 *   - POST /annual-report and /annual-report/pdf passed the body straight to the
 *     assembler, which called toISOString on safetyReportsInPeriod[].submittedAt
 *     and ibChanges[].effectiveDate. Over HTTP those are strings, so any report
 *     that listed a safety report or an IB revision answered 500 — valid dates
 *     included. A list that was not a list did the same.
 *   - POST /timeline answered 500 on an unparseable date (RangeError from
 *     toISOString), and placed a "30-day safe-to-proceed date" from a receipt
 *     nobody stated was FDA's recorded one.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../db', () => ({ db: {} }));
/* A rendered report is recorded before it is delivered (D5,
   documents-recorded.test.ts pins that rule); this suite is about dates, so the
   record persists. */
vi.mock('../../../services/auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import documentsRoutes from '../documents.routes';
import computeRoutes from '../compute.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
    next();
  });
  a.use('/api/ind-lifecycle', documentsRoutes);
  a.use('/api/ind-lifecycle', computeRoutes);
  return a;
}

const report = (over: Record<string, unknown> = {}) => ({
  projectId: 'proj-1',
  indNumber: '123456',
  productName: 'C2C-001',
  reportingPeriodStart: '2026-01-01',
  reportingPeriodEnd: '2026-12-31',
  studyStatuses: [],
  safetyReportsInPeriod: [
    { reportId: 'SR-1', obligation: 'FIFTEEN_DAY', reactionPt: 'Hepatic failure', seriousnessCriteria: 'hospitalization', submittedAt: '2026-03-02T00:00:00.000Z' },
  ],
  ibChanges: [{ ibVersion: '4.0', effectiveDate: '2026-05-01', summary: 'New hepatic safety section.' }],
  ...over,
});

describe('POST /annual-report and /annual-report/pdf — JSON dates in the supplied lists', () => {
  it('reads valid date strings: the model lists the report and the revision with their dates', async () => {
    const res = await request(app()).post('/api/ind-lifecycle/annual-report').send(report());
    expect(res.status).toBe(200);
    const list = res.body.sections.find((s: { key: string }) => s.key === 'ind_safety_reports_list');
    expect(list.body).toContain('SR-1 [FIFTEEN_DAY] Hepatic failure (hospitalization) — submitted 2026-03-02');
    const ib = res.body.sections.find((s: { key: string }) => s.key === 'ib_changes');
    expect(ib.body).toContain('IB 4.0 (effective 2026-05-01)');

    const pdf = await request(app()).post('/api/ind-lifecycle/annual-report/pdf').send(report());
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it.each([
    ['/annual-report', 'safetyReportsInPeriod[1].submittedAt', { safetyReportsInPeriod: [report().safetyReportsInPeriod[0], { reportId: 'SR-2', obligation: 'SEVEN_DAY', submittedAt: 'last March' }] }],
    ['/annual-report/pdf', 'ibChanges[0].effectiveDate', { ibChanges: [{ ibVersion: '5.0', summary: 'x' }] }],
    ['/annual-report', 'safetyReportsInPeriod', { safetyReportsInPeriod: { reportId: 'SR-1' } }],
    ['/annual-report/pdf', 'studyStatuses', { studyStatuses: 'none' }],
    ['/annual-report', 'reportingPeriodEnd', { reportingPeriodEnd: '' }],
  ])('%s refuses an unparseable value 400, naming %s', async (path, field, over) => {
    const res = await request(app()).post(`/api/ind-lifecycle${path}`).send(report(over));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.message).toContain(field);
  });
});

describe('POST /timeline — the receipt is FDA\'s only when stated so; a bad date is refused by name', () => {
  it('a receiptRecorded that is not the boolean true places no safe-to-proceed milestone', async () => {
    const res = await request(app())
      .post('/api/ind-lifecycle/timeline')
      .send({ receiptDate: '2026-01-01', receiptRecorded: 'true', asOf: '2026-03-01' });
    expect(res.status).toBe(200);
    expect(res.body.milestones).toEqual([]);
    expect(res.body.safeToProceedBasis).toBe('receipt_not_recorded');
  });

  it('an unparseable recorded receipt or effective date is 400 naming it', async () => {
    const bad = await request(app()).post('/api/ind-lifecycle/timeline').send({ receiptDate: 'soon', receiptRecorded: true });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('receiptDate');
    const eff = await request(app()).post('/api/ind-lifecycle/timeline').send({ receiptDate: '2026-01-01', effectiveDate: 'n/a' });
    expect(eff.status).toBe(400);
    expect(eff.body.error.message).toContain('effectiveDate');
  });
});
