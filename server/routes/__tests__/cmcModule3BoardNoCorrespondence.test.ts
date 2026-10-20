/**
 * The Module 3 board serves no agency correspondence (2026-10-19, rows D2 and
 * D5; decisions P-38 and P-39 item 1).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The board read the earlier CMC question file (reg_questions) and served it
 * as `correspondence`, with an `irOverdue` KPI counted by its own rule
 * (`due_date < current_date` on a status the file's PATCH set by hand). That
 * made CMC a second home for agency questions, with a second overdue rule. The
 * questions now live on the letter (agency_communication_questions), CMC reads
 * them through GET /api/concept2cure/projects/:projectId/agency-questions, and
 * overdue has one definition (response-logic.ts letterOverdue). The earlier
 * file is read-only history, served by GET /api/cmc/agency-questions.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * No statement the board issues touches reg_questions, and its payload carries
 * no correspondence, no irOverdue and no meta.correspondence* field to be
 * mistaken for a count.
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

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (String(sql).includes('reg_questions')) {
      return { rows: [{ id: 1, question_text: 'Q', status: 'OPEN', overdue: true, total: 9, overdue_total: 9 }] };
    }
    return { rows: [] };
  });
});

describe('GET /api/cmc/module3-board — no second home for agency questions', () => {
  it('issues no statement against the earlier CMC question file', async () => {
    const res = await request(makeApp()).get('/api/cmc/module3-board?projectId=00000000-0000-4000-8000-000000000011');
    expect(res.status).toBe(200);
    const touched = mockQuery.mock.calls.map(([sql]) => String(sql)).filter((s) => /reg_questions/i.test(s));
    expect(touched).toEqual([]);
  });

  it('serves no correspondence, no overdue-IR KPI and no correspondence meta', async () => {
    const res = await request(makeApp()).get('/api/cmc/module3-board');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).not.toHaveProperty('correspondence');
    expect(d.kpis).not.toHaveProperty('irOverdue');
    expect(Object.keys(d.meta).filter((k) => k.startsWith('correspondence'))).toEqual([]);
  });
});
