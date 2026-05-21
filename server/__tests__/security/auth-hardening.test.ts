import { describe, it, expect, vi } from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. server/auth.ts loads
// server/config/environment.ts (throws if JWT_SECRET <32 chars) and
// server/db/runtime.ts (pool init reads DATABASE_URL once at load).
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { authMiddleware } from '../../auth';
import { getRequestActor } from '../../utils/tenantContext';

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

describe('auth hardening', () => {
  it('rejects missing bearer token even when x-api-key is provided', () => {
    const req: any = { headers: { 'x-api-key': 'legacy-key' } };
    const res = createRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.error).toContain('Bearer token');
    expect(next).not.toHaveBeenCalled();
  });



  it('rejects malformed bearer header with missing token segment', () => {
    const req: any = { headers: { authorization: 'Bearer   ' } };
    const res = createRes();
    const next = vi.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body?.error).toContain('Bearer token');
    expect(next).not.toHaveBeenCalled();
  });

  it('derives request actor from authenticated user context, not user-supplied headers', () => {
    const req: any = {
      headers: {
        'x-user-name': 'forged-user',
        'x-user-role': 'admin',
      },
      user: {
        email: 'trusted@company.com',
        role: 'viewer',
      },
    };

    const actor = getRequestActor(req);

    expect(actor.userName).toBe('trusted@company.com');
    expect(actor.userRole).toBe('viewer');
  });
});
