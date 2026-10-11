/**
 * Authoring: the governed document delete (DP-33, plan P1-30), the signed
 * freeze (DP-35, plan P1-32) and the two upload sites (IAM-14, plan P1-5).
 *
 * DP-33. DELETE /api/authoring/docs/:docId was authorised by a static
 * `x-admin-token` header compared with process.env.ADMIN_TOKEN — not by the
 * session — read and deleted the row with no tenant predicate, and wrote an
 * audit row with no actor through the best-effort logger after the fact. The
 * delete is now the organisation's own document only (404 otherwise), an
 * owner, admin or manager of that organisation, a stated reason, and the
 * chained audit row naming the actor on the same transaction as the DELETE.
 *
 * DP-35. Freeze made a document FROZEN — which the eCTD leaf resolver and the
 * IND checklist count as finalized — with no signing authority and no
 * re-authentication. Freeze is now the signing ceremony: §11.10(g) authority,
 * a §11.50 meaning, the §11.200 re-verification, and the authoring_signatures
 * row bound to the snapshot it seals, in the freeze's own transaction.
 *
 * IAM-14. The figure upload checked the bytes against the declared type and
 * scanned fail-OPEN (a missing scanner admitted the file in production); the
 * Word import checked nothing. Both now run assertUploadSafe.
 *
 * The router carries its own JWT gate, so a real HS256 token is signed rather
 * than stubbing auth (as authoring-atomic-mutations.test.ts does).
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const clientRelease = vi.fn();
  return {
    poolQuery: vi.fn(),
    clientQuery,
    clientRelease,
    connect: vi.fn(async () => ({ query: clientQuery, release: clientRelease })),
    auditLogAction: vi.fn(async (..._a: unknown[]) => undefined),
    chainedAudit: vi.fn(async (..._a: unknown[]) => {}),
    /** The caller's organization_users role, per test. */
    orgRole: 'approver' as string | null,
    saveDerivedUpload: vi.fn(async (..._a: unknown[]) => ({ fileId: 'file_1_abc' })),
    importDocx: vi.fn(async (..._a: unknown[]) => ({ sections: [{ title: 'S' }], warnings: [], counts: { sections: 1, tables: 0 } })),
    scanBuffer: vi.fn(async (..._a: unknown[]) => ({ scanned: true, clean: true })),
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
  getPool: () => ({ query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() }),
  query: (...a: unknown[]) => h.poolQuery(...a),
  db: {},
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => h.auditLogAction(...a) },
  writeChainedAuditRow: (...a: unknown[]) => h.chainedAudit(...a),
}));
vi.mock('../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: vi.fn(async () => h.orgRole),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string) => plain === 'signer-password',
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
  GOVERNED_WRITE_ROLES: new Set(['admin', 'manager', 'member', 'owner', 'super_admin']),
}));
vi.mock('../../services/ana/uploaded-file-access.js', () => ({
  saveDerivedUpload: (...a: unknown[]) => h.saveDerivedUpload(...a),
  loadUploadedFile: vi.fn(),
}));
vi.mock('../../import/docx-to-authoring.js', () => ({
  importDocx: (...a: unknown[]) => h.importDocx(...a),
}));
vi.mock('../../utils/virusScan', () => ({
  scanBuffer: (...a: unknown[]) => h.scanBuffer(...a),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-governed-delete';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

const PASSWORD = 'signer-password';
const DOC = '3f6c1b52-4a8e-4d55-9a0b-1d2e3f405162';
const REASON = 'Removing the UAT fixture after the run.';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: '41', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

const sql = (calls: unknown[][]) => calls.map((c) => String(c[0]).trim());
const clientSql = () => sql(h.clientQuery.mock.calls);
const allSql = () => [...sql(h.poolQuery.mock.calls), ...clientSql()];
const idx = (re: RegExp) => clientSql().findIndex((s) => re.test(s));

/** The document row the transaction's FOR UPDATE read returns, per test. */
let docRow: Record<string, unknown> | null = null;
/** Whether the document's sections carry doc_revisions rows, per test. */
let hasHistory = false;
/** Whether authoring_signatures holds a signature over the document, per test. */
let hasSignature = false;

beforeEach(() => {
  vi.clearAllMocks();
  h.orgRole = 'approver';
  docRow = { id: DOC, title: 'UAT doc', product_code: 'UAT-1', status: 'draft', version: '1.0' };
  hasHistory = false;
  hasSignature = false;
  delete process.env.ADMIN_TOKEN;
  h.scanBuffer.mockImplementation(async () => ({ scanned: true, clean: true }));
  h.clientQuery.mockImplementation(async (s: string) => {
    if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(s)) return {};
    if (/FROM authoring_documents[\s\S]*FOR UPDATE/i.test(s)) {
      return docRow ? { rowCount: 1, rows: [docRow] } : { rowCount: 0, rows: [] };
    }
    if (/FROM doc_revisions/i.test(s)) {
      return hasHistory ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] };
    }
    if (/^SELECT[\s\S]*FROM authoring_signatures/i.test(s)) {
      return hasSignature ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] };
    }
    if (/SELECT code, content FROM authoring_sections/i.test(s)) {
      return { rowCount: 1, rows: [{ code: '2.5', content: 'body' }] };
    }
    return { rowCount: 1, rows: [{}] };
  });
  h.poolQuery.mockImplementation(async (s: string) => {
    if (/FROM authoring_documents WHERE id = \$1/i.test(s)) {
      return { rowCount: 1, rows: [{ id: DOC, status: 'draft', version: '1.0', product_code: 'UAT-1' }] };
    }
    if (/FROM authoring_sections WHERE doc_id = \$1/i.test(s)) {
      return { rowCount: 1, rows: [{ id: 'S1', code: '2.5', title: 'T', content: 'body' }] };
    }
    if (/SELECT code, content FROM authoring_sections/i.test(s)) {
      return { rowCount: 1, rows: [{ code: '2.5', content: 'body' }] };
    }
    if (/COUNT\(\*\)::text AS n FROM authoring_comments/i.test(s)) {
      return { rowCount: 1, rows: [{ n: '0' }] };
    }
    return { rowCount: 0, rows: [] };
  });
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
});

