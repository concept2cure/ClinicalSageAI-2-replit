/**
 * The earlier CMC question file (reg_questions), read-only since 2026-10-19
 * (rows D2 and D5; decisions P-38 and P-39 item 1).
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 * Agency questions have one home: the letter they came in, worked in
 * Communication and Project home's Respond over agency_communication_questions,
 * where a response is approved by a Part 11 signature. This file was a second
 * home: CMC logged, triaged and CLOSED questions here by status update, with
 * no signature, no reason and no ledger row. Its writes are retired; the
 * database refuses them as well (migrations/20261019b_reg_questions_read_only.sql).
 * The rows stay, and are shown in CMC as history.
 *
 * ── What these pin ───────────────────────────────────────────────────────────
 *   • GET lists every row of the organisation (not only Module 3: the old POST
 *     refused other sections, so those rows predate it and still count), with
 *     the status exactly as stored and the dates as the stored text — no
 *     time-zone conversion, no closure date the row does not hold.
 *   • The counts come from the store, not from the listed page; "not closed"
 *     is any status but CLOSED, compared without case, NULL included.
 *   • POST and PATCH answer 410 with nothing written and no query issued.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, orgHolder } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  orgHolder: { value: '42' as string | null },
}));

vi.mock('../../db.js', () => ({
  query: (...a: unknown[]) => mockQuery(...a),
}));

import createCmcAgencyQuestionRoutes from '../cmc-agency-questions.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  // The verified identity, as the /api auth gate populates it; the route
  // resolves its org through the canonical resolveOrgId.
  app.use((req, _res, next) => {
    if (orgHolder.value !== null) {
      (req as express.Request & { user?: unknown }).user = { id: 1, organizationId: orgHolder.value };
    }
    next();
  });
  app.use('/api/cmc/agency-questions', createCmcAgencyQuestionRoutes());
  return app;
}

const ROW = {
  id: 7,
  question_text: 'Provide the ICH Q1E extrapolation analysis.',
  section_reference: '3.2.P.8.1',
  priority: 'high',
  severity: 'MAJOR',
  status: 'CLOSED',
  region: 'FDA',
  due_date: '2026-09-30',
  assigned_to: 'R. Lead',
  response_doc_id: null,
  recorded_on: '2026-08-24',
  last_changed_on: '2026-09-02',
};

/** The page and the store's own counts, told apart by the statement. */
function wire(rows: unknown[], counts: { total: number; not_closed: number }) {
  mockQuery.mockImplementation(async (sql: string) => (String(sql).includes('count(*)') ? { rows: [counts] } : { rows }));
}

beforeEach(() => {
  mockQuery.mockReset();
  orgHolder.value = '42';
});

describe('GET /api/cmc/agency-questions — the earlier file, as history', () => {
  it('lists every row of the organisation, scoped by the verified org, with the counts from the store', async () => {
    wire([ROW], { total: 240, not_closed: 3 });
    const res = await request(makeApp()).get('/api/cmc/agency-questions');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 240, notClosed: 3, listed: 1, truncated: true });

    const statements = mockQuery.mock.calls.map(([sql, params]) => ({ sql: String(sql), params }));
    expect(statements).toHaveLength(2);
    for (const s of statements) {
      expect(s.sql).toMatch(/from reg_questions/);
      expect(s.sql).toMatch(/organization_id = \$1/);
      expect(s.params).toEqual([42]);
      // Every row of the organisation: no Module 3 filter.
      expect(s.sql).not.toMatch(/section_reference ilike/);
    }
    const count = statements.find((s) => s.sql.includes('count(*)'))!.sql;
    // Not closed: any status but CLOSED, without case, NULL included.
    expect(count).toMatch(/upper\(status\) is distinct from 'CLOSED'/i);
  });

  it('serves what the row holds: the status verbatim, the dates as stored text, no closure date', async () => {
    wire([ROW, { ...ROW, id: 8, status: 'pending', due_date: null, last_changed_on: '2026-08-24' }], { total: 2, not_closed: 1 });
    const res = await request(makeApp()).get('/api/cmc/agency-questions');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({
      id: 7,
      question: 'Provide the ICH Q1E extrapolation analysis.',
      sectionRef: '3.2.P.8.1',
      priority: 'high',
      severity: 'MAJOR',
      status: 'CLOSED',
      region: 'FDA',
      dueDate: '2026-09-30',
      assignedTo: 'R. Lead',
      responseDocId: null,
      recordedOn: '2026-08-24',
      lastChangedOn: '2026-09-02',
    });
    expect(res.body.data[1].status).toBe('pending');
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('closedAt');
      expect(row).not.toHaveProperty('overdue');
    }
    const page = mockQuery.mock.calls.map(([sql]) => String(sql)).find((s) => !s.includes('count(*)'))!;
    expect(page).toMatch(/to_char\(created_at, 'YYYY-MM-DD'\)/);
    expect(page).toMatch(/to_char\(updated_at, 'YYYY-MM-DD'\)/);
    expect(page).toMatch(/to_char\(due_date, 'YYYY-MM-DD'\)/);
  });

  it('a file that was never created here is an empty history, said as such; a failed read is an error', async () => {
    mockQuery.mockRejectedValue(Object.assign(new Error('relation "reg_questions" does not exist'), { code: '42P01' }));
    const absent = await request(makeApp()).get('/api/cmc/agency-questions');
    expect(absent.status).toBe(200);
    expect(absent.body).toMatchObject({ data: [], meta: { provisioned: false, total: 0, notClosed: 0 } });

    mockQuery.mockReset();
    mockQuery.mockRejectedValue(Object.assign(new Error('connection terminated'), { code: '57P01' }));
    const failed = await request(makeApp()).get('/api/cmc/agency-questions');
    expect(failed.status).toBe(500);
    expect(failed.body.success).toBe(false);
  });

  it('refuses with 401 when no org context resolves, and reads nothing', async () => {
    orgHolder.value = null;
    const res = await request(makeApp()).get('/api/cmc/agency-questions');
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('the earlier file\'s writes are retired', () => {
  it('POST answers 410 naming the letter as the record, with no query issued', async () => {
    const res = await request(makeApp())
      .post('/api/cmc/agency-questions')
      .send({ questionText: 'Provide the ICH Q1E extrapolation analysis.', sectionReference: '3.2.P.8.1' });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ success: false, error: { code: 'CMC_QUESTION_FILE_READ_ONLY' } });
    expect(res.body.error.message).toMatch(/letter/i);
    expect(res.body.error.message).toMatch(/Communication/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('PATCH answers 410 for any body, including a close, with no query issued', async () => {
    for (const body of [{ status: 'CLOSED' }, { assignedTo: 'R. Lead' }, { responseDocId: null }, {}]) {
      const res = await request(makeApp()).patch('/api/cmc/agency-questions/7').send(body);
      expect(res.status, JSON.stringify(body)).toBe(410);
      expect(res.body.error.code).toBe('CMC_QUESTION_FILE_READ_ONLY');
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('there is no DELETE either', async () => {
    const res = await request(makeApp()).delete('/api/cmc/agency-questions/7');
    expect(res.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
