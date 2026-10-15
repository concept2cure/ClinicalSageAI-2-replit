/**
 * /api/mdx/qms/changes — the QMS change-control register (ICH Q10 / Annex 15).
 *
 * Locks the contract the Quality & Assurance "Change Control" surface depends on:
 *   - 403 without org context (tenant isolation)
 *   - create returns the governed row + 201
 *   - the controlled lifecycle: a legal transition succeeds; an illegal one is a
 *     409, not a silent no-op; approval enforces segregation of duties (422)
 *   - reads fail CLOSED to an honest empty list + pendingStore when the store is
 *     not provisioned (42P01), never a 500
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const logAction = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../services/auditService', () => ({ default: { logAction } }));
const REASON = 'Impact assessment opened by QA';

import mdxQmsRouter from '../mdx-qms';

function appWith(org: number | null, userId = 7, role = 'member') {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: userId, role };
    next();
  });
  app.use('/api/mdx', mdxQmsRouter);
  return app;
}

function changeRow(over: Record<string, unknown> = {}) {
  return {
    id: 1, organization_id: 9, change_number: 'CC-2026-001', title: 'Supplier change',
    description: null, change_type: 'supplier', classification: 'major', risk_level: 'medium',
    status: 'proposed', reason: null, impact_assessment: null, implementation_plan: null,
    proposed_by: 7, assessed_by: null, approved_by: null, approved_at: null,
    target_implementation_date: null, implemented_at: null, verified_by: null, verified_at: null,
    effectiveness_review: null, closed_at: null, qms_document_id: null, metadata: {},
    created_at: '2026-07-24T00:00:00Z', updated_at: '2026-07-24T00:00:00Z',
    ...over,
  };
}

beforeEach(() => { query.mockReset(); logAction.mockClear(); });

describe('GET /api/mdx/qms/changes', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/mdx/qms/changes');
    expect(res.status).toBe(403);
  });

  it('lists the register, org-scoped', async () => {
    query
      .mockResolvedValueOnce({ rows: [changeRow(), changeRow({ id: 2, change_number: 'CC-2026-002' })] })
      .mockResolvedValueOnce({ rows: [] }); // links
    const res = await request(appWith(9)).get('/api/mdx/qms/changes');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1][0]).toBe(9);          // organization_id = $1
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.count).toBe(2);
  });

  /* QA walk 2026-10-08 (J8): the register returned the change rows only, so
     the surface's LINKS column read 0 and "No linked records yet" for changes
     with three links; and its Advance control handed AnA a prompt because the
     client had no lifecycle to offer. Each row now carries its links (one
     org-scoped query for the register) and the lifecycle moves the server
     allows from its state (CHANGE_TRANSITIONS, the one definition). */
  it('returns each change with its linked records and the moves its state allows', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          changeRow({ id: 1, status: 'proposed', implementation_overdue: true }),
          changeRow({ id: 2, change_number: 'CC-2026-002', status: 'closed', implementation_overdue: false }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 11, organization_id: 9, change_id: 1, link_type: 'deviation', linked_ref: 'DEV-2026-041', relationship: 'triggered_by' },
          { id: 12, organization_id: 9, change_id: 1, link_type: 'validation', linked_ref: 'VP-7', relationship: 'requires' },
        ],
      });
    const res = await request(appWith(9)).get('/api/mdx/qms/changes');
    expect(res.status).toBe(200);
    const [first, second] = res.body.data;
    expect(first.links.map((l: { linked_ref: string }) => l.linked_ref)).toEqual(['DEV-2026-041', 'VP-7']);
    expect(second.links).toEqual([]);
    expect(first.next_states).toEqual(['under_assessment', 'cancelled']);
    expect(second.next_states).toEqual([]);
    expect(first.implementation_overdue).toBe(true);
    // The links read is org-scoped and asks for exactly the listed changes.
    expect(String(query.mock.calls[1][0])).toMatch(/qms_change_links/);
    expect(query.mock.calls[1][1]).toEqual([9, [1, 2]]);
    // The overdue flag is computed by the database, against its own date.
    expect(String(query.mock.calls[0][0])).toMatch(/CURRENT_DATE/);
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(9)).get('/api/mdx/qms/changes');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});

