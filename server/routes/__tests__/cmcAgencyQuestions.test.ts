/**
 * Agency questions — the correspondence loop's WRITE half, org-scoped.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * The only "writer" for reg_questions was a legacy IR router built against a
 * table shape this schema does not have, with NO tenant predicate on any
 * query and a delete gated by a client-controlled header. These routes are
 * its replacement on the live schema: the org comes from the verified
 * context only, every UPDATE carries the org predicate, and a row in another
 * org answers exactly like a row that does not exist.
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
vi.mock('../../utils/tenantContext.js', () => ({
  getSecureOrgId: () => orgHolder.value,
}));

import createCmcAgencyQuestionRoutes from '../cmc-agency-questions.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/cmc/agency-questions', createCmcAgencyQuestionRoutes());
  return app;
}

const ROW = {
  id: 7,
  question_text: 'Provide the ICH Q1E extrapolation analysis.',
  section_reference: '3.2.P.8.1',
  priority: 'high',
  severity: 'MAJOR',
  status: 'OPEN',
  region: 'FDA',
  due_date: '2026-09-30',
  assigned_to: null,
  created_at: '2026-08-24T05:00:00Z',
  updated_at: '2026-08-24T05:00:00Z',
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [ROW] });
  orgHolder.value = '42';
});

describe('GET /api/cmc/agency-questions', () => {
  it('serves the org-scoped file; ?status=CLOSED reads the answered history', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...ROW, status: 'CLOSED' }] });
    const res = await request(makeApp()).get('/api/cmc/agency-questions?status=closed');
    expect(res.status).toBe(200);
    expect(res.body.data[0].status).toBe('CLOSED');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('from reg_questions');
    expect(sql).toContain('organization_id = $1');
    expect(sql).toMatch(/status = \$2/);
    expect(params).toEqual([42, 'CLOSED']);
  });

  it('refuses an unknown status — never an empty list pretending to be one', async () => {
    const res = await request(makeApp()).get('/api/cmc/agency-questions?status=ARCHIVED');
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('no status serves the whole Module 3 file', async () => {
    const res = await request(makeApp()).get('/api/cmc/agency-questions');
    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toMatch(/status = \$/);
    expect(params).toEqual([42]);
  });
});

describe('POST /api/cmc/agency-questions', () => {
  it('stamps the VERIFIED org and starts the question OPEN — the body cannot choose a tenant', async () => {
    const res = await request(makeApp())
      .post('/api/cmc/agency-questions')
      .send({
        questionText: 'Provide the ICH Q1E extrapolation analysis.',
        sectionReference: '3.2.P.8.1',
        region: 'FDA',
        priority: 'high',
        dueDate: '2026-09-30',
        // A hostile body trying to write into another tenant:
        organizationId: 999,
        organization_id: 999,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.question).toBe('Provide the ICH Q1E extrapolation analysis.');
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into reg_questions');
    expect(sql).toContain("'OPEN'");
    // $1 is the verified org — 42, never the body's 999.
    expect(params[0]).toBe(42);
    expect(params).not.toContain(999);
  });

  it('refuses an empty question with 400 and writes nothing', async () => {
    const res = await request(makeApp())
      .post('/api/cmc/agency-questions')
      .send({ questionText: '   ' });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/question text is required/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses with 401 when no org context resolves', async () => {
    orgHolder.value = null;
    const res = await request(makeApp())
      .post('/api/cmc/agency-questions')
      .send({ questionText: 'Q' });
    expect(res.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refuses a non-Module-3 section reference — refusal beats a 201 row the board's 3.x filter would make unreachable", async () => {
    for (const bad of ['2.5', 'S.4.1', 'm2.7']) {
      const res = await request(makeApp())
        .post('/api/cmc/agency-questions')
        .send({ questionText: 'Q', sectionReference: bad });
      expect(res.status).toBe(400);
      expect(String(res.body.error)).toMatch(/Module 3/);
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('accepts an ABSENT section reference — the board lists unsectioned rows', async () => {
    const res = await request(makeApp())
      .post('/api/cmc/agency-questions')
      .send({ questionText: 'Which stability protocol applies?' });
    expect(res.status).toBe(201);
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBeNull();
  });
});

describe('PATCH /api/cmc/agency-questions/:id', () => {
  it('updates WHERE id AND organization_id — the org predicate is structural', async () => {
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ status: 'CLOSED' });

    expect(res.status).toBe(200);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('update reg_questions');
    expect(sql).toMatch(/where id = \$\d+ and organization_id = \$\d+/);
    expect(params).toContain(7);
    expect(params).toContain(42);
  });

  it("another org's row answers 404 — indistinguishable from absent", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ status: 'CLOSED' });
    expect(res.status).toBe(404);
  });

  it('refuses an update naming no fields', async () => {
    const res = await request(makeApp()).patch('/api/cmc/agency-questions/7').send({});
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a status outside the lifecycle the board reads', async () => {
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ status: 'DELETED' });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('expectedStatus guards the write: a row that moved on answers 409, not a silent overwrite', async () => {
    // UPDATE … AND status = $n matches nothing; the follow-up SELECT finds the
    // row CLOSED — the question changed since the caller's screen loaded.
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'CLOSED' }] });
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ status: 'DRAFTED', expectedStatus: 'OPEN' });
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/CLOSED/);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/and status = \$\d+/);
    expect(params).toContain('OPEN');
  });

  it('expectedStatus alone is a guard, not an update — 400, nothing touched', async () => {
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ expectedStatus: 'OPEN' });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a vanished row with a guard still answers 404, not 409', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ status: 'DRAFTED', expectedStatus: 'OPEN' });
    expect(res.status).toBe(404);
  });

  it('links a response draft only after verifying it exists IN THIS ORG', async () => {
    const DOC = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // the org-scoped existence check
      .mockResolvedValueOnce({ rows: [{ ...ROW, status: 'DRAFTED', response_doc_id: DOC }] });
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ status: 'DRAFTED', responseDocId: DOC });
    expect(res.status).toBe(200);
    expect(res.body.data.responseDocId).toBe(DOC);
    const [checkSql, checkParams] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(checkSql).toContain('from authoring_documents');
    expect(checkSql).toMatch(/tenant_id = \$\d+/);
    expect(checkParams).toEqual([DOC, 42]);
    const [updSql] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(updSql).toContain('response_doc_id');
  });

  it('refuses a dangling or cross-org responseDocId — nothing is linked', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // the doc is not in this org
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ responseDocId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/could not be found/i);
    // Only the existence check ran; no UPDATE was attempted.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('refuses a malformed responseDocId before any query runs — and clearing the link stays legal', async () => {
    const res = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ responseDocId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();

    const clear = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ responseDocId: null });
    expect(clear.status).toBe(200);
    // A null link needs no existence check — one UPDATE only.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('response_doc_id');
  });

  it('refuses re-sectioning a question OUT of Module 3 — clearing it stays legal', async () => {
    const bad = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ sectionReference: '2.7.1' });
    expect(bad.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();

    const clear = await request(makeApp())
      .patch('/api/cmc/agency-questions/7')
      .send({ sectionReference: null });
    expect(clear.status).toBe(200);
  });
});
