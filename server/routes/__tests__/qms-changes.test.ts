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
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn() } }));

import mdxQmsRouter from '../mdx-qms';

function appWith(org: number | null, userId = 7) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: userId };
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

beforeEach(() => query.mockReset());

describe('GET /api/mdx/qms/changes', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/mdx/qms/changes');
    expect(res.status).toBe(403);
  });

  it('lists the register, org-scoped', async () => {
    query.mockResolvedValueOnce({ rows: [changeRow(), changeRow({ id: 2, change_number: 'CC-2026-002' })] });
    const res = await request(appWith(9)).get('/api/mdx/qms/changes');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1][0]).toBe(9);          // organization_id = $1
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.count).toBe(2);
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
  it('advances a legal transition (proposed → under_assessment)', async () => {
    query
      .mockResolvedValueOnce({ rows: [changeRow({ status: 'proposed' })] })   // getChange
      .mockResolvedValueOnce({ rows: [changeRow({ status: 'under_assessment' })] }); // update
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/transition').send({ to: 'under_assessment' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('under_assessment');
  });

  it('409 on an illegal transition (closed → approved)', async () => {
    query.mockResolvedValueOnce({ rows: [changeRow({ status: 'closed' })] });  // getChange
    const res = await request(appWith(9)).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved' });
    expect(res.status).toBe(409);
  });

  it('422 when the approver is the proposer (segregation of duties)', async () => {
    // proposed_by 7 === acting user 7, moving under_assessment → approved.
    query.mockResolvedValueOnce({ rows: [changeRow({ status: 'under_assessment', proposed_by: 7 })] });
    const res = await request(appWith(9, 7)).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved' });
    expect(res.status).toBe(422);
  });

  it('allows approval by a different user', async () => {
    query
      .mockResolvedValueOnce({ rows: [changeRow({ status: 'under_assessment', proposed_by: 7 })] })  // getChange
      .mockResolvedValueOnce({ rows: [changeRow({ status: 'approved', approved_by: 8 })] });          // update
    const res = await request(appWith(9, 8)).post('/api/mdx/qms/changes/1/transition').send({ to: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
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
