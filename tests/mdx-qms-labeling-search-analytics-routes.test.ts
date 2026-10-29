/**
 * Integration tests for the four new backend domains: QMS, Labeling,
 * Global search, Analytics. SQL mocked at pool layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { RequestSqlClient } from '../server/db/requestDb';

const queryFn = vi.fn();

/* QMS approve is a Part 11 electronic signature (VSR-001 F-3): it re-verifies
   the signer and runs the approval on the request-owned connection
   (req.dbClient, since fa39bd5d8). These stand in for the credential check, the signer's org
   role and the two in-transaction ledger/signature writes, so the approve
   cases below exercise the route's state transition itself. The signature
   semantics (refusals, digest binding, rollback) are pinned in
   server/routes/__tests__/qms-document-approval-signature.test.ts. */
const S = vi.hoisted(() => ({
  txQuery: vi.fn(),
  verify: vi.fn(),
  role: vi.fn(),
  recordGoverned: vi.fn(),
  persistSignature: vi.fn(),
}));

// The QMS write routes are editor-gated (6582e3a3e). The gate has its own tests;
// this suite is about the routes' validation and responses, so the harness grants it.
vi.mock('../server/middleware/orgMembership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/middleware/orgMembership')>()),
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../server/db', () => ({
  pool: {
    query: (...args: unknown[]) => queryFn(...args),
    connect: async () => ({ query: (...args: unknown[]) => S.txQuery(...args), release: () => undefined }),
  },
  getPool: () => ({ query: (...args: unknown[]) => queryFn(...args) }),
  db: {},
}));
// The signing ceremony runs for real; only its wiring is an account whose
// password verifies and which has no second factor enrolled.
vi.mock('../server/services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async () => S.verify(),
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));
vi.mock('../server/services/part11/resolve-signer-role', () => ({
  resolveSignerOrgRole: (...args: unknown[]) => S.role(...args),
}));
vi.mock('../server/routes/c2c/actions', () => ({
  recordGovernedAction: (...args: unknown[]) => S.recordGoverned(...args),
}));
vi.mock('../server/services/part11/signature-persistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../server/services/part11/signature-persistence')>();
  return { ...real, persistGovernedActionSignature: (...args: unknown[]) => S.persistSignature(...args) };
});

vi.mock('../server/services/c2c/document-alias-map', () => ({ recordDocumentAlias: async () => ({ recorded: true }) }));
vi.mock('../server/services/authoring/authoring-evidence', () => ({ createRevision: async () => 'revision', writeAuthoringAuditTrail: async () => undefined }));
vi.mock('../server/services/authoring/authoring-program-access', () => ({ authorizeAuthoringProgram: async () => ({ principal: { id: '7', email: null, roles: ['ADMIN'] } }), AuthoringProgramAccessError: class extends Error {} }));
vi.mock('../server/services/authoring/authoring-permissions', async (original) => ({ ...await original<typeof import('../server/services/authoring/authoring-permissions')>(), grantAuthoringPermission: async () => undefined }));
import qmsRouter from '../server/routes/mdx-qms';
import labelingRouter from '../server/routes/mdx-labeling';
import searchRouter from '../server/routes/mdx-search';
import analyticsRouter from '../server/routes/mdx-analytics';

function makeApp(opts: { withAuth?: boolean; requestDb?: boolean; signingTx?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      (req as any).user = { id: 777, organizationId: 99 };
      // The admitted request owns one query connection. Its existing SQL
      // scripts distinguish ordinary reads from statements after BEGIN;
      // constructors and approval no longer acquire a second global client.
      let inTransaction = false;
      (req as unknown as { dbClient: RequestSqlClient }).dbClient = { query: async (sql, params) => {
        if (/^BEGIN/.test(sql)) inTransaction = true;
        const result = await (inTransaction ? S.txQuery : queryFn)(sql, params);
        if (/^(COMMIT|ROLLBACK)/.test(sql)) inTransaction = false;
        return result;
      } };
      next();
    });
  }
  app.use('/api/mdx', qmsRouter);
  app.use('/api/mdx', labelingRouter);
  app.use('/api/mdx', searchRouter);
  app.use('/api/mdx', analyticsRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
  // Unscripted transactions (e.g. the tamper-proof audit writer behind other
  // routes) fail loudly rather than fake-succeed against an empty stub.
  S.txQuery.mockReset().mockRejectedValue(new Error('no transaction scripted for this test'));
  S.verify.mockReset().mockResolvedValue(true);
  S.role.mockReset().mockResolvedValue('admin');
  S.recordGoverned.mockReset().mockResolvedValue({ actionId: 'act_1', auditId: 'aud-1', sha256Chain: 'chain-1' });
  S.persistSignature.mockReset().mockResolvedValue({ id: 501, signedAt: new Date('2026-05-19T10:00:00.000Z') });
});

