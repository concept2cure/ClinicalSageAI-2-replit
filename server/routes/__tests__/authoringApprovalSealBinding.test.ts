/**
 * An Approval e-signature covers the frozen snapshot the approval creates, and
 * the document records when it was approved and frozen (21 CFR 11.70;
 * QA 2026-10-08, browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
 *
 * POST /docs/:docId/e-sign with meaning APPROVER approves the document and
 * auto-freezes it in one transaction. The walk found the signature written
 * FIRST, bound to whatever snapshot was in force before the approval — for a
 * document approved without a separate freeze, none — and the 'approved'
 * snapshot written after it. So the Signatures rail, the DOCX and the PDF said
 * "Covers: no frozen snapshot was in force when this was signed" about the very
 * approval that froze the document; and authoring_documents.approved_at and
 * frozen_at stayed NULL on an APPROVED document, so the document journey never
 * showed the approval.
 *
 * The freeze route already binds its signature to the snapshot it writes
 * (DP-35). The approval now does the same: snapshot first, then the signature
 * naming it inside a recomputable digest, then the audit rows — one transaction.
 */
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  return {
    poolQuery: vi.fn(),
    clientQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: () => undefined })),
    chainedAudit: vi.fn(async (..._a: unknown[]) => {}),
    existingApproved: null as null | { content_hash: string },
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
  getPool: () => ({ query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() }),
  query: (...a: unknown[]) => h.poolQuery(...a),
  db: {},
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
  writeChainedAuditRow: (...a: unknown[]) => h.chainedAudit(...a),
}));
vi.mock('../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: vi.fn(async () => 'approver'),
}));
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string) => plain === 'right-password',
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-approval-seal-binding';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: '7', id: '7', sub: '7', email: 'approver@test.co', organizationId: '3',
    role: 'approver', roles: ['approver'], type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const clientCalls = () => h.clientQuery.mock.calls.map((c) => ({ sql: String(c[0]), params: (c[1] as unknown[]) ?? [] }));
const find = (re: RegExp) => clientCalls().find((c) => re.test(c.sql));
const indexOf = (re: RegExp) => clientCalls().findIndex((c) => re.test(c.sql));

/** The router's own digest formula (computeSignatureDigest), recomputed from what was stored. */
function digest(signerEmail: string, meaning: string, contentHash: string, coveredContentHash: string | null) {
  return crypto
    .createHash('sha256')
    .update(['authoring-sig-v1', signerEmail, meaning, contentHash, coveredContentHash ?? ''].join('|'))
    .digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.existingApproved = null;
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: () => undefined }));
  h.clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = String(sql);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(s)) return {};
    if (/INSERT INTO frozen_documents/i.test(s)) {
      // ON CONFLICT DO NOTHING: a conflict returns no row.
      return h.existingApproved
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [{ version: 'approved', content_hash: (params ?? [])[3] }] };
    }
    if (/FROM frozen_documents/i.test(s)) {
      return h.existingApproved ? { rowCount: 1, rows: [{ version: 'approved', ...h.existingApproved }] } : { rowCount: 0, rows: [] };
    }
    if (/SELECT \* FROM authoring_documents/i.test(s)) {
      return { rowCount: 1, rows: [{ id: 'D1', title: 'Doc', status: 'APPROVED', tenant_id: 3 }] };
    }
    if (/FROM authoring_sections/i.test(s)) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', code: '2.5.1', title: 'Rationale', content: '<p>body</p>', order_index: 100 }] };
    }
    return { rowCount: 1, rows: [{}] };
  });
  h.poolQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: 7 }] };
    if (/SELECT 1 FROM authoring_documents/i.test(s)) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Ava Approver' }] };
    if (/SELECT code, content FROM authoring_sections/i.test(s)) return { rowCount: 1, rows: [{ code: '2.5.1', content: '<p>body</p>' }] };
    // No snapshot was in force before the approval (the walk's document).
    if (/FROM frozen_documents/i.test(s)) return { rowCount: 0, rows: [] };
    return { rowCount: 0, rows: [] };
  });
});

