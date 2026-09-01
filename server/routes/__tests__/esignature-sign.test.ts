/**
 * /api/esignature/sign — route unit tests.
 *
 * The document e-signature endpoint had ZERO coverage, including its most
 * safety-critical property: 21 CFR Part 11 §11.10(e) — a signing action whose
 * audit-trail write fails must NOT be reported as signed.
 *
 * ── The §11.10(e) invariant asserted here got STRONGER ─────────────────────
 * This file used to assert the weaker of the two possible guarantees:
 *
 *   "The signature row WAS inserted (the invariant is that we don't REPORT
 *    success, not that we never inserted) — the insert ran before the audit."
 *
 * That was an accurate description of the code, but it is not what §11.10(e)
 * requires, and it was not what the route's own comment claimed ("no signature
 * without a corresponding, durable audit-trail entry"). Worse, the guarantee it
 * did assert was itself unreachable in production: `auditService.logAction`
 * catches its own persistence errors and resolves normally, so a real audit-sink
 * outage produced 201, not 500. Only a mock that rejects — as the test below
 * does — could ever make the old assertion fire.
 *
 * The route now inserts the signature and writes its audit row in ONE
 * transaction, so the guarantee is the strong one: a failed audit write rolls
 * the signature back and it never exists. The CRITICAL test below therefore now
 * asserts ROLLBACK-and-no-COMMIT rather than "inserted but not reported".
 *
 * Also covers the guards added in the release-gate integrity phase:
 *   - the signatureType allowlist (reserves 'submission-release');
 *   - §11.10(g) signing-authority (role gate);
 *   - §11.200 password re-verification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

const hoisted = vi.hoisted(() => {
  const poolQuery = vi.fn();
  const clientQuery = vi.fn();
  const clientRelease = vi.fn();
  return {
    poolQuery,
    clientQuery,
    clientRelease,
    isMfaEnabled: vi.fn(),
    verifyMfaToken: vi.fn(),
    writeChainedAuditRow: vi.fn(),
    isSigningAuthorized: vi.fn(),
    buildVersionBindingDigest: vi.fn(),
    // The sign route checks out a dedicated client for the signature+audit
    // transaction; the pre-flight reads (password hash, signer identity,
    // version content) still run on the pool. Built here rather than as a
    // top-level const because vi.mock factories hoist above those.
    makePool: () => ({
      query: (...a: unknown[]) => poolQuery(...a),
      connect: async () => ({
        query: (...a: unknown[]) => clientQuery(...a),
        release: (...a: unknown[]) => clientRelease(...a),
      }),
    }),
  };
});

vi.mock('../../db.js', () => ({ pool: hoisted.makePool() }));
vi.mock('../../db', () => ({ pool: hoisted.makePool() }));
vi.mock('../../services/mfaService.js', () => ({
  isMfaEnabled: (...a: unknown[]) => hoisted.isMfaEnabled(...a),
  verifyToken: (...a: unknown[]) => hoisted.verifyMfaToken(...a),
}));
vi.mock('../../services/auditService', () => ({
  writeChainedAuditRow: (...a: unknown[]) => hoisted.writeChainedAuditRow(...a),
}));
vi.mock('../../services/part11/version-binding.js', () => ({
  buildVersionBindingDigest: (...a: unknown[]) => hoisted.buildVersionBindingDigest(...a),
}));
vi.mock('../../services/part11/signing-authority', () => ({
  isSigningAuthorized: (...a: unknown[]) => hoisted.isSigningAuthorized(...a),
}));

import esignatureRouter from '../esignature';

const PASSWORD = 'Sign-Me-9';
let PW_HASH = '';

function makeApp(over: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).userId = 7;
    (req as any).userRole = 'approver';
    (req as any).user = { id: 7, name: 'A Signer', email: 's@x.test', organizationId: 3, ...over };
    next();
  });
  app.use('/api/esignature', esignatureRouter);
  return app;
}

const signBody = (over: Record<string, unknown> = {}) => ({
  documentId: 10,
  versionId: 1,
  signaturePurpose: 'approval',
  signatureMeaning: 'I approve',
  action: 'approved',
  password: PASSWORD,
  ...over,
});

// pool.query router: match by SQL so ordering is robust.
function wireHappyPool() {
  hoisted.poolQuery.mockImplementation(async (sql: string) => {
    if (/SELECT password_hash FROM users/i.test(sql)) return { rows: [{ password_hash: PW_HASH }] };
    // The §11.50 signer lookup is org-scoped (users JOIN organization_users) —
    // it used to be a bare primary-key read of `users`, which resolved a name
    // for a user id belonging to any tenant.
    if (/FROM users u\s+JOIN organization_users/i.test(sql)) return { rows: [{ name: 'A Signer', email: 's@x.test', title: 'Study Director' }] };
    if (/FROM document_versions/i.test(sql)) {
      return { rows: [{ document_id: 10, version_number: '1', content: 'body' }] };
    }
    return { rows: [] };
  });
}

// The transactional client: BEGIN / signature INSERT / COMMIT | ROLLBACK.
function wireHappyClient() {
  hoisted.clientQuery.mockImplementation(async (sql: string) => {
    if (/INSERT INTO electronic_signatures/i.test(sql)) {
      return { rows: [{ id: 42, signed_at: new Date('2026-07-30T00:00:00Z') }] };
    }
    return { rows: [] };
  });
}

const clientSqls = () => hoisted.clientQuery.mock.calls.map(c => String(c[0]));
const issued = (verb: RegExp) => clientSqls().some(s => verb.test(s));

beforeEach(async () => {
  if (!PW_HASH) PW_HASH = await bcrypt.hash(PASSWORD, 4);
  vi.clearAllMocks();
  hoisted.isSigningAuthorized.mockReturnValue(true);
  hoisted.isMfaEnabled.mockResolvedValue(false);
  hoisted.buildVersionBindingDigest.mockReturnValue('bound-digest');
  hoisted.writeChainedAuditRow.mockResolvedValue(undefined);
  wireHappyPool();
  wireHappyClient();
});

describe('POST /api/esignature/sign — §11.10(e) audit-trail invariant', () => {
  it('CRITICAL: rolls the signature back and 500s when the audit write throws', async () => {
    hoisted.writeChainedAuditRow.mockRejectedValue(new Error('audit sink down'));

    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ESIGNATURE_AUDIT_FAILED');

    // The INSERT was attempted...
    expect(issued(/INSERT INTO electronic_signatures/i)).toBe(true);
    // ...but on a transaction that was ROLLED BACK, never committed, so no
    // signature survives without its audit row. This is the strengthened
    // invariant: previously the row was inserted on an autocommit connection
    // and simply not reported.
    expect(issued(/^\s*ROLLBACK/i)).toBe(true);
    expect(issued(/^\s*COMMIT/i)).toBe(false);
    // The pool must NOT have been used for the signature INSERT — that is what
    // made the old shape non-atomic.
    expect(hoisted.poolQuery.mock.calls.some(c => /INSERT INTO electronic_signatures/i.test(String(c[0])))).toBe(false);
    expect(hoisted.clientRelease).toHaveBeenCalled();
  });

  it('signs successfully (201) when password verifies and the audit write succeeds', async () => {
    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());
    expect(res.status).toBe(201);
    expect(res.body.signatureId).toBe(42);
    expect(res.body.signatureHash).toEqual(expect.any(String));
    expect(hoisted.writeChainedAuditRow).toHaveBeenCalledTimes(1);
    expect(issued(/^\s*BEGIN/i)).toBe(true);
    expect(issued(/^\s*COMMIT/i)).toBe(true);
    expect(hoisted.clientRelease).toHaveBeenCalled();
  });

  it('writes the audit row on the SAME client as the signature (atomicity)', async () => {
    await request(makeApp()).post('/api/esignature/sign').send(signBody());
    // The route must hand the transactional client to the audit writer, not let
    // it open its own connection — otherwise the two are not atomic.
    const auditClient = hoisted.writeChainedAuditRow.mock.calls[0][0] as { query: unknown };
    await (auditClient as any).query('SELECT 1');
    expect(hoisted.clientQuery).toHaveBeenCalledWith('SELECT 1');
  });

  it('§11.50: ignores a client-supplied signerTitle and persists the server-resolved one', async () => {
    const res = await request(makeApp())
      .post('/api/esignature/sign')
      .send(signBody({ signerTitle: 'Chief Medical Officer' })); // a claimed authority the signer does not hold
    expect(res.status).toBe(201);
    const insertCall = hoisted.clientQuery.mock.calls.find((c) =>
      /INSERT INTO electronic_signatures/i.test(String(c[0])),
    );
    expect(insertCall).toBeDefined();
    const params = JSON.stringify(insertCall![1] ?? []);
    // The server-resolved title (from the users row) is persisted...
    expect(params).toContain('Study Director');
    // ...and the client-asserted one is NOT.
    expect(params).not.toContain('Chief Medical Officer');
  });
});

describe('POST /api/esignature/sign — input + authority guards', () => {
  it('rejects a reserved/unknown signatureType (allowlist)', async () => {
    const reserved = await request(makeApp()).post('/api/esignature/sign')
      .send(signBody({ signatureType: 'submission-release' }));
    expect(reserved.status).toBe(400);
    expect(reserved.body.code).toBe('ESIGNATURE_TYPE_INVALID');

    const unknown = await request(makeApp()).post('/api/esignature/sign')
      .send(signBody({ signatureType: 'rubber-stamp' }));
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('ESIGNATURE_TYPE_INVALID');
    // Never reached the DB.
    expect(hoisted.poolQuery).not.toHaveBeenCalled();
  });

  it('accepts an allowed signatureType (witness)', async () => {
    const res = await request(makeApp()).post('/api/esignature/sign')
      .send(signBody({ signatureType: 'witness' }));
    expect(res.status).toBe(201);
  });

  it('403s when the signer role lacks signing authority (§11.10(g))', async () => {
    hoisted.isSigningAuthorized.mockReturnValue(false);
    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_NO_AUTHORITY');
    expect(hoisted.poolQuery).not.toHaveBeenCalled();
  });

  it('401s when the password fails re-verification (§11.200)', async () => {
    const res = await request(makeApp()).post('/api/esignature/sign')
      .send(signBody({ password: 'wrong-password' }));
    expect(res.status).toBe(401);
    // No audit row, no signature — and no transaction was even opened.
    expect(hoisted.writeChainedAuditRow).not.toHaveBeenCalled();
    expect(hoisted.clientQuery).not.toHaveBeenCalled();
  });

  it('fails closed (400) requiring mfaToken when MFA is enabled but none supplied', async () => {
    hoisted.isMfaEnabled.mockResolvedValue(true);
    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mfaToken/i);
  });
});

describe('POST /api/esignature/sign — §11.50 signer attribution', () => {
  it('REGRESSION: refuses to sign when the signer is not attributable in the org', async () => {
    // The route used to seed signer_name/signer_email from client-controlled
    // session fields and fill gaps from an UNSCOPED read of `users`, checking
    // only that an email came out. A signer with no membership in the signing
    // org could therefore be written onto the signature as the printed name.
    // Refusing is the only honest answer: §11.50 asks for the name of the
    // signer, and this org cannot say who that is.
    wireHappyPool();
    hoisted.poolQuery.mockImplementation(async (sql: string) => {
      if (/SELECT password_hash FROM users/i.test(sql)) return { rows: [{ password_hash: PW_HASH }] };
      if (/FROM users u\s+JOIN organization_users/i.test(sql)) return { rows: [] }; // not a member
      if (/FROM document_versions/i.test(sql)) {
        return { rows: [{ document_id: 10, version_number: '1', content: 'body' }] };
      }
      return { rows: [] };
    });
    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ESIGNATURE_SIGNER_NOT_ATTRIBUTABLE');
  });
});
