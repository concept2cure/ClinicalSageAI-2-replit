/**
 * Route test for GET /api/c2c/projects — where "readiness" comes from.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The list reported `COALESCE(p.progress_percent, 0) AS readiness`.
 * `regulatory_programs.progress_percent` is written exactly ONCE — the literal
 * `0` in this router's own INSERT — and no `UPDATE` of that column exists
 * anywhere in server/. Two seed scripts set it; nothing in the product ever
 * does.
 *
 * So every project a customer created reported 0% readiness forever. Draft and
 * approve an entire IND and the card still read 0%, while the documents inside
 * it carried a number a database trigger genuinely maintained.
 *
 * A figure that looks measured and can never move is worse than no figure: it
 * reads as "no progress" rather than as "not computed".
 *
 * The list now derives it from the governed sections, on the same predicate
 * c2c_recompute_document_readiness() uses for a single document — so a project
 * is measured the way its documents are, weighted by how many sections each has.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

import router from '../projects';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';

function app(orgId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    if (orgId != null) req.organizationId = orgId;
    next();
  });
  a.use('/api/c2c/projects', router);
  return a;
}

/**
 * The two rows the list SELECT returns — both carrying the stale stored 0.
 *
 * A FACTORY, not a shared literal: the route overwrites `readiness` on the row
 * objects it got back from the driver. In production every query returns fresh
 * objects; a shared fixture here would carry one test's result into the next.
 */
const listRows = () => ({
  rows: [
    { id: P1, title: 'BX-204', ws: 'Biotech', code: 'BX-204', stage: 'Planning', readiness: 0, status: 'active', lead: '—', blocker: null, due: '—', activity: 'Updated Aug 10' },
    { id: P2, title: 'DX-9', ws: 'MDX', code: 'DX-9', stage: 'Planning', readiness: 0, status: 'active', lead: '—', blocker: null, due: '—', activity: 'Updated Aug 10' },
  ],
});

beforeEach(() => queryMock.mockReset());

describe('GET /api/c2c/projects — readiness is measured, not stored', () => {
  it('reports the governed section completion, not the frozen progress_percent', async () => {
    queryMock
      .mockResolvedValueOnce(listRows())
      // The aggregate over c2c_documents × c2c_document_sections.
      .mockResolvedValueOnce({ rows: [{ project_id: P1, readiness: 62 }] });

    const res = await request(app(7)).get('/api/c2c/projects');
    expect(res.status).toBe(200);

    const byId = Object.fromEntries(res.body.data.map((p: any) => [p.id, p.readiness]));
    // THE defect: this was 0 no matter how much of the filing had been approved.
    expect(byId[P1]).toBe(62);
    // A project with no governed sections has genuinely approved nothing.
    expect(byId[P2]).toBe(0);
  });

  it('asks only about the projects on this page, and scopes to the caller org', async () => {
    queryMock
      .mockResolvedValueOnce(listRows())
      .mockResolvedValueOnce({ rows: [] });

    await request(app(7)).get('/api/c2c/projects');

    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/FROM c2c_documents d/);
    // Org predicate — a readiness figure must never aggregate another tenant's
    // filing, even though project ids are uuids.
    expect(sql).toMatch(/d\.org_id = \$2/);
    expect(params[0]).toEqual([P1, P2]);
    expect(params[1]).toBe(7);
  });

  it('uses the same status set as the readiness trigger', async () => {
    queryMock.mockResolvedValueOnce(listRows()).mockResolvedValueOnce({ rows: [] });
    await request(app(7)).get('/api/c2c/projects');

    const [sql] = queryMock.mock.calls[1];
    // Rendered from C2C_SECTION_COMPLETE_STATUSES, which
    // c2c-section-completion.contract.test.ts pins against the migration.
    expect(sql).toMatch(/FILTER \(WHERE s\.status IN \('approved', 'locked'\)\)/);
  });

  it('still returns the list when the governed store is absent', async () => {
    // c2c_documents may not exist on a database without the phase-9 schema —
    // the vault route already fails closed on exactly that. The project list is
    // the primary surface and must not be taken down by an enrichment.
    queryMock
      .mockResolvedValueOnce(listRows())
      .mockRejectedValueOnce(Object.assign(new Error('relation "c2c_documents" does not exist'), { code: '42P01' }));

    const res = await request(app(7)).get('/api/c2c/projects');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // Falls back to the stored value. Not a good answer — it is the same 0 —
    // but it is the pre-existing one, and the route logs rather than pretending.
    expect(res.body.data[0].readiness).toBe(0);
  });
});
