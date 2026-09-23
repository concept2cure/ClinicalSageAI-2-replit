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

const holder = vi.hoisted(() => ({ user: undefined as unknown }));
const verifySignatureIntegrity = vi.hoisted(() => vi.fn());

vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return { db: {}, pool, getPool: () => pool, getDb: () => ({}) };
});

// authMiddleware stands in for the real one, which sets req.user from the
// VERIFIED token and re-checks membership. The route must take the organization
// from there and from nowhere else.
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = holder.user;
    next();
  },
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
  verifySignatureIntegrity: (...a: unknown[]) => verifySignatureIntegrity(...a),
}));
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import enterpriseRoutes from '../authEnterprise';

/**
 * GET /electronic-signature/:id/verify — the tenant boundary.
 *
 * electronic_signatures.id is a SERIAL, and this route passed
 * parseInt(req.params.id) straight into a read that selected on that id ALONE.
 * Any authenticated user of any tenant could count upwards and read another
 * tenant's signer_name, signed_at, signature_type and signature_meaning — the
 * record of who approved what, and when, in a regulated system.
 */
function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}

const url = (id: string | number) => `/api/auth/enterprise/electronic-signature/${id}/verify`;

beforeEach(() => {
  verifySignatureIntegrity.mockReset();
  verifySignatureIntegrity.mockResolvedValue({ valid: true, details: {} });
  holder.user = { id: '1', organizationId: 7 };
});

describe('electronic-signature verify — tenant boundary', () => {
  it('passes the organization from the verified request, not the signature id alone', async () => {
    const res = await request(app()).get(url(123));

    expect(res.status).toBe(200);
    expect(verifySignatureIntegrity).toHaveBeenCalledWith(123, 7);
  });

  it('refuses when the request carries no organization', async () => {
    holder.user = { id: '1' };

    const res = await request(app()).get(url(123));

    expect(res.status).toBe(403);
    // Fails closed: the read is never attempted.
    expect(verifySignatureIntegrity).not.toHaveBeenCalled();
  });

  it('cannot be told which organization to read — the caller does not get a vote', async () => {
    // A caller trying to widen its own scope. The organization must still come
    // from req.user, which the middleware sets from the verified token.
    const res = await request(app()).get(`${url(123)}?organizationId=999`).send();

    expect(res.status).toBe(200);
    expect(verifySignatureIntegrity).toHaveBeenCalledWith(123, 7);
  });

  it('rejects a non-numeric id instead of querying on NaN', async () => {
    const res = await request(app()).get(url('abc'));

    expect(res.status).toBe(400);
    expect(verifySignatureIntegrity).not.toHaveBeenCalled();
  });
});
