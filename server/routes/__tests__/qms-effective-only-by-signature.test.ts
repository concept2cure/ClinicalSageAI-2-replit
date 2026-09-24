/**
 * A controlled QMS document becomes effective ONLY through the signed approval.
 *
 * VSR-001 F-3 made `POST /api/mdx/qms/documents/:id/approve` an electronic
 * signature: signing authority, password and second factor re-verified, the
 * §11.50 meaning, author ≠ approver, one `electronic_signatures` row bound to
 * the version's content digest. The new-code audit of 2026-09-24 (finding 1)
 * found three other writes that reach the same `status = 'effective'` with
 * none of that:
 *
 *   1. the AnA tool `approve_qms_document` (ana-cannot-sign.test.ts and
 *      qms-vault-audit-atomicity.contract.test.ts);
 *   2. `POST /api/qms/documents/:id/transition {to:'effective'}`, which stamps
 *      the caller as approver;
 *   3. `POST` and `PATCH /api/mdx/qms/documents`, whose schemas admitted every
 *      status. PATCH could also rewrite the title or version of a document
 *      already signed, so the stored row stopped matching the digest its
 *      signature is bound to while it stayed effective.
 *
 * This file covers 2 and 3. The pool fakes are SQL-aware over one document
 * row: an UPDATE without a status guard really does change an effective
 * document, so a route that lacks the guard fails here for the right reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  sql: [] as string[],
}));

/** One qms_documents row, read and written the way Postgres would. */
async function fakeQuery(sql: string, params: unknown[] = []) {
  const s = String(sql);
  H.sql.push(s);
  const doc = H.doc;
  if (/^\s*INSERT INTO qms_documents/i.test(s)) {
    return { rows: [{ id: 21, status: params[6] ?? 'draft' }], rowCount: 1 };
  }
  if (!doc) return { rows: [], rowCount: 0 };
  if (/^\s*UPDATE qms_documents/i.test(s)) {
    const guarded = /status\s+IN\s*\(\s*'draft'\s*,\s*'in_review'\s*\)/i.test(s);
    if (guarded && !['draft', 'in_review'].includes(String(doc.status))) return { rows: [], rowCount: 0 };
    const statusParam = /(?:SET|,)\s*status\s*=\s*\$(\d+)/i.exec(s);
    const next = { ...doc };
    if (statusParam) next.status = params[Number(statusParam[1]) - 1];
    if (/title\s*=\s*\$/i.test(s)) next.title = 'edited';
    H.doc = next;
    return { rows: [next], rowCount: 1 };
  }
  if (/^\s*SELECT/i.test(s) && /FROM qms_documents/i.test(s)) return { rows: [doc], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}

vi.mock('../../db', () => ({ pool: { query: (sql: string, p?: unknown[]) => fakeQuery(sql, p) } }));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));
// /api/qms authenticates itself; the harness below stands in for the session.
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: async () => ({ persisted: true, chained: true }) },
}));

import mdxQmsRouter from '../mdx-qms';
import qmsRouter from '../qms';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: 9, id: 7 };
    (req as unknown as { tenantContext: unknown }).tenantContext = { organizationId: 9 };
    next();
  });
  a.use('/api/mdx', mdxQmsRouter);
  a.use('/api/qms', qmsRouter);
  return a;
}

const docInState = (status: string) => ({
  id: 11,
  organization_id: 9,
  doc_number: 'SOP-001',
  title: 'Design control',
  version: '1.0',
  status,
  approver_id: status === 'effective' ? 3 : null,
  approved_at: status === 'effective' ? '2026-09-20T10:00:00Z' : null,
  author_id: 7,
});

const wrote = () => H.sql.some((s) => /^\s*(UPDATE|INSERT)/i.test(s));

beforeEach(() => {
  H.doc = null;
  H.sql = [];
});

describe('POST /api/qms/documents/:id/transition cannot approve', () => {
  it('refuses to=effective and changes nothing', async () => {
    H.doc = docInState('in_review');
    const res = await request(app()).post('/api/qms/documents/11/transition').send({ to: 'effective' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/electronic signature/i);
    expect(H.doc?.status).toBe('in_review');
    expect(H.doc?.approver_id).toBeNull();
    expect(wrote()).toBe(false);
  });

  it('still moves a draft into review', async () => {
    H.doc = docInState('draft');
    const res = await request(app()).post('/api/qms/documents/11/transition').send({ to: 'in_review' });
    expect(res.status).toBe(200);
    expect(H.doc?.status).toBe('in_review');
  });
});

describe('POST /api/mdx/qms/documents cannot create an effective document', () => {
  it('refuses status=effective before any write', async () => {
    const res = await request(app())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-002', title: 'Born approved', docType: 'sop', status: 'effective', effectiveDate: '2026-09-24' });
    expect(res.status).toBe(422);
    expect(wrote()).toBe(false);
  });

  it('still creates a draft', async () => {
    const res = await request(app())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-002', title: 'New procedure', docType: 'sop' });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/mdx/qms/documents/:id cannot approve, and cannot edit a signed document', () => {
  it('refuses status=effective before any write', async () => {
    H.doc = docInState('in_review');
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send({ status: 'effective' });
    expect(res.status).toBe(422);
    expect(H.doc?.status).toBe('in_review');
    expect(wrote()).toBe(false);
  });

  it('refuses to edit an effective document: that is a revision', async () => {
    H.doc = docInState('effective');
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send({ title: 'Quietly changed' });
    expect(res.status).toBe(409);
    expect(res.body.details?.code).toBe('QMS_DOCUMENT_CONTROLLED');
    expect(H.doc?.title).toBe('Design control');
    expect(H.doc?.status).toBe('effective');
  });

  it('still edits a draft and routes it for review', async () => {
    H.doc = docInState('draft');
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send({ status: 'in_review', title: 'Design control' });
    expect(res.status).toBe(200);
    expect(H.doc?.status).toBe('in_review');
  });

  it('says a missing document is missing, not controlled', async () => {
    H.doc = null;
    const res = await request(app()).patch('/api/mdx/qms/documents/11').send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});
