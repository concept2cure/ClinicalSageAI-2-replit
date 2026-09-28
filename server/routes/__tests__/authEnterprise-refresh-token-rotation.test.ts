import { vi } from 'vitest';

// Env before any module load (same reason as authSurfaceSecurity.test.ts).
vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV =
    process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const state = vi.hoisted(() => ({
  passwordChangedAtSeconds: null as string | number | null,
}));
const revokeToken = vi.hoisted(() => vi.fn(async (_token: string, _reason?: string) => undefined));

// The live-token check reads the revocation list and the account's standing
// through the pool; the account the tokens name is in use. `db` (drizzle) is
// empty so lookupOrgRole falls back to 'user', as it does for any read failure.
const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return { rows: [{ status: 'active', password_changed_at_seconds: state.passwordChangedAtSeconds }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { db: {}, pool, getPool: () => pool, getDb: () => ({}) };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () => ({ valid: true, errors: [] }),
  isAccountLocked: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
  isPasswordExpired: vi.fn(),
  checkPasswordHistory: vi.fn(),
  createElectronicSignature: vi.fn(),
  verifySignatureIntegrity: vi.fn(),
}));
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
// verifyLiveToken stays real (signature, revocation list, standing, all against
// the doubles above); only the write is recorded.
vi.mock('../../services/token-revocation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/token-revocation')>()),
  revokeToken: (token: string, reason?: string) => revokeToken(token, reason),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import enterpriseRoutes from '../authEnterprise';

/**
 * POST /api/auth/enterprise/refresh-token — rotation.
 *
 * Security audit 2026-09-24, IAM-04: the route verified the presented access
 * token, minted a fresh 24-hour one, and revoked nothing. Any live access token
 * could therefore be renewed forever, a day at a time, and logging out of the
 * new one left the old one live. Rotation means the presented token is spent
 * the moment its successor exists. The token-class refusal (a refresh, MFA
 * challenge or MFA-partial token mints nothing here) was already in place
 * (authSurfaceSecurity.test.ts) and is re-pinned beside the new rule.
 */
function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}

const SECRET = process.env.JWT_SECRET as string;
const nowSeconds = () => Math.floor(Date.now() / 1000);
// exp is measured from the iat given: a token issued in the past gets a long
// life so it is still valid on signature and only the rule under test refuses it.
const sign = (payload: object, iat?: number) =>
  jwt.sign(iat === undefined ? payload : { ...payload, iat }, SECRET, { algorithm: 'HS256', expiresIn: iat === undefined ? '5m' : '30d' });
const base = { userId: '1', email: 'u@example.com' };
const accessToken = (iat?: number) => sign({ ...base, type: 'access' }, iat);

const refresh = (token: string) =>
  request(app()).post('/api/auth/enterprise/refresh-token').set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  revokeToken.mockClear();
  state.passwordChangedAtSeconds = null;
});

describe('POST /refresh-token rotates', () => {
  it('mints a successor and revokes the presented access token', async () => {
    const presented = accessToken();

    const res = await refresh(presented);

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token).not.toBe(presented);
    expect(revokeToken).toHaveBeenCalledTimes(1);
    expect(revokeToken).toHaveBeenCalledWith(presented, 'rotated');
  });

  it.each([
    ['refresh', { ...base, type: 'refresh' }],
    ['mfa_challenge', { ...base, type: 'mfa_challenge' }],
    ['mfa-partial', { ...base, organizationId: '2', role: 'pending_mfa', mfaPending: true }],
  ])('refuses a %s token: nothing minted, nothing revoked', async (_name, payload) => {
    const res = await refresh(sign(payload));

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it('cannot renew a session the password change ended (iat before password_changed_at)', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAtSeconds = String(changed);

    const res = await refresh(accessToken(changed - 3600));

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });
});
