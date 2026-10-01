/**
 * P1-31 (DP-34): there is one QMS write API, /api/mdx/qms, and a viewer
 * cannot write through it.
 *
 * Security review 2026-09-24, DP-34. `/api/qms/*` (server/routes/qms.ts over
 * server/services/qms/qms.service.ts, mounted by
 * server/bootstrap/register-document-routes.ts) was a second QMS write API
 * behind `authenticateToken` alone. A viewer could supersede an effective
 * controlled document, requalify or revoke a supplier and disposition
 * nonconforming product, and the supplier and nonconformance writes recorded
 * no audit row. No client called it (client/src has no '/api/qms/' caller; the
 * only one was qms-effective-only-by-signature.test.ts). P1-29 (59be4566)
 * already refused `to: 'retired'` and `to: 'effective'` there; `superseded`,
 * supplier approval and disposition still went through.
 *
 * The router, its service and its mount are deleted. Every capability has a
 * canonical twin on /api/mdx/qms (server/routes/mdx-qms.ts), and the twins of
 * the writes DP-34 names now carry the same editor gate the document writes
 * carry (`requireEditorAccess`), so "a viewer can requalify a supplier" is not
 * true through the remaining door either.
 *
 * The /api/qms half goes through the PRODUCTION registrar
 * (`registerDocumentRoutes`), not a hand-built app: the defect was a mount, so
 * the test asks the mount table. The pool fake is SQL-aware over one row per
 * table, so a route that writes really does change the row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

type Row = Record<string, unknown>;

const H = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  supplier: null as Record<string, unknown> | null,
  nc: null as Record<string, unknown> | null,
  audit_: null as Record<string, unknown> | null,
  writes: [] as string[],
  audit: [] as Array<Record<string, unknown>>,
  session: { id: 7, organizationId: 9, role: 'viewer' } as { id: number; organizationId: number; role: string },
}));

const TABLES: Array<[RegExp, 'doc' | 'supplier' | 'nc' | 'audit']> = [
  [/qms_documents/i, 'doc'],
  [/qms_suppliers/i, 'supplier'],
  [/qms_nonconforming_products/i, 'nc'],
  [/qms_internal_audits/i, 'audit'],
];

/** One row per QMS table, read and written the way Postgres would. */
async function fakeQuery(sql: string, params: unknown[] = []) {
  const s = String(sql);
  if (/^\s*INSERT/i.test(s)) {
    H.writes.push(s);
    return { rows: [{ id: 99 }], rowCount: 1 };
  }
  const hit = TABLES.find(([re]) => re.test(s));
  if (!hit) return { rows: [], rowCount: 0 };
  const key = hit[1] === 'audit' ? 'audit_' : hit[1];
  const row = H[key];
  if (/^\s*(UPDATE|DELETE)/i.test(s)) {
    H.writes.push(s);
    if (!row) return { rows: [], rowCount: 0 };
    const guarded = /status\s+IN\s*\(\s*'draft'\s*,\s*'in_review'\s*\)/i.test(s);
    if (guarded && !['draft', 'in_review'].includes(String(row.status))) return { rows: [], rowCount: 0 };
    const next: Row = { ...row };
    for (const col of ['status', 'approval_status', 'disposition']) {
      const m = new RegExp(`(?:SET|,)\\s*${col}\\s*=\\s*\\$(\\d+)`, 'i').exec(s);
      if (m) next[col] = params[Number(m[1]) - 1];
    }
    H[key] = next;
    return { rows: [next], rowCount: 1 };
  }
  return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
}

vi.mock('../../db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db')>()),
  pool: {
    query: (sql: string, p?: unknown[]) => fakeQuery(sql, p),
    connect: async () => ({ query: (sql: string, p?: unknown[]) => fakeQuery(sql, p), release: () => undefined }),
  },
}));
// The session middleware's job — who is asking — is done by the app below, as
// it is in production before any router runs. The token check is not under test.
vi.mock('../../middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/auth')>()),
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: async (e: Record<string, unknown>) => { H.audit.push(e); return { persisted: true, chained: true }; } },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async (e: Record<string, unknown>) => { H.audit.push(e); return { persisted: true, chained: true }; },
}));