/* The signature components the approve route now requires (password
   re-authentication, meaning 'APPROVED', reason for change). An empty body is
   refused 400 ESIGNATURE_COMPONENT_MISSING — pinned in the signature suite. */
const SIGNED_APPROVAL = {
  password: 'correct horse',
  meaning: 'APPROVED',
  reason: 'Reviewed against QMSR 820.40; approved for release.',
};

/** The approval transaction: the FOR UPDATE read sees `current`; the UPDATE
 *  flips it to effective only when it was in_review (the route's WHERE; a
 *  draft is sent for review first — QA walk 2026-10-08, J8). */
function scriptApprovalTx(current: Record<string, unknown> | null) {
  S.txQuery.mockImplementation(async (sql: unknown) => {
    const text = String(sql).trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text)) return { rows: [] };
    // The filing-divergence check (filingAgreesWithEditing): the governed store
    // is provisioned; the authoring_documents read below carries no
    // c2c_document_id, so the document is unbound and there is nothing to compare.
    if (text.includes("to_regclass('public.c2c_document_sections')")) return { rows: [{ ok: true }] };
    if (text.includes('FROM authoring_documents')) return { rows: [{ id: '00000000-0000-4000-8000-000000000011', title: 'CAPA', client_program_id: '00000000-0000-4000-8000-000000000012' }] };
    if (text.includes('FROM authoring_sections')) return { rows: [{ id: 'section', code: 'qms-purpose', title: 'Purpose', content: 'Correct nonconforming activities.', order_index: 1 }] };
    if (text.startsWith('INSERT INTO qms_document_versions') || text.startsWith('UPDATE authoring_documents')) return { rows: [] };
    if (text.includes('FOR UPDATE')) return { rows: current ? [current] : [] };
    if (text.startsWith('UPDATE qms_documents')) {
      const approvable = current && String(current.status) === 'in_review';
      return { rows: approvable ? [{ ...current, status: 'effective', effective_date: '2026-05-19' }] : [] };
    }
    throw new Error(`unexpected transaction query: ${text.slice(0, 60)}`);
  });
}

const QMS_DOC = {
  id: 1, organization_id: 99, doc_number: 'SOP-001', title: 'CAPA', doc_type: 'sop',
  category: null, version: '1.0', status: 'draft', effective_date: null, next_review_date: null,
  author_id: 555, approver_id: null, approved_at: null, superseded_by_id: null, artifact_id: null,
  metadata: {}, authoring_document_id: '00000000-0000-4000-8000-000000000011',
};
function scriptQmsCreate(duplicate = false) {
  S.txQuery.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (/INSERT INTO qms_documents/.test(sql)) {
      if (duplicate) throw Object.assign(new Error('duplicate'), { code: '23505' });
      return { rows: [{ ...QMS_DOC, status: 'draft', authoring_document_id: args[7] }] };
    }
    if (/INSERT INTO authoring_documents/.test(sql)) return { rows: [{ id: args[0] }] };
    // The seed requires the insert to echo the exact id it generated ($1).
    if (/INSERT INTO authoring_sections/.test(sql)) return { rows: [{ id: args[0], code: args[2], content: args[4] }] };
    return { rows: [] };
  });
}


/* ─── Auth gate ──────────────────────────────────────────────── */

describe('auth gate', () => {
  it.each([
    ['GET', '/api/mdx/qms/documents'],
    ['POST', '/api/mdx/qms/documents'],
    ['GET', '/api/mdx/qms/suppliers'],
    ['GET', '/api/mdx/labeling'],
    ['POST', '/api/mdx/labeling'],
    ['GET', '/api/mdx/search?q=foo'],
    ['GET', '/api/mdx/analytics/portfolio'],
  ])('%s %s returns 403 without org context', async (method, url) => {
    const req = request(makeApp({ withAuth: false }));
    const res = await (method === 'GET' ? req.get(url) : req.post(url).send({}));
    expect(res.status).toBe(403);
  });
});

/* ─── QMS ────────────────────────────────────────────────────── */

