import { vi } from 'vitest';
// Env before any module load (same reason as authSurfaceSecurity.test.ts).
vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});
const revokeToken = vi.hoisted(() => vi.fn(async (_token: string, _reason?: string) => undefined));
// The live-token check reads the revocation list and the account's standing
// through the pool. `db` (drizzle) answers the membership and organisation
// reads the switch makes, whatever the projection.
const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  const rows: Record<string, Record<string, unknown>[]> = {
    organization_users: [{ organizationId: 7, userId: 1, role: 'manager' }],
    organizations: [{ id: 7, name: 'Acme', settings: { security: { sessionTimeoutMinutes: 45 } } }],
  };
  let current = '';
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = (table: unknown) => {
    current = (table as { _?: { name?: string } })._?.name ?? String((table as { [k: symbol]: unknown })[Symbol.for('drizzle:Name')] ?? '');
    return chain;
  };
  chain.where = () => chain;
  chain.limit = async () => rows[current] ?? [];
  return { db: chain, pool, getPool: () => pool, getDb: () => chain };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));
vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () => ({ valid: true, errors: [] }),
  isAccountLocked: vi.fn(), recordFailedLogin: vi.fn(), resetFailedLogins: vi.fn(), isPasswordExpired: vi.fn(),
  checkPasswordHistory: vi.fn(), createElectronicSignature: vi.fn(), verifySignatureIntegrity: vi.fn(),
}));
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: vi.fn(async () => undefined) }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../services/token-revocation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/token-revocation')>()),
  revokeToken: (token: string, reason?: string) => revokeToken(token, reason),
}));

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import enterpriseRoutes from '../authEnterprise';

/**
 * POST /api/auth/enterprise/select-organization — rotation (the security-auditor
 * review of 2026-09-26, beside IAM-04).
 *
 * The switch verified the presented access token, minted one scoped to the
 * selected organisation, and revoked nothing, so both the old and the new
 * organisation's tokens stayed live together until the session ended. Every
 * other mint from a presented token (POST /refresh, /refresh-token) spends the
 * token it was handed the moment its successor exists; the switch now does too.
 */
function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}
const SECRET = process.env.JWT_SECRET as string;
const presentedToken = () =>
  jwt.sign({ userId: '1', email: 'u@example.com', organizationId: '3', role: 'user', type: 'access', sid: 'S1', sst: Math.floor(Date.now() / 1000), idl: 900 }, SECRET, { algorithm: 'HS256', expiresIn: '5m' });

beforeEach(() => revokeToken.mockClear());

describe('POST /select-organization rotates', () => {
  it('mints a token for the selected organisation, keeps the session, and revokes the presented token', async () => {
    const presented = presentedToken();
    const res = await request(app())
      .post('/api/auth/enterprise/select-organization')
      .set('Authorization', `Bearer ${presented}`)
      .send({ organizationId: '7' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(typeof res.body.token).toBe('string');
    const claims = jwt.decode(res.body.token) as Record<string, unknown>;
    expect(claims.organizationId).toBe('7');
    expect(claims.sid).toBe('S1');
    expect(claims.idl, "the selected organisation's idle window").toBe(45 * 60);
    expect(revokeToken, 'the presented token stayed live beside its successor').toHaveBeenCalledWith(presented, 'rotated');
  });
});
