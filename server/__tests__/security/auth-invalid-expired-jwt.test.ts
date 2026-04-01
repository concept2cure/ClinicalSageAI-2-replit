import { beforeAll, describe, expect, it, vi } from 'vitest';
// jsonwebtoken lacks strong typings in this repo setup for tests.
// Use require-style import to keep this smoke test lightweight.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jwt = require('jsonwebtoken');

let authMiddleware: any;
let authenticateToken: any;
let config: any;

beforeAll(async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret';
  process.env.SKIP_DB_STARTUP_TEST = 'true';

  vi.resetModules();
  ({ authMiddleware } = await import('../../auth'));
  ({ authenticateToken } = await import('../../middleware/' + 'auth.ts'));
  ({ config } = await import('../../config/environment'));
});

function createRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((payload: any) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('stage3 invalid/expired jwt contract', () => {
  it('authMiddleware rejects invalid JWT (server/auth.ts)', () => {
    const req: any = { headers: { authorization: 'Bearer invalid.jwt.token' } };
    const res = createRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.error).toContain('Invalid or expired token');
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticateToken rejects invalid JWT (middleware/auth.ts)', () => {
    const req: any = { headers: { authorization: 'Bearer invalid.jwt.token' } };
    const res = createRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.error?.code).toBe('AUTH_002');
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticateToken rejects expired JWT (middleware/auth.ts)', () => {
    const expired = jwt.sign(
      {
        userId: '1',
        organizationId: '2',
        email: 'expired@example.com',
      },
      config.jwt.secret,
      { expiresIn: -10 }
    );

    const req: any = { headers: { authorization: `Bearer ${expired}` } };
    const res = createRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.error?.code).toBe('AUTH_002');
    expect(next).not.toHaveBeenCalled();
  });
});
