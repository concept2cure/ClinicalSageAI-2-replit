/**
 * GET /api/mdx/qms/readiness — the QMS, visible from the MDX shell.
 *
 * Every /api/mdx/qms endpoint was already consumed — by
 * client/src/concept2cure/quality/*, a different application from the
 * MDX device shell. A device team working a submission could not see
 * supplier qualification, training currency, or audit findings without
 * leaving for another app. This aggregate carries the readiness slice
 * across.
 *
 * The load-bearing property tested here: a tenant whose QMS tables are
 * absent gets `available: false` blocks, never zeroed counts presented
 * as health. A zero from a system that is not running reads as an
 * all-clear — the same failure mode as the silent fixtures this shell
 * just had removed, arriving through SQL instead of JSX.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import qmsRouter from '../mdx-qms';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', qmsRouter);
  return app;
}

const UNDEFINED_TABLE = () =>
  Object.assign(new Error('relation does not exist'), { code: '42P01' });

/** The five block queries answer in Promise.all order:
    documents, suppliers, training, audits, nonconforming. */
function mockBlocks(rows: Array<Record<string, unknown> | 'absent'>) {
  query.mockImplementation((sql: string) => {
    const order = [
      'qms_documents',
      'qms_suppliers',
      'qms_training_records',
      'qms_internal_audits',
      'qms_nonconforming_products',
    ];
    const idx = order.findIndex((t) => String(sql).includes(t));
    if (idx === -1) return Promise.resolve({ rows: [] });
    const spec = rows[idx];
    if (spec === 'absent') return Promise.reject(UNDEFINED_TABLE());
    return Promise.resolve({ rows: [spec] });
  });
}

beforeEach(() => query.mockReset());

describe('GET /api/mdx/qms/readiness', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/mdx/qms/readiness');
    expect(res.status).toBe(403);
  });

  it('returns all five blocks with camelCase counts and org scope', async () => {
    mockBlocks([
      { effective: 12, review_overdue: 2, draft: 3 },
      { total: 8, critical_unapproved: 1, audit_overdue: 2 },
      { acknowledged: 40, expired: 5 },
      { open: 2, open_major_findings: 1 },
      { undispositioned: 1 },
    ]);
    const res = await request(appWith(7)).get('/api/mdx/qms/readiness');

    expect(res.status).toBe(200);
    expect(res.body.meta.scope).toBe('organization');
    expect(res.body.data.documents).toEqual({
      available: true, effective: 12, reviewOverdue: 2, draft: 3,
    });
    expect(res.body.data.suppliers).toEqual({
      available: true, total: 8, criticalUnapproved: 1, auditOverdue: 2,
    });
    expect(res.body.data.training).toEqual({ available: true, acknowledged: 40, expired: 5 });
    expect(res.body.data.audits).toEqual({ available: true, open: 2, openMajorFindings: 1 });
    expect(res.body.data.nonconforming).toEqual({ available: true, undispositioned: 1 });
  });

  it('marks a block unavailable when its table is absent, instead of zeroing it', async () => {
    /* The property that matters: absence of data is not evidence of
       health. */
    mockBlocks([
      { effective: 12, review_overdue: 0, draft: 3 },
      'absent', // qms_suppliers not migrated
      { acknowledged: 40, expired: 0 },
      { open: 0, open_major_findings: 0 },
      { undispositioned: 0 },
    ]);
    const res = await request(appWith(7)).get('/api/mdx/qms/readiness');

    expect(res.status).toBe(200);
    expect(res.body.data.suppliers.available).toBe(false);
    expect(res.body.data.documents.available).toBe(true);
  });

  it('survives every table being absent — a 200 of unavailable blocks, not a 500', async () => {
    mockBlocks(['absent', 'absent', 'absent', 'absent', 'absent']);
    const res = await request(appWith(7)).get('/api/mdx/qms/readiness');

    expect(res.status).toBe(200);
    for (const key of ['documents', 'suppliers', 'training', 'audits', 'nonconforming']) {
      expect(res.body.data[key].available).toBe(false);
    }
  });

  it('scopes every block query to the caller organization', async () => {
    mockBlocks([
      { effective: 0, review_overdue: 0, draft: 0 },
      { total: 0, critical_unapproved: 0, audit_overdue: 0 },
      { acknowledged: 0, expired: 0 },
      { open: 0, open_major_findings: 0 },
      { undispositioned: 0 },
    ]);
    await request(appWith(42)).get('/api/mdx/qms/readiness');

    const readinessCalls = query.mock.calls.filter((c) =>
      /qms_(documents|suppliers|training_records|internal_audits|nonconforming_products)/.test(
        String(c[0]),
      ),
    );
    expect(readinessCalls.length).toBe(5);
    for (const [sql, params] of readinessCalls) {
      expect(String(sql)).toMatch(/organization_id = \$1/);
      expect(params).toEqual([42]);
    }
  });

  it('reports an empty-but-present QMS as zeros with available: true', async () => {
    /* A migrated tenant with no records yet is genuinely at zero — that
       is a real answer, distinct from "not tracked". */
    mockBlocks([
      { effective: 0, review_overdue: 0, draft: 0 },
      { total: 0, critical_unapproved: 0, audit_overdue: 0 },
      { acknowledged: 0, expired: 0 },
      { open: 0, open_major_findings: 0 },
      { undispositioned: 0 },
    ]);
    const res = await request(appWith(7)).get('/api/mdx/qms/readiness');

    expect(res.body.data.documents).toEqual({
      available: true, effective: 0, reviewOverdue: 0, draft: 0,
    });
  });
});