describe('QMS routes', () => {
  it('POST document rejects unknown doc_type', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-001', title: 'foo', docType: 'wat' });
    expect(res.status).toBe(400);
  });

  it('POST document 201 on valid', async () => {
    scriptQmsCreate();
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-001', title: 'CAPA', docType: 'sop', programId: '00000000-0000-4000-8000-000000000012', reason: 'Create controlled procedure' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'draft', doc_number: 'SOP-001' });
    expect(res.body.data.authoring_document_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST document 409 on duplicate docNumber', async () => {
    scriptQmsCreate(true);
    const res = await request(makeApp())
      .post('/api/mdx/qms/documents')
      .send({ docNumber: 'SOP-001', title: 'CAPA', docType: 'sop', programId: '00000000-0000-4000-8000-000000000012', reason: 'Create controlled procedure' });
    expect(res.status).toBe(409);
    expect(S.txQuery.mock.calls.some(([sql]) => /INSERT INTO qms_documents/.test(String(sql)))).toBe(true);
    expect(S.txQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toContain('ROLLBACK');
  });

  /* Updated 2026-09-23: approve became a Part 11 e-signature (VSR-001 F-3,
     OQ-QMS-06) and refuses an empty body with 400. These two cases used to
     send `{}` and mock one pool.query; they now send the signature the route
     legitimately requires and script its transaction, and still assert the
     same two transitions. */
  it('approve flips in_review → effective', async () => {
    scriptApprovalTx({ ...QMS_DOC, status: 'in_review' });
    const res = await request(makeApp({ withAuth: true, signingTx: true }))
      .post('/api/mdx/qms/documents/1/approve')
      .send(SIGNED_APPROVAL);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('effective');
    expect(S.txQuery.mock.calls.some(([sql]) => String(sql).includes("to_regclass('public.c2c_document_sections')"))).toBe(true);
    expect(S.txQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0])).toContain('COMMIT');
  });

  it('approve 409 when not in_review', async () => {
    scriptApprovalTx({ ...QMS_DOC, status: 'retired' });
    const res = await request(makeApp({ withAuth: true, signingTx: true }))
      .post('/api/mdx/qms/documents/1/approve')
      .send(SIGNED_APPROVAL);
    expect(res.status).toBe(409);
    expect(S.persistSignature).not.toHaveBeenCalled();
    expect(S.txQuery.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0])).toContain('ROLLBACK');
  });

  it('training-ack requires document in tenant', async () => {
    queryFn.mockImplementation(async (sql: string) => {
      if (/^(BEGIN|ROLLBACK)/.test(sql)) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM organization_users ou')) return { rows: [{
        account_status: 'active', organization_status: 'active', payment_status: 'paid', membership_role: 'member',
      }], rowCount: 1 };
      if (sql.includes('FROM qms_documents')) return { rows: [], rowCount: 0 };
      throw new Error('Unexpected query in foreign-document acknowledgement test');
    });
    S.txQuery.mockImplementation((...args: unknown[]) => queryFn(...args));
    const res = await request(makeApp({ withAuth: true, requestDb: true }))
      .post('/api/mdx/qms/documents/999/training-ack')
      .send({ documentVersion: '1.0', contentDigest: 'a'.repeat(64), understood: true, method: 'attestation' });
    expect(res.status).toBe(404);
    expect(queryFn.mock.calls.find(([sql]) => String(sql).includes('FROM qms_documents'))?.[1]).toEqual([999, 99]);
    expect(queryFn.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(String(sql)))).toBe(false);
  });

  it('supplier criticality required', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/qms/suppliers')
      .send({ supplierName: 'Acme' });
    expect(res.status).toBe(422);
  });

  // A disposition is a signed act (2026-10-29; server/routes/__tests__/qms-signed-decisions.test.ts).
  it('NC disposition without a signature 400, nothing written', async () => {
    const res = await request(makeApp())
      .patch('/api/mdx/qms/nonconforming/1/disposition')
      .send({ disposition: 'rework', dispositionRationale: 'process miss' });
    expect(res.status).toBe(400);
    expect(queryFn.mock.calls.some(([sql]) => /UPDATE qms_nonconforming_products/.test(String(sql)))).toBe(false);
  });
});

/* ─── Labeling ──────────────────────────────────────────────── */

