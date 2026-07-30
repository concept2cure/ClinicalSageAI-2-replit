/**
 * /api/esignature/sign — route unit tests.
 *
 * The document e-signature endpoint had ZERO coverage, including its most
 * safety-critical property: 21 CFR Part 11 §11.10(e) — a signing action whose
 * audit-trail write fails must NOT be reported as signed. If auditService
 * throws AFTER the electronic_signatures row is inserted, the request must
 * fail (500 ESIGNATURE_AUDIT_FAILED), never return 201 — no signature without
 * a durable audit record.
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

const hoisted = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  isMfaEnabled: vi.fn(),
  verifyMfaToken: vi.fn(),
  auditLogAction: vi.fn(),
  isSigningAuthorized: vi.fn(),
  buildVersionBindingDigest: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => hoisted.poolQuery(...a) } }));
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => hoisted.poolQuery(...a) } }));
vi.mock('../../services/mfaService.js', () => ({
  isMfaEnabled: (...a: unknown[]) => hoisted.isMfaEnabled(...a),
  verifyToken: (...a: unknown[]) => hoisted.verifyMfaToken(...a),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => hoisted.auditLogAction(...a) },
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
    if (/SELECT name, email FROM users/i.test(sql)) return { rows: [{ name: 'A Signer', email: 's@x.test' }] };
    if (/FROM document_versions/i.test(sql)) {
      return { rows: [{ document_id: 10, version_number: '1', content: 'body' }] };
    }
    if (/INSERT INTO electronic_signatures/i.test(sql)) {
      return { rows: [{ id: 42, signed_at: new Date('2026-07-30T00:00:00Z') }] };
    }
    return { rows: [] };
  });
}

beforeEach(async () => {
  if (!PW_HASH) PW_HASH = await bcrypt.hash(PASSWORD, 4);
  vi.clearAllMocks();
  hoisted.isSigningAuthorized.mockReturnValue(true);
  hoisted.isMfaEnabled.mockResolvedValue(false);
  hoisted.buildVersionBindingDigest.mockReturnValue('bound-digest');
  hoisted.auditLogAction.mockResolvedValue(undefined);
  wireHappyPool();
});

describe('POST /api/esignature/sign — §11.10(e) audit-trail invariant', () => {
  it('CRITICAL: aborts with 500 ESIGNATURE_AUDIT_FAILED when the audit write throws', async () => {
    hoisted.auditLogAction.mockRejectedValue(new Error('audit sink down'));

    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ESIGNATURE_AUDIT_FAILED');
    // The signature row WAS inserted (the invariant is that we don't REPORT
    // success, not that we never inserted) — the insert ran before the audit.
    expect(hoisted.poolQuery.mock.calls.some(c => /INSERT INTO electronic_signatures/i.test(c[0]))).toBe(true);
  });

  it('signs successfully (201) when password verifies and the audit write succeeds', async () => {
    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());
    expect(res.status).toBe(201);
    expect(res.body.signatureId).toBe(42);
    expect(res.body.signatureHash).toEqual(expect.any(String));
    expect(hoisted.auditLogAction).toHaveBeenCalledTimes(1);
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
    // No audit row, no signature.
    expect(hoisted.auditLogAction).not.toHaveBeenCalled();
  });

  it('fails closed (400) requiring mfaToken when MFA is enabled but none supplied', async () => {
    hoisted.isMfaEnabled.mockResolvedValue(true);
    const res = await request(makeApp()).post('/api/esignature/sign').send(signBody());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mfaToken/i);
  });
});
