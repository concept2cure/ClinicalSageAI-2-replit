/**
 * Integration tests for the CMC portfolio routes
 * (mounted at /api/cmc/blueprint/portfolio): GET /overview and GET /export.csv.
 *
 * Focus: the `preflight_critical` column is wired to a REAL written-to
 * source — the `metadata.preflight` summaries that
 * POST /api/submission-ops/packages/:packageId/preflight persists onto
 * c2c_submission_packages — and renders an honest null (empty CSV cell)
 * when no package in the org has ever run preflight. `qc_alerts` and
 * `playbook_open` have no written-to backing source anywhere in the
 * codebase and must stay null / empty, never a fabricated zero.
 *
 * The pg query layer and the RPI engine are mocked — no DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { dbState } = vi.hoisted(() => ({
  dbState: {
    subs: [] as any[],
    // null → the c2c_submission_packages aggregate query throws (e.g. the
    // table is absent in a partial deployment); otherwise {ran, critical}.
    preflight: { ran: 0, critical: 0 } as { ran: number; critical: number } | null,
    preflightParams: [] as unknown[][],
    preflightSql: [] as string[],
  },
}));

vi.mock('../server/db', () => ({
  query: vi.fn(async (text: string, params?: unknown[]) => {
    const sql = String(text);
    if (sql.includes('from reg_submissions')) return { rows: dbState.subs };
    if (sql.includes('from reg_questions')) return { rows: [{ n: 3, overdue: 1 }] };
    if (sql.includes('from reg_obligations')) return { rows: [{ n: 2, overdue: 0 }] };
    if (sql.includes('from reg_m3_sections')) return { rows: [{ missing: 4, cov: 12 }] };
    if (sql.includes('from c2c_submission_packages')) {
      dbState.preflightParams.push(params ?? []);
      dbState.preflightSql.push(sql);
      if (dbState.preflight == null) throw new Error('relation does not exist');
      return { rows: [{ ran: dbState.preflight.ran, critical: dbState.preflight.critical }] };
    }
    return { rows: [] };
  }),
}));

// Pin the RPI engine (it reads many tables of its own) so rows render
// deterministically; RPI wiring is covered elsewhere.
vi.mock('../server/src/services/reg/rpi', () => ({
  computeRPI: vi.fn(async () => ({ rpi: 72, components: { m3Completeness: 80 } })),
}));

import portfolioRouter from '../server/api/cmc/portfolio';

function makeApp(orgId: number | null = 42) {
  const app = express();
  app.use((req, _res, next) => {
    if (orgId != null) (req as any).user = { id: 7, organizationId: orgId };
    next();
  });
  app.use('/portfolio', portfolioRouter);
  return app;
}

const SUB = { sub_id: 'SUB-1', product_id: 'PROD-1', region: 'FDA', app_type: 'NDA' };
const SUB2 = { sub_id: 'SUB-2', product_id: 'PROD-2', region: 'EMA', app_type: 'MAA' };

beforeEach(() => {
  dbState.subs = [SUB, SUB2];
  dbState.preflight = { ran: 0, critical: 0 };
  dbState.preflightParams = [];
  dbState.preflightSql = [];
});

describe('GET /portfolio/overview', () => {
  it('401s without an organization context', async () => {
    const res = await request(makeApp(null)).get('/portfolio/overview');
    expect(res.status).toBe(401);
  });

  it('renders preflight_critical as null when NO package has run preflight', async () => {
    dbState.preflight = { ran: 0, critical: 0 };
    const res = await request(makeApp()).get('/portfolio/overview');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const row of res.body) {
      // Honest "not measured yet" — never a fabricated zero.
      expect(row.preflight_critical).toBeNull();
    }
  });

  it('aggregates persisted preflight error counts org-wide onto every row', async () => {
    dbState.preflight = { ran: 3, critical: 5 };
    const res = await request(makeApp()).get('/portfolio/overview');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const row of res.body) {
      expect(row.preflight_critical).toBe(5);
    }
    // The aggregate is org-scoped (tenant id 42 parameterized) and computed
    // once per request, not per row.
    expect(dbState.preflightParams).toEqual([[42]]);
    // …and counts only a summary that describes the package's CURRENT bundle:
    // a summary whose bundle was cleared or replaced is not that package's
    // current outcome.
    expect(dbState.preflightSql[0]).toMatch(/metadata->'preflight'->>'bundleSha256' = metadata->'bundle'->>'sha256'/);
  });

  it('reports a real zero when packages HAVE run preflight with no errors', async () => {
    dbState.preflight = { ran: 2, critical: 0 };
    const res = await request(makeApp()).get('/portfolio/overview');
    expect(res.status).toBe(200);
    expect(res.body[0].preflight_critical).toBe(0);
  });

  it('degrades to null when the aggregate query fails (no fake count)', async () => {
    dbState.preflight = null;
    const res = await request(makeApp()).get('/portfolio/overview');
    expect(res.status).toBe(200);
    expect(res.body[0].preflight_critical).toBeNull();
  });

  it('keeps qc_alerts and playbook_open null (no written-to source exists)', async () => {
    dbState.preflight = { ran: 3, critical: 5 };
    const res = await request(makeApp()).get('/portfolio/overview');
    expect(res.status).toBe(200);
    for (const row of res.body) {
      expect(row.qc_alerts).toBeNull();
      expect(row.playbook_open).toBeNull();
    }
  });

  it('still computes the real per-submission metrics', async () => {
    const res = await request(makeApp()).get('/portfolio/overview');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      sub_id: 'SUB-1',
      rpi: 72,
      ir_open: 3,
      ir_overdue: 1,
      obligations_open: 2,
      obligations_overdue: 0,
      stability_cov_m: 12,
      m3_missing: 4,
    });
  });
});

describe('GET /portfolio/export.csv', () => {
  function parseCsv(text: string) {
    const [header, ...lines] = text.trim().split('\n');
    const cols = header.split(',');
    return lines.map(line => {
      const cells = line.split(',');
      return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
    });
  }

  it('matches the overview: empty preflight_critical cell when none have run', async () => {
    dbState.preflight = { ran: 0, critical: 0 };
    const res = await request(makeApp()).get('/portfolio/export.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const rows = parseCsv(res.text);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.preflight_critical).toBe('');
      expect(row.qc_alerts).toBe('');
      expect(row.playbook_open).toBe('');
    }
  });

  it('matches the overview: org-wide aggregate in every row when runs exist', async () => {
    dbState.preflight = { ran: 3, critical: 5 };
    const res = await request(makeApp()).get('/portfolio/export.csv');
    expect(res.status).toBe(200);
    const rows = parseCsv(res.text);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.preflight_critical).toBe('5');
      expect(row.qc_alerts).toBe('');
      expect(row.playbook_open).toBe('');
    }
    // Real per-submission metrics still present.
    expect(rows[0].ir_open).toBe('3');
    expect(rows[0].m3_missing).toBe('4');
    // Computed once for the export, org-scoped.
    expect(dbState.preflightParams).toEqual([[42]]);
  });
});