const del = async (body: Record<string, unknown> = { reason: REASON }, headers: Record<string, string> = {}) => {
  let r = request(makeApp()).delete(`/api/authoring/docs/${DOC}`).set('Authorization', await bearer());
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  return r.send(body);
};

const deletedAnything = () => allSql().some((s) => /^DELETE FROM authoring_documents/i.test(s));

describe('DP-33 — DELETE /docs/:docId is the governed delete, not an admin-token door', () => {
  it('the static x-admin-token authorises nothing: a member holding it is refused and nothing is deleted', async () => {
    process.env.ADMIN_TOKEN = 'uat-static-secret';
    h.orgRole = 'member';
    const res = await del({ reason: REASON }, { 'x-admin-token': 'uat-static-secret' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTHORING_DELETE_NOT_PERMITTED');
    expect(deletedAnything()).toBe(false);
  });

  it('an organisation manager deletes its own document: tenant-scoped, one transaction, chained row naming the actor', async () => {
    h.orgRole = 'manager';
    const res = await del();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ ok: true, deleted: DOC });

    const begin = idx(/^BEGIN/i);
    const commit = idx(/^COMMIT/i);
    const read = idx(/FROM authoring_documents[\s\S]*FOR UPDATE/i);
    const drop = idx(/^DELETE FROM authoring_documents/i);
    expect(begin).toBe(0);
    expect(read).toBeGreaterThan(begin);
    expect(drop).toBeGreaterThan(read);
    expect(drop).toBeLessThan(commit);
    // The organisation's own row only: both statements carry the tenant predicate.
    expect(clientSql()[read]).toMatch(/tenant_id = \$2/);
    expect(clientSql()[drop]).toMatch(/tenant_id = \$2/);
    expect(h.clientQuery.mock.calls[drop][1]).toEqual([DOC, 7]);
    // Nothing on the pool: the delete and its record commit together.
    expect(sql(h.poolQuery.mock.calls).some((s) => /DELETE FROM authoring_documents/i.test(s))).toBe(false);

    expect(h.chainedAudit).toHaveBeenCalledTimes(1);
    const [executor, row] = h.chainedAudit.mock.calls[0] as [{ query?: unknown }, Record<string, any>];
    expect(executor.query).toBe(h.clientQuery);
    expect(row).toMatchObject({
      tenantId: 7,
      userId: '41',
      action: 'authoring.document.delete',
      resourceType: 'authoring_document',
      resourceId: DOC,
    });
    expect(row.details).toMatchObject({ reason: REASON, actorEmail: 'author@test.co', title: 'UAT doc' });
    expect(row.details.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The actor-less best-effort logger is not how this is recorded.
    expect(h.auditLogAction).not.toHaveBeenCalled();
  });

  it('an approver may delete what a manager may (P-18); a reviewer may not', async () => {
    h.orgRole = 'approver';
    const ok = await del();
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(h.chainedAudit).toHaveBeenCalledTimes(1);
    h.orgRole = 'reviewer';
    const refused = await del();
    expect(refused.status).toBe(403);
  });

  it("a document outside the caller's organisation answers 404 and deletes nothing", async () => {
    h.orgRole = 'admin';
    docRow = null;
    const res = await del();
    expect(res.status).toBe(404);
    expect(deletedAnything()).toBe(false);
    expect(h.chainedAudit).not.toHaveBeenCalled();
  });

  it('a delete with no stated reason is refused before anything is read', async () => {
    h.orgRole = 'owner';
    const res = await del({});
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('reason');
    expect(deletedAnything()).toBe(false);
  });

  it('a sealed (FROZEN) document is not deleted', async () => {
    h.orgRole = 'admin';
    docRow = { ...docRow, status: 'FROZEN' };
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AUTHORING_DOCUMENT_SEALED');
    expect(deletedAnything()).toBe(false);
    expect(h.chainedAudit).not.toHaveBeenCalled();
  });

  it('a document with revision history answers 409 before any DELETE — the ledger is append-only', async () => {
    h.orgRole = 'admin';
    hasHistory = true;
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AUTHORING_DOCUMENT_HAS_HISTORY');
    expect(deletedAnything()).toBe(false);
    expect(h.chainedAudit).not.toHaveBeenCalled();
  });

  it('a draft that carries a signature answers 409 — the signature is never left naming a record that is gone', async () => {
    /* authoring_signatures has no foreign key to authoring_documents, so a
       DELETE would succeed and leave the signature bound to nothing (§11.70).
       An AUTHOR or REVIEWER e-sign does not freeze, so a draft can carry one. */
    h.orgRole = 'admin';
    hasSignature = true;
    const res = await del();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AUTHORING_DOCUMENT_SIGNED');
    expect(deletedAnything()).toBe(false);
    expect(h.chainedAudit).not.toHaveBeenCalled();
  });

  it('the router no longer reads x-admin-token or ADMIN_TOKEN', () => {
    const src = readFileSync(path.resolve(__dirname, '../authoring.router.ts'), 'utf8');
    // Code that reads them, not the comment that records why they went.
    expect(src).not.toMatch(/headers\[\s*['"]x-admin-token['"]\s*\]/i);
    expect(src).not.toMatch(/process\.env\.ADMIN_TOKEN\b/);
  });
});

const freeze = async (body: Record<string, unknown>) =>
  request(makeApp()).post(`/api/authoring/docs/${DOC}/freeze`).set('Authorization', await bearer()).send(body);

const sealedAnything = () =>
  allSql().some((s) => /INSERT INTO frozen_documents|UPDATE authoring_documents SET status/i.test(s));

describe('DP-35 — freeze is the signing ceremony', () => {
  it('a member without signing authority cannot freeze (403) and nothing is sealed', async () => {
    h.orgRole = 'member';
    const res = await freeze({ reason: 'Seal for filing.', meaning: 'AUTHOR', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(sealedAnything()).toBe(false);
  });

  it('a freeze without the password is refused by the ceremony and nothing is sealed', async () => {
    const res = await freeze({ reason: 'Seal for filing.', meaning: 'AUTHOR' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_REQUIRED');
    expect(sealedAnything()).toBe(false);
  });

  it('a wrong password is refused (401) and nothing is sealed', async () => {
    const res = await freeze({ reason: 'Seal for filing.', meaning: 'AUTHOR', password: 'not-it' });
    expect(res.status).toBe(401);
    expect(sealedAnything()).toBe(false);
  });

  it('a freeze without a §11.50 meaning is refused', async () => {
    const res = await freeze({ reason: 'Seal for filing.', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('meaning');
    expect(sealedAnything()).toBe(false);
  });

  it('an approval is not a freeze meaning — approval is E-sign, which approves and freezes in one act', async () => {
    const res = await freeze({ reason: 'Seal for filing.', meaning: 'APPROVER', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('meaning');
    expect(sealedAnything()).toBe(false);
  });

  it('the signed freeze writes the signature bound to the snapshot it seals, in the freeze transaction', async () => {
    const res = await freeze({ reason: 'Seal for filing.', meaning: 'AUTHOR', password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.signatureId).toMatch(/^[0-9a-f-]{36}$/);

    const begin = idx(/^BEGIN/i);
    const commit = idx(/^COMMIT/i);
    const snapshot = idx(/INSERT INTO frozen_documents/i);
    const signature = idx(/INSERT INTO authoring_signatures/i);
    expect(begin).toBe(0);
    expect(snapshot).toBeGreaterThan(begin);
    expect(signature).toBeGreaterThan(snapshot);
    expect(signature).toBeLessThan(commit);

    const params = h.clientQuery.mock.calls[signature][1] as unknown[];
    const cols = clientSql()[signature].match(/\(([^)]*)\)/)![1].split(',').map((c) => c.trim());
    const val = (c: string) => params[cols.indexOf(c)];
    expect(val('id')).toBe(res.body.signatureId);
    expect(val('doc_id')).toBe(DOC);
    expect(val('signer_email')).toBe('author@test.co');
    expect(val('meaning')).toBe('AUTHOR');
    expect(val('reason')).toBe('Seal for filing.');
    expect(val('method')).toBe('password');
    expect(val('covered_freeze_version')).toBe(res.body.version);
    expect(val('covered_content_hash')).toBe(res.body.contentHash);
    expect(String(val('signature_digest'))).toMatch(/^[0-9a-f]{64}$/);

    // The chained ledger row links to the signature (the audit-trail ledger joins on it).
    const chained = h.chainedAudit.mock.calls.find((c) => (c[1] as any)?.action === 'authoring.document.freeze');
    expect(chained?.[0]).toMatchObject({ query: h.clientQuery });
    expect((chained?.[1] as any).details).toMatchObject({ signatureId: res.body.signatureId, meaning: 'AUTHOR' });
  });
});

/** Minimal valid magic numbers. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

describe('IAM-14 — POST /images and POST /import/docx run assertUploadSafe', () => {
  const upload = async (route: string, name: string, type: string, bytes: Buffer) =>
    request(makeApp())
      .post(`/api/authoring/${route}`)
      .set('Authorization', await bearer())
      .attach('file', bytes, { filename: name, contentType: type });

  it('a PNG named and declared as a PNG is stored', async () => {
    const res = await upload('images', 'figure.png', 'image/png', PNG);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(h.saveDerivedUpload).toHaveBeenCalledTimes(1);
  });

  it('a file whose name says GIF but whose bytes and declared type are PNG is refused (the name binds the type)', async () => {
    const res = await upload('images', 'figure.gif', 'image/png', PNG);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_TYPE_MISMATCH');
    expect(h.saveDerivedUpload).not.toHaveBeenCalled();
  });

  it('in production a figure the scanner could not scan is refused (503), not admitted', async () => {
    h.scanBuffer.mockImplementation(async () => ({ scanned: false, clean: true, reason: 'no CLAMAV_HOST' }));
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await upload('images', 'figure.png', 'image/png', PNG);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('FILE_SCAN_UNAVAILABLE');
      expect(h.saveDerivedUpload).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prior;
    }
  });

  it('a .docx whose bytes are not a Word container is refused before it is parsed', async () => {
    const res = await upload(
      'import/docx',
      'notes.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('<html><script>alert(1)</script></html>'),
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
    expect(h.importDocx).not.toHaveBeenCalled();
  });

  it('a Word container that the scanner flags is refused before it is parsed', async () => {
    h.scanBuffer.mockImplementation(async () => ({ scanned: true, clean: false, signature: 'Eicar-Test' }));
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32, 2)]);
    const res = await upload(
      'import/docx',
      'notes.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      zip,
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SCAN_REJECTED');
    expect(h.importDocx).not.toHaveBeenCalled();
  });
});