async function approve() {
  return request(makeApp())
    .post('/api/authoring/docs/D1/e-sign')
    .set('Authorization', await bearer())
    .send({ password: 'right-password', meaning: 'APPROVER', intent: 'I approve this document' });
}

describe('POST /docs/:docId/e-sign APPROVER', () => {
  it('binds the approval signature to the snapshot the approval writes', async () => {
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const snapshot = find(/INSERT INTO frozen_documents/i);
    const signature = find(/INSERT INTO authoring_signatures/i);
    expect(snapshot, 'the approval wrote no snapshot').toBeDefined();
    expect(signature, 'no signature was written').toBeDefined();
    const snapshotHash = String(snapshot!.params[3]);
    expect(snapshot!.params[1]).toBe('approved');

    // covered_freeze_version, covered_content_hash: the snapshot just written.
    expect(signature!.params[9], 'the approval says it covers no frozen snapshot').toBe('approved');
    expect(signature!.params[10]).toBe(snapshotHash);
    // The digest binds that snapshot, and an auditor can recompute it.
    const contentHash = String(signature!.params[7]);
    expect(signature!.params[8]).toBe(digest('approver@test.co', 'APPROVER', contentHash, snapshotHash));
    // The snapshot exists before the signature that names it, in one transaction.
    expect(indexOf(/INSERT INTO frozen_documents/i)).toBeLessThan(indexOf(/INSERT INTO authoring_signatures/i));
    expect(res.body.covers).toEqual({ version: 'approved', contentHash: snapshotHash });
  });

  it('records approved_at and frozen_at on the document it approves', async () => {
    await approve();
    const flip = find(/UPDATE authoring_documents[\s\S]*APPROVED/i) ?? find(/UPDATE authoring_documents/i);
    expect(flip, 'no status flip').toBeDefined();
    expect(flip!.sql).toMatch(/approved_at\s*=\s*COALESCE\(approved_at,\s*NOW\(\)\)/i);
    expect(flip!.sql).toMatch(/frozen_at\s*=\s*COALESCE\(frozen_at,\s*NOW\(\)\)/i);
  });

  it('a second approval of an already approved document covers the approved snapshot that exists', async () => {
    h.existingApproved = { content_hash: 'f'.repeat(64) };
    const res = await approve();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const signature = find(/INSERT INTO authoring_signatures/i);
    expect(signature!.params[9]).toBe('approved');
    expect(signature!.params[10]).toBe('f'.repeat(64));
  });

  it('a freeze records frozen_at on the document it freezes', async () => {
    h.poolQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: 7 }] };
      if (/FROM authoring_documents WHERE id = \$1 AND tenant_id = \$2/i.test(s)) {
        return { rowCount: 1, rows: [{ id: 'D1', title: 'Doc', status: 'draft', version: '1.0' }] };
      }
      if (/FROM authoring_sections/i.test(s)) return { rowCount: 1, rows: [{ id: 'S1', code: '2.5.1', content: '<p>body</p>' }] };
      if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Ava Approver' }] };
      return { rowCount: 0, rows: [] };
    });
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/freeze')
      .set('Authorization', await bearer())
      .send({ password: 'right-password', meaning: 'AUTHOR', reason: 'Sealing the reviewed draft' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const flip = find(/UPDATE authoring_documents/i);
    expect(flip!.params[0]).toBe('FROZEN');
    expect(flip!.sql).toMatch(/frozen_at\s*=\s*COALESCE\(frozen_at,\s*NOW\(\)\)/i);
  });

  it('a REVIEWER signature still covers only the snapshot in force, and approves nothing', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/e-sign')
      .set('Authorization', await bearer())
      .send({ password: 'right-password', meaning: 'REVIEWER', intent: 'I reviewed this document' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(find(/INSERT INTO frozen_documents/i)).toBeUndefined();
    expect(find(/UPDATE authoring_documents/i)).toBeUndefined();
    const signature = find(/INSERT INTO authoring_signatures/i);
    expect(signature!.params[9]).toBeNull();
    expect(signature!.params[10]).toBeNull();
  });
});