describe('Labeling routes', () => {
  it('POST rejects unknown doc_kind', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/labeling')
      .send({ deviceName: 'CGM v2', docKind: 'flyer' });
    expect(res.status).toBe(422);
  });

  it('POST 201 with default language en', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, device_name: 'CGM v2', doc_kind: 'ifu', language: 'en' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/labeling')
      .send({ deviceName: 'CGM v2', docKind: 'ifu' });
    expect(res.status).toBe(201);
    expect(res.body.data.language).toBe('en');
  });

  it('POST translation 404 when document not in tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/labeling/999/translations')
      .send({ language: 'de-DE' });
    expect(res.status).toBe(404);
  });

  it('POST translation 409 on duplicate language', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // own check
    const err = Object.assign(new Error('duplicate'), { code: '23505' });
    queryFn.mockRejectedValueOnce(err);
    const res = await request(makeApp())
      .post('/api/mdx/labeling/1/translations')
      .send({ language: 'de-DE' });
    expect(res.status).toBe(409);
  });

  it('coverage returns counts', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // tenant gate
      .mockResolvedValueOnce({
        rows: [
          { language: 'de-DE', status: 'approved', back_translation_verified: true },
          { language: 'fr-FR', status: 'pending',  back_translation_verified: false },
        ],
      });
    const res = await request(makeApp()).get('/api/mdx/labeling/1/coverage');
    expect(res.status).toBe(200);
    expect(res.body.data.totalTranslations).toBe(2);
    expect(res.body.data.approved).toBe(1);
    expect(res.body.data.backTranslationVerified).toBe(1);
  });

  it('add symbol requires symbol_code', async () => {
    queryFn.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = await request(makeApp())
      .post('/api/mdx/labeling/1/symbols')
      .send({ symbolName: 'Caution' });
    expect(res.status).toBe(422);
  });
});

/* ─── Global search ─────────────────────────────────────────── */

describe('Global search', () => {
  it('rejects q shorter than 2 chars', async () => {
    const res = await request(makeApp()).get('/api/mdx/search?q=a');
    expect(res.status).toBe(422);
  });

  it('returns grouped envelope', async () => {
    queryFn.mockResolvedValue({ rows: [{ id: '1', name: 'BX-204', code: 'BX', status: 'active', description: 'CGM' }] });
    const res = await request(makeApp()).get('/api/mdx/search?q=BX&type=program');
    expect(res.status).toBe(200);
    expect(res.body.meta.query).toBe('BX');
    expect(res.body.data.program).toHaveLength(1);
  });

  it('survives missing optional tables (42P01)', async () => {
    const err = Object.assign(new Error('missing'), { code: '42P01' });
    queryFn.mockRejectedValue(err);
    const res = await request(makeApp()).get('/api/mdx/search?q=test');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(0);
  });
});

/* ─── Analytics ─────────────────────────────────────────────── */

describe('Analytics routes', () => {
  it('portfolio returns programs + byPathway + submissions', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ total: 6, active: 4, blocked: 1, complete: 1 }] })
      .mockResolvedValueOnce({ rows: [{ regulatory_path: '510k', n: 3 }, { regulatory_path: 'pma', n: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 12, received: 8, in_review: 3 }] });
    const res = await request(makeApp()).get('/api/mdx/analytics/portfolio');
    expect(res.status).toBe(200);
    expect(res.body.data.programs.total).toBe(6);
    expect(res.body.data.byPathway).toHaveLength(2);
    expect(res.body.data.submissions.received).toBe(8);
  });

  it('submissions cycle-times converts seconds to hours', async () => {
    queryFn
      .mockResolvedValueOnce({
        rows: [{ region: 'fda', total: 5, rejected: 1, received: 4, avg_to_ack_seconds: 7200 }],
      })
      .mockResolvedValueOnce({ rows: [{ error_class: 'gateway', n: 1 }] });
    const res = await request(makeApp()).get('/api/mdx/analytics/submissions');
    expect(res.status).toBe(200);
    expect(res.body.data.byRegion[0].avgToAckHours).toBe(2);
  });

  it('clinical roll-up reports unavailable schema rather than no clinical activity', async () => {
    const err = Object.assign(new Error('missing'), { code: '42P01' });
    queryFn.mockRejectedValue(err);
    const res = await request(makeApp()).get('/api/mdx/analytics/clinical');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ANALYTICS_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
  });

  it('blockers returns 3 sub-aggregates', async () => {
    queryFn
      .mockResolvedValueOnce({ rows: [{ category: 'engineering', open: 2, closed: 5 }] })
      .mockResolvedValueOnce({ rows: [{ validator: 'fda_evalidator', severity: 'error', n: 1, resolved: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 8, high_residual: 1, accepted: 7 }] });
    const res = await request(makeApp()).get('/api/mdx/analytics/blockers');
    expect(res.status).toBe(200);
    expect(res.body.data.risk.total).toBe(8);
  });
});