describe('POST /api/mdx/qms/changes', () => {
  it('creates a change request and returns the row', async () => {
    query.mockResolvedValueOnce({ rows: [changeRow()] });
    const res = await request(appWith(9)).post('/api/mdx/qms/changes')
      .send({ changeNumber: 'CC-2026-001', title: 'Supplier change', changeType: 'supplier', classification: 'major' });
    expect(res.status).toBe(201);
    expect(res.body.data.change_number).toBe('CC-2026-001');
    expect(query.mock.calls[0][1][0]).toBe(9);          // proposed_by/org scoped
  });

  it('422 on invalid body (missing title)', async () => {
    const res = await request(appWith(9)).post('/api/mdx/qms/changes').send({ changeNumber: 'CC-2026-001' });
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('409 on duplicate change number (23505)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const res = await request(appWith(9)).post('/api/mdx/qms/changes')
      .send({ changeNumber: 'CC-2026-001', title: 'dup' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/mdx/qms/changes/:id/transition — controlled lifecycle', () => {
  it('advances a legal transition (proposed → under_assessment), recording the reason', async () => {
    query
      .mockResolvedValueOnce({ rows: [changeRow({ status: 'proposed' })] })   // getChange
      .mockResolvedValueOnce({ rows: [changeRow({ status: 'under_assessment' })] }); // update
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/transition').send({ to: 'under_assessment', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('under_assessment');
    expect(logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'mdx.qms.change.transition', reason: REASON,
      details: expect.objectContaining({ from: 'proposed', to: 'under_assessment' }),
    }));
  });

  /* A lifecycle move is a change to a controlled record, so it states why
     (21 CFR 11.10(e)) — the AnA tool for the same move already required one;
     the route took none, so a native control had nothing to record. */
  it('422 without a reason for the move, reading and writing nothing', async () => {
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/transition').send({ to: 'under_assessment' });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/reason/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('409 on an illegal transition (closed → approved)', async () => {
    query.mockResolvedValueOnce({ rows: [changeRow({ status: 'closed' })] });  // getChange
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved', reason: REASON });
    expect(res.status).toBe(409);
  });

  /* Approval is an electronic signature (DP-31 / P1-28): the transition route
     no longer approves anyone, proposer or not. The signed door and its
     segregation-of-duties refusal are pinned in qms-change-approval-signature.test.ts. */
  it('428 for approval through the transition route, whoever asks', async () => {
    for (const actor of [7, 8]) {
      query.mockReset();
      query.mockResolvedValueOnce({ rows: [changeRow({ status: 'under_assessment', proposed_by: 7 })] });
      const res = await request(appWith(9, actor)).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved', reason: REASON });
      expect(res.status).toBe(428);
      expect(query.mock.calls.some((c) => /UPDATE qms_change_controls/i.test(String(c[0])))).toBe(false);
    }
  });
});

describe('POST /api/mdx/qms/changes/:id/links — cross-references', () => {
  it('links a change to a deviation', async () => {
    query
      .mockResolvedValueOnce({ rows: [changeRow()] })  // getChange guard
      .mockResolvedValueOnce({ rows: [{ id: 10, change_id: 1, link_type: 'deviation', linked_ref: 'DEV-2026-014', relationship: 'triggered_by' }] });
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/links')
      .send({ linkType: 'deviation', linkedRef: 'DEV-2026-014', relationship: 'triggered_by' });
    expect(res.status).toBe(201);
    expect(res.body.data.link_type).toBe('deviation');
  });

  it('422 on an invalid link type', async () => {
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/links')
      .send({ linkType: 'nonsense', linkedRef: 'X' });
    expect(res.status).toBe(422);
  });
});


/**
 * DP-60 (2026-10-01): every change-control write carries the editor gate the
 * document, supplier, audit and nonconformance writes carry (P1-31). A viewer
 * could open, edit, move through its lifecycle and delete a change record, and
 * add or remove its links; only the approve step, a signature, refused it.
 */
describe('change-control writes refuse a viewer (DP-60)', () => {
  const WRITES: Array<[method: 'post' | 'patch' | 'delete', path: string, body?: Record<string, unknown>]> = [
    ['post', '/api/mdx/qms/changes', { title: 'Supplier change', changeType: 'supplier' }],
    ['patch', '/api/mdx/qms/changes/1', { title: 'x' }],
    ['post', '/api/mdx/qms/changes/1/transition', { to: 'under_assessment' }],
    ['delete', '/api/mdx/qms/changes/1', { reason: 'Raised in error by the viewer' }],
    ['post', '/api/mdx/qms/changes/1/links', { linkedType: 'deviation', linkedRef: 'DEV-1' }],
    ['delete', '/api/mdx/qms/changes/1/links/3'],
  ];

  it.each(WRITES)('a viewer %s %s: 403, nothing read or written', async (method, path, body) => {
    const res = await request(appWith(9, 7, 'viewer'))[method](path).send(body ?? {});
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('a viewer still reads the register', async () => {
    query.mockResolvedValueOnce({ rows: [changeRow()] }).mockResolvedValueOnce({ rows: [] }); // changes, links
    const res = await request(appWith(9, 7, 'viewer')).get('/api/mdx/qms/changes');
    expect(res.status).toBe(200);
  });
});
