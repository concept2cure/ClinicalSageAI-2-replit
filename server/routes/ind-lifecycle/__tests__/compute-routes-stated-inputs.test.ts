/**
 * IND lifecycle compute routes — the inputs that decide a verdict are stated,
 * never defaulted (pure routes, no DB).
 *
 * What the routes used to do (until 2026-10-15):
 *   - POST /readiness and /action-items passed `overdueSafetyReports` through
 *     unchecked, and the engines read an omitted count as zero — an amendment
 *     came back ready with no overdue safety report nobody had counted. A "2"
 *     string, or -1, was passed on as whatever the engine made of it.
 *   - POST /action-items evaluated readiness WITHOUT the top-level count, so
 *     the two halves of one answer could be computed from different counts.
 *   - POST /clock ignored any statement that the date was FDA's recorded
 *     receipt; the engine cleared every date given to it.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import computeRoutes from '../compute.routes';
import { getAllINDSections } from '../../../../services/regulatory/ind-ectd-sections';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
    next();
  });
  a.use('/api/ind-lifecycle', computeRoutes);
  return a;
}

const amendmentSigned = () =>
  Object.fromEntries(getAllINDSections().filter((s) => s.requiredForAmendment).map((s) => [s.code, 'signed']));

describe('POST /readiness — the overdue safety-report count', () => {
  it('refuses a count that is not a non-negative integer (400), never reads it as something else', async () => {
    for (const bad of ['2', -1, 1.5]) {
      const res = await request(app())
        .post('/api/ind-lifecycle/readiness')
        .send({ filingType: 'amendment', sectionStatus: amendmentSigned(), overdueSafetyReports: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
  });

  it('an amendment with no count is not stated ready; with a stated zero it is', async () => {
    const none = await request(app()).post('/api/ind-lifecycle/readiness').send({ filingType: 'amendment', sectionStatus: amendmentSigned() });
    expect(none.status).toBe(200);
    expect(none.body.ready).toBe(false);
    expect(none.body.blockers.map((b: { code: string }) => b.code)).toContain('overdue_safety_reports');
    const zero = await request(app())
      .post('/api/ind-lifecycle/readiness')
      .send({ filingType: 'amendment', sectionStatus: amendmentSigned(), overdueSafetyReports: 0 });
    expect(zero.body.ready).toBe(true);
  });
});

describe('POST /action-items — one count for both halves of the answer', () => {
  it('a count stated only inside readinessInput reaches the action list too', async () => {
    const res = await request(app())
      .post('/api/ind-lifecycle/action-items')
      .send({ readinessInput: { filingType: 'amendment', sectionStatus: amendmentSigned(), overdueSafetyReports: 0 } });
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('a top-level count reaches readiness too', async () => {
    const res = await request(app())
      .post('/api/ind-lifecycle/action-items')
      .send({ readinessInput: { filingType: 'amendment', sectionStatus: amendmentSigned() }, overdueSafetyReports: 2 });
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain('safety_overdue');
    // The readiness blocker for the same fact is not repeated as a second item.
    expect(ids.filter((id: string) => id.includes('safety'))).toEqual(['safety_overdue']);
  });

  it('refuses a malformed count in either place', async () => {
    const res = await request(app())
      .post('/api/ind-lifecycle/action-items')
      .send({ readinessInput: { filingType: 'amendment', sectionStatus: {}, overdueSafetyReports: 'two' } });
    expect(res.status).toBe(400);
  });
});

describe('POST /clock — receiptRecorded reaches the engine', () => {
  it('clears only over a recorded receipt with a supplied hold history', async () => {
    const base = { receiptDate: '2026-01-01', asOf: '2026-02-15', events: [] };
    const projected = await request(app()).post('/api/ind-lifecycle/clock').send(base);
    expect(projected.body).toMatchObject({ status: 'projected', basis: 'projection', safeToProceed: null });
    const recorded = await request(app()).post('/api/ind-lifecycle/clock').send({ ...base, receiptRecorded: true });
    expect(recorded.body).toMatchObject({ status: 'safe_to_proceed', basis: 'fda_receipt', safeToProceed: true });
    // Only the boolean true is a recorded receipt.
    const truthy = await request(app()).post('/api/ind-lifecycle/clock').send({ ...base, receiptRecorded: 'true' });
    expect(truthy.body.basis).toBe('projection');
  });
});
