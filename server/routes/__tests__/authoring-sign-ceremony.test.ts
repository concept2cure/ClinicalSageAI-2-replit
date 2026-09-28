/**
 * Authoring signs with the platform's one signing ceremony (VSR-001 §13.3
 * item 3; §11.5 item 5).
 *
 * ── What was open ────────────────────────────────────────────────────────────
 * Every other signing path re-verifies the signer through
 * services/part11/reverify-signer.ts: the account password, and the second
 * factor whenever one is enrolled. The authoring routes, which sign the
 * documents a sponsor files, verified a separate "signing PIN" and nothing
 * else:
 *   - a signer with an authenticator enrolled signed without it (OQ-AUTH-14
 *     passed for user 17, who has one);
 *   - the PIN was enrolled by POST /users/pin with a session alone the first
 *     time, so possession of a session became possession of the signing
 *     credential, which §11.200(a)(1) and §11.300 exist to prevent;
 *   - two credential stores meant two lockout policies, two lifecycles and two
 *     answers to "how was this signature authenticated".
 * The row recorded method 'PIN', which no other signature in the product has.
 *
 * Now both routes run reverifySigner with the production wiring, the row
 * records the factors it verified ('password' or 'password+mfa'), and the PIN
 * store has no route that reads or writes it.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  return {
    poolQuery: vi.fn(),
    clientQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: () => undefined })),
    chainedAudit: vi.fn(async (..._a: unknown[]) => {}),
    mfaEnabled: false,
    failures: 0,
    pinHash: '',
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
// §11.10(g) authority and org membership have their own suites; here they pass.
vi.mock('../../services/part11/resolve-signer-role.js', () => ({
  resolveSignerOrgRole: vi.fn(async () => 'approver'),
}));
vi.mock('../../middleware/orgMembership', () => ({
  enforceOrgMembership: (_req: unknown, _res: unknown, next: () => void) => next(),
  invalidateOrgMembershipCache: () => undefined,
}));
// The production wiring of the ceremony, with the account's state set per case.
vi.mock('../../services/part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string) => plain === 'right-password',
    isMfaEnabled: async () => h.mfaEnabled,
    verifyMfaToken: async (_id: number, token: string) => token === '135790',
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {
      h.failures += 1;
    },
    warn: () => {},
  }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-sign-ceremony';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

const PIN = '246810';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    userId: '7',
    id: '7',
    sub: '7',
    email: 'signer@test.co',
    organizationId: '3',
    role: 'approver',
    roles: ['approver'],
    type: 'access',
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

/** The INSERT INTO authoring_signatures the transaction client saw, if any. */
function signatureInsert(): { sql: string; params: unknown[] } | undefined {
  const call = h.clientQuery.mock.calls.find((c) => /INSERT INTO authoring_signatures/i.test(String(c[0])));
  return call ? { sql: String(call[0]), params: (call[1] as unknown[]) ?? [] } : undefined;
}

/** Each route's body besides the credentials. */
const ACT = {
  'e-sign': { meaning: 'REVIEWER', intent: 'I reviewed this document' },
  sign: { meaning: 'REVIEWER', reason: 'Reviewed and accepted' },
} as const;

beforeEach(async () => {
  if (!h.pinHash) h.pinHash = await bcrypt.hash(PIN, 4);
  vi.clearAllMocks();
  h.mfaEnabled = false;
  h.failures = 0;
  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: () => undefined }));
  h.clientQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(s)) return {};
    if (/COUNT\(\*\)[\s\S]*FROM authoring_workflow_steps/i.test(s)) {
      return { rowCount: 1, rows: [{ pending: '1', total: '2' }] };
    }
    return { rowCount: 1, rows: [{ id: 'D1', doc_id: 'D1', code: '2.6.6', content: 'body' }] };
  });
  h.poolQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes('organization_users')) return { rowCount: 1, rows: [{ role: 'approver', organization_id: 3, user_id: 7 }] };
    // A valid PIN, so the defect (a PIN alone signing) is reachable.
    if (/FROM user_pins/i.test(s)) {
      return { rowCount: 1, rows: [{ pin_hash: h.pinHash, failed_attempts: 0, locked_until: null }] };
    }
    if (/SELECT 1 FROM authoring_documents/i.test(s)) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    if (/SELECT name FROM users/i.test(s)) return { rowCount: 1, rows: [{ name: 'Sam Signer' }] };
    if (/SELECT code, content FROM authoring_sections/i.test(s)) {
      return { rowCount: 1, rows: [{ code: '2.6.6', content: 'body' }] };
    }
    return { rowCount: 0, rows: [] };
  });
});

describe('Authoring signs with the platform ceremony', () => {
  for (const path of ['e-sign', 'sign'] as const) {
    describe(`POST /docs/:docId/${path}`, () => {
      it('a signing PIN alone signs nothing', async () => {
        const res = await request(makeApp())
          .post(`/api/authoring/docs/D1/${path}`)
          .set('Authorization', await bearer())
          .send({ pin: PIN, ...ACT[path] });
        expect(res.status, 'a PIN signed a document').toBe(400);
        expect(res.body.code).toBe('PASSWORD_REQUIRED');
        expect(signatureInsert()).toBeUndefined();
      });

      it('signs with the account password and the enrolled code, and records that', async () => {
        h.mfaEnabled = true;
        const res = await request(makeApp())
          .post(`/api/authoring/docs/D1/${path}`)
          .set('Authorization', await bearer())
          .send({ password: 'right-password', mfaToken: '135790', ...ACT[path] });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        const insert = signatureInsert();
        expect(insert?.params).toContain('password+mfa');
        expect(insert?.sql).not.toMatch(/'PIN'/);
      });

      it('refuses the password alone when an authenticator is enrolled', async () => {
        h.mfaEnabled = true;
        const res = await request(makeApp())
          .post(`/api/authoring/docs/D1/${path}`)
          .set('Authorization', await bearer())
          .send({ password: 'right-password', ...ACT[path] });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MFA_TOKEN_REQUIRED');
        expect(signatureInsert()).toBeUndefined();
      });

      it('refuses a wrong code, counts it against the account, and writes nothing', async () => {
        h.mfaEnabled = true;
        const res = await request(makeApp())
          .post(`/api/authoring/docs/D1/${path}`)
          .set('Authorization', await bearer())
          .send({ password: 'right-password', mfaToken: '000000', ...ACT[path] });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('MFA_VERIFICATION_FAILED');
        expect(h.failures).toBe(1);
        expect(signatureInsert()).toBeUndefined();
      });

      it('signs with the password when no authenticator is enrolled, and records that', async () => {
        const res = await request(makeApp())
          .post(`/api/authoring/docs/D1/${path}`)
          .set('Authorization', await bearer())
          .send({ password: 'right-password', ...ACT[path] });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(signatureInsert()?.params).toContain('password');
      });

      it('refuses a wrong password and writes nothing', async () => {
        const res = await request(makeApp())
          .post(`/api/authoring/docs/D1/${path}`)
          .set('Authorization', await bearer())
          .send({ password: 'wrong', ...ACT[path] });
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('PASSWORD_VERIFICATION_FAILED');
        expect(signatureInsert()).toBeUndefined();
      });
    });
  }
});

describe('the PIN store', () => {
  it('has no route that sets a PIN: POST /users/pin is gone', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/users/pin')
      .set('Authorization', await bearer())
      .send({ pin: '135792468' });
    expect(res.status, 'a session can still set the signing credential').toBe(404);
    expect(h.poolQuery.mock.calls.some((c) => /user_pins/i.test(String(c[0])))).toBe(false);
  });
});