import mdxQmsRouter from '../mdx-qms';
import { registerDocumentRoutes } from '../../bootstrap/register-document-routes';

let built: express.Express | null = null;

/** The production registrar's mounts, plus /api/mdx as register-inline-routes mounts it. */
async function productionApp(): Promise<express.Express> {
  if (built) return built;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { ...H.session };
    (req as unknown as { userRole: string }).userRole = H.session.role;
    (req as unknown as { tenantContext: unknown }).tenantContext = { organizationId: H.session.organizationId };
    next();
  });
  await registerDocumentRoutes({
    app,
    pool: {} as never,
    isStaticDataEnabled: () => false,
    mountStaticBusinessDataGuard: () => undefined,
    DEMO_ROUTES_ENABLED: false,
    EXPERIMENTAL_ROUTES_ENABLED: false,
  });
  app.use('/api/mdx', mdxQmsRouter);
  app.use((_req: Request, res: Response) => { res.status(404).json({ error: 'Not found' }); });
  built = app;
  return app;
}

const as = (role: string) => { H.session = { id: 7, organizationId: 9, role }; };

beforeEach(() => {
  H.doc = { id: 11, organization_id: 9, doc_number: 'SOP-001', title: 'Design control', version: '1.0', status: 'effective', author_id: 3 };
  H.supplier = { id: 12, organization_id: 9, supplier_name: 'Acme Resins', criticality: 'critical', approval_status: 'approved' };
  H.nc = { id: 13, organization_id: 9, nc_number: 'NC-001', description: 'Out of spec', disposition: 'pending' };
  H.audit_ = { id: 14, organization_id: 9, audit_number: 'IA-0', status: 'in_progress' };
  H.writes = [];
  H.audit = [];
  as('viewer');
});

/** What a request did: its status, the row it aimed at, and what it wrote. */
async function outcome(res: Promise<request.Response>, state: () => unknown) {
  const r = await res;
  return { status: r.status, state: state(), writes: H.writes.length, auditRows: H.audit.length };
}

const docStatus = () => H.doc?.status;
const supplierStatus = () => H.supplier?.approval_status;
const ncDisposition = () => H.nc?.disposition;
const auditStatus = () => H.audit_?.status;
const nothing = () => null;

/* The writes DP-34 names, as a viewer would send them to the legacy door. */
const LEGACY_WRITES: Array<{ name: string; path: string; body: Row; state: () => unknown; before: unknown }> = [
  { name: 'retire an effective document', path: '/api/qms/documents/11/transition', body: { to: 'retired' }, state: docStatus, before: 'effective' },
  { name: 'supersede an effective document', path: '/api/qms/documents/11/transition', body: { to: 'superseded' }, state: docStatus, before: 'effective' },
  { name: 'revoke a supplier', path: '/api/qms/suppliers/12/approval', body: { approvalStatus: 'revoked' }, state: supplierStatus, before: 'approved' },
  { name: 'disposition nonconforming product', path: '/api/qms/nonconformances/13/disposition', body: { disposition: 'use_as_is' }, state: ncDisposition, before: 'pending' },
];

describe('/api/qms is not mounted: a viewer reaches no QMS write through it (P1-31 / DP-34)', () => {
  for (const w of LEGACY_WRITES) {
    it(`a viewer cannot ${w.name} through POST ${w.path}`, async () => {
      const app = await productionApp();
      expect(await outcome(request(app).post(w.path).send(w.body), w.state))
        .toEqual({ status: 404, state: w.before, writes: 0, auditRows: 0 });
    });
  }

  it('an editor cannot either: the door is gone, not narrowed', async () => {
    as('manager');
    const app = await productionApp();
    expect(await outcome(request(app).post('/api/qms/documents/11/transition').send({ to: 'superseded' }), docStatus))
      .toEqual({ status: 404, state: 'effective', writes: 0, auditRows: 0 });
  });

  it('none of its reads answer either', async () => {
    const app = await productionApp();
    for (const p of ['/api/qms/documents', '/api/qms/suppliers', '/api/qms/nonconformances', '/api/qms/summary']) {
      expect((await request(app).get(p)).status, p).toBe(404);
    }
  });
});

