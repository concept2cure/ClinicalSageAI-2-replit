/**
 * POST /api/mdx/gateways/transmittals/:id/technical-rejection (2026-10-01,
 * W5/D7, sweep F19) — the HTTP contract of the one act that takes a filed
 * sequence off a package's filed history: the body it takes, the re-auth gate
 * it shares with transmit and rollback, the refusals it maps (code and facts in
 * `details`), and what it hands the service. The auth and role gates are in the
 * router's tables (mdx-submission-gateway-routes.test.ts); the service's rules
 * are pinned in server/services/ectd/__tests__/filed-sequence-rejection.test.ts
 * and through PGlite in tests/submission-ops-package-spine.pglite.e2e.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { queryFn, connectFn, rejectionSpy } = vi.hoisted(() => ({
  queryFn: vi.fn(),
  connectFn: vi.fn(),
  rejectionSpy: vi.fn(),
}));

// The signer is active and not locked out (pinned by tests/db/*.dbtest.ts).
vi.mock('../server/services/account-standing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/account-standing')>()),
  isAccountActive: async () => true,
}));
vi.mock('../server/services/auth-security-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/services/auth-security-service')>()),
  isAccountLocked: async () => ({ locked: false }),
  recordFailedLogin: async () => ({ locked: false, remainingAttempts: 5 }),
}));
vi.mock('../server/db', () => ({
  pool: { query: (...a: unknown[]) => queryFn(...a), connect: (...a: unknown[]) => connectFn(...a) },
  getPool: () => ({ query: (...a: unknown[]) => queryFn(...a), connect: (...a: unknown[]) => connectFn(...a) }),
  db: {},
}));
// The password verifies; no second factor is enrolled, and a presented code verifies.
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn().mockResolvedValue(true) }, compare: vi.fn().mockResolvedValue(true) }));
vi.mock('../server/services/mfaService', () => ({
  verifyToken: vi.fn().mockResolvedValue(true),
  isMfaEnabled: vi.fn().mockResolvedValue(false),
}));
// The service runs for real (its refusals are what the route maps); a case that
// needs a recorded outcome replaces it once.
vi.mock('../server/services/ectd/filed-sequence-rejection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../server/services/ectd/filed-sequence-rejection')>();
  rejectionSpy.mockImplementation(actual.recordFiledSequenceRejection);
  return { ...actual, recordFiledSequenceRejection: rejectionSpy };
});

import gatewayRouter from '../server/routes/mdx-submission-gateway';

const URL = '/api/mdx/gateways/transmittals/7/technical-rejection';
const NOTICE_ID = '5f0c2d7a-0b6f-4d1e-9c39-4f0e9a516f10';
const BODY = {
  reason: 'FDA technical rejection notice: Ack3 failed', meaning: 'responsibility',
  evidenceDocumentId: NOTICE_ID, reauth: { password: 'pw-123456' },
};
const filed = (sequence: string, transmittalId: number) => ({
  sequence, submissionType: 'original', sha256: String(transmittalId).repeat(64), transmittalId,
  filedAt: '2026-09-30T00:00:00Z', leaves: [], state: 'transmitted',
});

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 777, organizationId: 99, role: 'admin' };
    (req as any).userRole = 'admin';
    next();
  });
  a.use('/api/mdx', gatewayRouter);
  return a;
}

beforeEach(() => {
  queryFn.mockReset();
  connectFn.mockReset();
  rejectionSpy.mockClear();
  // The re-auth password lookup finds a hash; every other read finds nothing.
  queryFn.mockImplementation(async (sql: string) =>
    String(sql).includes('password_hash') ? { rows: [{ password_hash: 'hashed' }], rowCount: 1 } : { rows: [], rowCount: 0 });
  connectFn.mockImplementation(async () => ({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() }));
});

describe('POST /api/mdx/gateways/transmittals/:id/technical-rejection', () => {
  it('refuses without re-authentication: nothing is read, locked or written', async () => {
    const res = await request(app()).post(URL).send({ ...BODY, reauth: undefined });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/ReAuth/);
    expect(rejectionSpy).not.toHaveBeenCalled();
    expect(connectFn).not.toHaveBeenCalled();
  });

  it.each([
    ['no evidence', { evidenceDocumentId: undefined }],
    ['evidence that is not a Vault document id', { evidenceDocumentId: 'fda-notice.pdf' }],
    ['a meaning outside the §11.50 vocabulary', { meaning: 'submission' }],
    ['a reason under eight characters', { reason: 'Ack3' }],
  ])('a body with %s is refused (422) before re-authentication', async (_what, over) => {
    const res = await request(app()).post(URL).send({ ...BODY, ...over });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(rejectionSpy).not.toHaveBeenCalled();
  });

  it('a transmittal outside the tenant is 404 with its code, and no lock is taken', async () => {
    const res = await request(app()).post(URL).send(BODY);
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.details.code).toBe('TRANSMITTAL_NOT_FOUND');
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('a refusal under the lock answers with its code and facts, in words without internals, and writes nothing', async () => {
    const base = queryFn.getMockImplementation()!;
    queryFn.mockImplementation((sql: string, args?: unknown[]) =>
      /FROM submission_transmittals t/.test(sql) ? Promise.resolve({ rows: [{ package_id: 5, package_db_id: 5 }] }) : base(sql, args));
    const writes: string[] = [];
    connectFn.mockImplementation(async () => ({
      query: vi.fn(async (sql: string) => {
        if (/FROM c2c_submission_packages/.test(sql)) return { rows: [{ metadata: { filedSequences: [filed('0000', 1), filed('0001', 2)] } }] };
        if (/FROM submission_transmittals/.test(sql)) return { rows: [{ status: 'received', package_id: 5, bundle_sha256: '1'.repeat(64) }] };
        if (/^\s*(INSERT|UPDATE)/i.test(sql)) writes.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    }));
    const res = await request(app()).post('/api/mdx/gateways/transmittals/1/technical-rejection').send(BODY);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.details).toEqual({
      code: 'NOT_LATEST_FILED_SEQUENCE', transmittalId: 1, sequence: '0000', later: [{ sequence: '0001', transmittalId: 2 }],
    });
    expect(res.body.error).toMatch(/^Only the latest sequence on file can be recorded as rejected\./);
    expect(res.body.error).not.toMatch(/\/api\/|vault\.documents|submission_transmittals/);
    expect(writes).toEqual([]);
  });

  it('records it: 200 with the outcome; the service is handed the verified factors, never the body’s say-so', async () => {
    const outcome = {
      packageDbId: 5, sequence: '0001', transmittalId: 7, bundleSha256: 'b'.repeat(64),
      transmittalStatus: { previous: 'received', current: 'validation_failed' },
      evidence: { vaultDocumentId: NOTICE_ID, contentSha256: 'c'.repeat(64) },
      staleBundleCleared: null, actionId: 'act_1', signatureId: 31, recordedAt: '2026-10-01T00:00:00.000Z',
    };
    rejectionSpy.mockResolvedValueOnce(outcome);
    const res = await request(app()).post(URL)
      .send({ ...BODY, authenticationMethod: 'smartcard', reauth: { password: 'pw-123456', totp: '123456' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toEqual(outcome);
    expect(rejectionSpy).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 99, transmittalId: 7, actorUserId: 777, meaning: 'responsibility', evidenceDocumentId: NOTICE_ID,
      reason: BODY.reason, authenticationMethod: 'password+totp', secondFactorVerified: true,
      reauthVerifiedAt: expect.any(Date),
    }));
  });
});
