import { vi } from 'vitest';

// vi.hoisted to set env vars before any module load (see ssoRoutes.test.ts).
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

// Keep the import chain off the real DB / heavy services. The token-class guard
// under test runs BEFORE any of these are reached for a partial token, so no-op
// mocks are sufficient — we only need the imports to resolve.
vi.mock('../../db', () => {
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return { db: {}, pool, getPool: () => pool, getDb: () => ({}) };
});
vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
// Extra service mocks so the auth.ts router imports resolve without touching the
// DB. The token-class guard rejects before any of these are invoked.
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../../services/emailService', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(),
}));
vi.mock('../../services/mfaService', () => ({
  generateSecret: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  verifyToken: vi.fn(),
  detectVerificationMethod: vi.fn(),
}));
vi.mock('../../services/emailOtpService', () => ({
  createEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
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
vi.mock('../../services/industry-context/signup-profile', () => ({
  primaryIndustryForIndustryMode: vi.fn(),
  pathwaysForUseCases: vi.fn(),
}));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({
  isDevAuthAllowed: () => false,
  devAuthDenialReason: () => 'disabled',
}));

import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { sanitizeReturnTo } from '../sso';
import enterpriseRoutes from '../authEnterprise';
import authRoutes from '../auth';

const SECRET = process.env.JWT_SECRET as string;
const sign = (payload: object) => jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '5m' });

// A password-only, pre-MFA partial token — signed with the SAME secret as an
// access token, which is exactly what the token-class guard must reject.
const partialToken = () =>
  sign({ userId: '1', email: 'u@example.com', organizationId: '2', role: 'pending_mfa', mfaPending: true });
// A distinct pre-access class stamped only via `type`.
const challengeToken = () =>
  sign({ userId: '1', email: 'u@example.com', organizationId: '2', type: 'mfa_challenge' });
// A genuine access token (no org → no DB lookup on the refresh path).
const accessToken = () => sign({ userId: '1', email: 'u@example.com', type: 'access' });

describe('Defect 1: sanitizeReturnTo hardening (SSO open-redirect / token exfil)', () => {
  it('rejects the backslash open-redirect payloads', () => {
    expect(sanitizeReturnTo('/\\evil.com')).toBeUndefined();
    expect(sanitizeReturnTo('/\\evil.com/x')).toBeUndefined();
    // literal "/\t/evil.com" with a real TAB control char
    expect(sanitizeReturnTo('/\t/evil.com')).toBeUndefined();
    // literal backslash-t sequence
    expect(sanitizeReturnTo('/\\t/evil.com')).toBeUndefined();
  });

  it('rejects protocol-relative and absolute URLs', () => {
    expect(sanitizeReturnTo('//evil.com')).toBeUndefined();
    expect(sanitizeReturnTo('https://evil.com')).toBeUndefined();
    expect(sanitizeReturnTo('http://evil.com')).toBeUndefined();
  });

  it('rejects non-strings / empty', () => {
    expect(sanitizeReturnTo(undefined)).toBeUndefined();
    expect(sanitizeReturnTo('')).toBeUndefined();
    expect(sanitizeReturnTo(42 as unknown)).toBeUndefined();
  });

  it('accepts a legitimate same-origin path (incl. query)', () => {
    expect(sanitizeReturnTo('/concept2cure/home')).toBe('/concept2cure/home');
    expect(sanitizeReturnTo('/concept2cure/home?tab=1')).toBe('/concept2cure/home?tab=1');
  });
});

describe('Defect 2: token-class guard on /api/auth/enterprise/*', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth/enterprise', enterpriseRoutes);

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('POST /refresh-token rejects a pre-MFA partial token (no 24h access minted)', async () => {
    const res = await request(app).post('/api/auth/enterprise/refresh-token').set(bearer(partialToken()));
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('POST /refresh-token rejects an mfa_challenge token', async () => {
    const res = await request(app).post('/api/auth/enterprise/refresh-token').set(bearer(challengeToken()));
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it('POST /refresh-token still refreshes a VALID access token', async () => {
    const res = await request(app).post('/api/auth/enterprise/refresh-token').set(bearer(accessToken()));
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('POST /select-organization rejects a partial token', async () => {
    const res = await request(app)
      .post('/api/auth/enterprise/select-organization')
      .set(bearer(partialToken()))
      .send({ organizationId: 2 });
    expect(res.status).toBe(401);
  });

  it('GET /session reports unauthenticated for a partial token', async () => {
    const res = await request(app).get('/api/auth/enterprise/session').set(bearer(partialToken()));
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(false);
  });

  it('GET /session reports authenticated for a VALID access token', async () => {
    const res = await request(app).get('/api/auth/enterprise/session').set(bearer(accessToken()));
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
  });

  it('POST /mfa/setup rejects a partial token', async () => {
    const res = await request(app).post('/api/auth/enterprise/mfa/setup').set(bearer(partialToken()));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/enable rejects a partial token', async () => {
    const res = await request(app)
      .post('/api/auth/enterprise/mfa/enable')
      .set(bearer(partialToken()))
      .send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('POST /mfa/disable rejects a partial token', async () => {
    const res = await request(app)
      .post('/api/auth/enterprise/mfa/disable')
      .set(bearer(partialToken()))
      .send({ password: 'x', code: '123456' });
    expect(res.status).toBe(401);
  });
});

describe('Defect 2: token-class guard on /api/auth/* (plain variants)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('GET /session rejects a partial token (401)', async () => {
    const res = await request(app).get('/api/auth/session').set(bearer(partialToken()));
    expect(res.status).toBe(401);
    expect(res.body.authenticated).not.toBe(true);
  });

  it('GET /session rejects an mfa_challenge token (401)', async () => {
    const res = await request(app).get('/api/auth/session').set(bearer(challengeToken()));
    expect(res.status).toBe(401);
  });

  it('GET /me rejects a partial token (401)', async () => {
    const res = await request(app).get('/api/auth/me').set(bearer(partialToken()));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/setup rejects a partial token (401)', async () => {
    const res = await request(app).post('/api/auth/mfa/setup').set(bearer(partialToken()));
    expect(res.status).toBe(401);
  });

  it('POST /mfa/enable rejects a partial token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/mfa/enable')
      .set(bearer(partialToken()))
      .send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('POST /mfa/disable rejects a partial token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/mfa/disable')
      .set(bearer(partialToken()))
      .send({ code: '123456' });
    expect(res.status).toBe(401);
  });

  it('POST /password/change rejects a partial token (401)', async () => {
    const res = await request(app)
      .post('/api/auth/password/change')
      .set(bearer(partialToken()))
      .send({ currentPassword: 'x', newPassword: 'ValidPass123!extra' });
    expect(res.status).toBe(401);
  });
});
