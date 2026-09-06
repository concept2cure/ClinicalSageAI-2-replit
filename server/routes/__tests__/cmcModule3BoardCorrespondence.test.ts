/**
 * The Module 3 board's overdue-information-request count is a count, not a page.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `buildCorrespondence` reads open Module 3 agency questions with `limit 50`,
 * and the KPI was `correspondence.rows.filter(r => r.overdue).length` — the
 * overdue count OF THAT PAGE. The CMC surface renders it as "You have N
 * information requests overdue", so an organisation with more than fifty open
 * Module 3 questions was told it had fewer overdue than it did, with no sign
 * that the number was capped.
 *
 * The page is still a page. The count now comes from the store, and the meta
 * block says how many open questions there are and whether the card was
 * truncated, so a surface can say "50 of 128" instead of implying it has them all.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db.js', () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
vi.mock('../../utils/tenantContext.js', () => ({ getSecureOrgId: () => 42 }));

import createCmcModule3BoardRoutes from '../cmc-module3-board.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cmc/module3-board', createCmcModule3BoardRoutes());
  return app;
}

/** One open, overdue Module 3 question. */
const question = (id: number) => ({
  id,
  question_text: 'Provide the ICH Q1E extrapolation analysis.',
  section_reference: '3.2.P.8.1',
  priority: 'high',
  severity: 'MAJOR',
  status: 'OPEN',
  region: 'FDA',
  due_date: '2026-01-01',
  assigned_to: null,
  response_doc_id: null,
  overdue: true,
});

/** The page the board reads (capped at 50) and the store's true totals. */
function routeQueries(pageSize: number, totals: { total: number; overdue: number } | null) {
  mockQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('from reg_questions') && text.includes('count(*)')) {
      return { rows: totals ? [totals] : [] };
    }
    if (text.includes('from reg_questions')) {
      return { rows: Array.from({ length: pageSize }, (_, i) => question(i + 1)) };
    }
    // Every other block the board aggregates is not the subject here.
    return { rows: [] };
  });
}

beforeEach(() => mockQuery.mockReset());

describe('GET /api/cmc/module3-board — overdue IR count', () => {
  it('counts overdue questions from the store, not from the capped page', async () => {
    routeQueries(50, { total: 128, overdue: 73 });
    const res = await request(makeApp()).get('/api/cmc/module3-board');
    expect(res.status).toBe(200);
    // 73, not the 50 the page holds.
    expect(res.body.data.kpis.irOverdue).toBe(73);
    expect(res.body.data.correspondence).toHaveLength(50);
    expect(res.body.data.meta.correspondenceTotalOpen).toBe(128);
    expect(res.body.data.meta.correspondenceTruncated).toBe(true);
  });

  it('is not truncated when the page holds everything the store has', async () => {
    routeQueries(3, { total: 3, overdue: 2 });
    const res = await request(makeApp()).get('/api/cmc/module3-board');
    expect(res.body.data.kpis.irOverdue).toBe(2);
    expect(res.body.data.meta.correspondenceTotalOpen).toBe(3);
    expect(res.body.data.meta.correspondenceTruncated).toBe(false);
  });

  it('falls back to the page when the totals query returns nothing, rather than reporting zero', async () => {
    routeQueries(4, null);
    const res = await request(makeApp()).get('/api/cmc/module3-board');
    // All four page rows are overdue; a missing totals row must not zero the KPI.
    expect(res.body.data.kpis.irOverdue).toBe(4);
  });
});

/**
 * `provisioned: false` was the answer to two different questions.
 *
 * Every read block returned it for ANY exception, so a transient database
 * error and an absent table were indistinguishable — and the KPI, on
 * `provisioned: false`, silently swapped to the legacy per-submission `ir`
 * sum. A failed read therefore rendered as "0 information requests overdue"
 * under the same label as the real count. 42P01 (undefined_table) is genuinely
 * unprovisioned; anything else is a read that did not complete, and the count
 * is then not established rather than zero.
 */
describe('GET /api/cmc/module3-board — a failed question read is not "none overdue"', () => {
  /** One submission in the legacy store, and every reg_questions read failing. */
  function questionsFail(err: unknown) {
    mockQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('reg_questions')) throw err;
      if (text.includes('from reg_submissions')) {
        return { rows: [{ sub_id: 'IND-1', product_id: 'P1', region: 'FDA', sub_type: 'ind' }] };
      }
      return { rows: [] };
    });
  }

  it('publishes no overdue count when the question store cannot be read', async () => {
    questionsFail(Object.assign(new Error('connection terminated'), { code: '57P01' }));
    const res = await request(makeApp()).get('/api/cmc/module3-board');
    expect(res.status).toBe(200);
    // Not 0. The store did not answer, so there is no count to report.
    expect(res.body.data.kpis.irOverdue).toBeNull();
    expect(res.body.data.meta.correspondenceUnreadable).toBe(true);
    expect(res.body.data.meta.correspondenceProvisioned).toBe(false);
  });

  it('still falls back to the legacy sum when the table is genuinely absent', async () => {
    questionsFail(Object.assign(new Error('relation "reg_questions" does not exist'), { code: '42P01' }));
    const res = await request(makeApp()).get('/api/cmc/module3-board');
    expect(res.status).toBe(200);
    expect(res.body.data.meta.correspondenceUnreadable).toBe(false);
    expect(res.body.data.meta.correspondenceProvisioned).toBe(false);
    // An environment without the store reports the legacy figure, as before.
    expect(typeof res.body.data.kpis.irOverdue).toBe('number');
  });
});
