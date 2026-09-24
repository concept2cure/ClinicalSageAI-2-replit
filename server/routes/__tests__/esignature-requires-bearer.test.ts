/**
 * /api/esignature refuses a request that carries no bearer token — in EVERY
 * authBoundary mode, not only production's.
 *
 * This is the server half of the proof for the useEsignature fix
 * (client/src/concept2cure/hooks/useEsignature.ts). The client half shows the
 * hook now sends the token; this shows why its absence was total rather than a
 * production-only failure:
 *
 *   - /api/esignature is mounted with NO inline auth
 *     (register-inline-routes.ts), so the global authBoundary decides;
 *   - in 'enforce' (production) the boundary answers 401 before the handler;
 *   - in 'warn' (every other environment) the boundary lets the request pass
 *     with no user, and the handler's own resolveUserId() answers
 *     401 AUTH_REQUIRED.
 *
 * <EsignModal> gates every governed confirm on verify-password, so no signer
 * could be verified anywhere — and the validation OQ did not see it, because
 * it signs through /api/c2c/actions/sign with its own bearer token.
 *
 * The REAL createAuthBoundary and the REAL esignature router are mounted. Only
 * JWT verification is replaced: the injected authenticator reads the header
 * with the real extractBearerToken, and accepts one known token.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const hoisted = vi.hoisted(() => ({
  verifySignerPassword: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => hoisted.poolQuery(...a) } }));
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => hoisted.poolQuery(...a) } }));
vi.mock('../../services/mfaService.js', () => ({
  isMfaEnabled: async () => false,
  isTokenCurrentlyAcceptable: async () => false,
  verifyToken: async () => false,
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../../services/part11/reverify-signer.js', () => ({
  verifySignerPassword: (...a: unknown[]) => hoisted.verifySignerPassword(...a),
  reverifySigner: vi.fn(),
}));
vi.mock('../../services/part11/reverify-signer-deps.js', () => ({ signerReverificationDeps: () => ({}) }));

import esignatureRouter from '../esignature';
import { createAuthBoundary } from '../../middleware/authBoundary';
import { extractBearerToken } from '../../middleware/auth';

const VALID = 'valid-access-token';
const SIGNER_ID = 5;

/** Stands in for authenticateToken's JWT check only; the header is read the real way. */
function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: { code: 'AUTH_001', message: 'No authentication token provided' } });
  if (token !== VALID) return res.status(401).json({ error: { code: 'AUTH_002', message: 'Invalid token' } });
  (req as Request & { user?: unknown; userId?: number }).user = { id: SIGNER_ID };
  (req as Request & { userId?: number }).userId = SIGNER_ID;
  next();
}

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api', createAuthBoundary({
    authenticate,
    logger: { warn: () => {} },
    establishTenantContext: (_req, _res, next) => next(),
  }));
  a.use('/api/esignature', esignatureRouter);
  return a;
}

const priorMode = process.env.AUTH_BOUNDARY_MODE;
beforeEach(() => {
  hoisted.verifySignerPassword.mockReset();
  hoisted.verifySignerPassword.mockResolvedValue({ ok: true });
});
afterEach(() => {
  if (priorMode === undefined) delete process.env.AUTH_BOUNDARY_MODE;
  else process.env.AUTH_BOUNDARY_MODE = priorMode;
});

describe.each(['enforce', 'warn'] as const)('authBoundary mode=%s', (mode) => {
  beforeEach(() => { process.env.AUTH_BOUNDARY_MODE = mode; });

  it('refuses verify-password without a bearer token, and never checks the password', async () => {
    const res = await request(app())
      .post('/api/esignature/verify-password')
      .send({ password: 'correct horse' });
    expect(res.status).toBe(401);
    // enforce: refused by the boundary; warn: passed through with no user and
    // refused by the handler. Either way the password is never reached.
    expect(hoisted.verifySignerPassword).not.toHaveBeenCalled();
    if (mode === 'warn') expect(res.body.error).toBe('AUTH_REQUIRED');
  });

  it('refuses verify-mfa without a bearer token', async () => {
    const res = await request(app()).post('/api/esignature/verify-mfa').send({ token: '123456' });
    expect(res.status).toBe(401);
  });

  it('reaches the signer check WITH the bearer token the fixed hook now sends', async () => {
    const res = await request(app())
      .post('/api/esignature/verify-password')
      .set('Authorization', `Bearer ${VALID}`)
      .send({ password: 'correct horse' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(hoisted.verifySignerPassword).toHaveBeenCalledWith(SIGNER_ID, 'correct horse', expect.anything());
  });
});