describe('the canonical twins on /api/mdx/qms refuse a viewer and still serve an editor', () => {
  const CANONICAL: Array<{ name: string; method: 'post' | 'patch'; path: string; body: Row; state: () => unknown; before: unknown }> = [
    { name: 'requalify or revoke a supplier', method: 'patch', path: '/api/mdx/qms/suppliers/12', body: { approvalStatus: 'revoked' }, state: supplierStatus, before: 'approved' },
    {
      name: 'disposition nonconforming product', method: 'patch', path: '/api/mdx/qms/nonconforming/13/disposition',
      body: { disposition: 'use_as_is', dispositionRationale: 'within tolerance' }, state: ncDisposition, before: 'pending',
    },
    { name: 'qualify a supplier', method: 'post', path: '/api/mdx/qms/suppliers', body: { supplierName: 'New Co', criticality: 'major', approvalStatus: 'approved' }, state: nothing, before: null },
    { name: 'record a nonconformance', method: 'post', path: '/api/mdx/qms/nonconforming', body: { ncNumber: 'NC-002', description: 'Burr on housing' }, state: nothing, before: null },
    { name: 'log an internal audit', method: 'post', path: '/api/mdx/qms/internal-audits', body: { auditNumber: 'IA-1', scope: 'Design controls' }, state: nothing, before: null },
    { name: 'close out an internal audit', method: 'patch', path: '/api/mdx/qms/internal-audits/14', body: { status: 'closed', majorFindings: 0 }, state: auditStatus, before: 'in_progress' },
    { name: 'sign off a management review', method: 'post', path: '/api/mdx/qms/management-reviews', body: { reviewDate: '2026-10-01', period: '2026-Q3' }, state: nothing, before: null },
    {
      name: 'retire a document (already gated by 6582e3a3)', method: 'post', path: '/api/mdx/qms/documents/11/retire',
      body: { reason: 'Replaced by SOP-002', password: 'x', meaning: 'APPROVED' }, state: docStatus, before: 'effective',
    },
  ];

  for (const c of CANONICAL) {
    it(`a viewer cannot ${c.name} through ${c.method.toUpperCase()} ${c.path}`, async () => {
      const app = await productionApp();
      expect(await outcome(request(app)[c.method](c.path).send(c.body), c.state))
        .toEqual({ status: 403, state: c.before, writes: 0, auditRows: 0 });
    });
  }

  it('a manager still revokes a supplier, and the change is audited', async () => {
    as('manager');
    const res = await request(await productionApp()).patch('/api/mdx/qms/suppliers/12').send({ approvalStatus: 'revoked' });
    expect(res.status).toBe(200);
    expect(H.supplier?.approval_status).toBe('revoked');
    expect(H.audit).toEqual([expect.objectContaining({ action: 'mdx.qms.supplier.update', resourceType: 'qms_supplier' })]);
    expect(res.body.meta?.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('a member still dispositions nonconforming product, and the change is audited', async () => {
    as('member');
    const res = await request(await productionApp())
      .patch('/api/mdx/qms/nonconforming/13/disposition')
      .send({ disposition: 'rework', dispositionRationale: 'Deburr and re-inspect' });
    expect(res.status).toBe(200);
    expect(H.nc?.disposition).toBe('rework');
    expect(H.audit).toEqual([expect.objectContaining({ action: 'mdx.qms.nonconforming.disposition' })]);
  });

  it('a manager still routes a draft for review: the twin of transition to=in_review', async () => {
    as('manager');
    H.doc = { ...H.doc, status: 'draft' };
    const res = await request(await productionApp()).patch('/api/mdx/qms/documents/11').send({ status: 'in_review' });
    expect(res.status).toBe(200);
    expect(H.doc?.status).toBe('in_review');
  });

  it('a viewer still acknowledges training on a procedure: that is their own record, not a governed change', async () => {
    const res = await request(await productionApp()).post('/api/mdx/qms/documents/11/training-ack').send({ method: 'attestation' });
    expect(res.status).toBe(201);
    expect(H.audit).toEqual([expect.objectContaining({ action: 'mdx.qms.training.acknowledge', userId: 7 })]);
  });
});
