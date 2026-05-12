import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../../config/environment', () => ({
  config: { jwt: { secret: 'test-secret-test-secret-test-secret-test', expiresIn: '1d' } },
}));

import { authenticateToken, optionalAuth } from '../auth';

const SECRET = 'test-secret-test-secret-test-secret-test';

function makeReq(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as any;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe('authenticateToken — subject claim enforcement', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
  });

  it('rejects a token with no subject claim (no fallback to id=0)', () => {
    const token = jwt.sign({ email: 'x@example.com' }, SECRET, { algorithm: 'HS256' });
    const req = makeReq(token);
    const res = makeRes();
    authenticateToken(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_007' }) }));
    expect(next).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('rejects a token with sub=0', () => {
    const token = jwt.sign({ sub: 0, email: 'x@example.com' }, SECRET, { algorithm: 'HS256' });
    const req = makeReq(token);
    const res = makeRes();
    authenticateToken(req, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a token with a valid userId claim', () => {
    const token = jwt.sign({ userId: 42, email: 'x@example.com', organizationId: 7 }, SECRET, { algorithm: 'HS256' });
    const req = makeReq(token);
    const res = makeRes();
    authenticateToken(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe(42);
    expect(req.user.userId).toBe(42);
  });

  it('returns 401 when token is missing', () => {
    const res = makeRes();
    authenticateToken(makeReq(), res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('optionalAuth — subject claim handling', () => {
  let next: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    next = vi.fn();
  });

  it('continues unauthenticated when token has no subject claim', () => {
    const token = jwt.sign({ email: 'x@example.com' }, SECRET, { algorithm: 'HS256' });
    const req = makeReq(token);
    const res = makeRes();
    optionalAuth(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeUndefined();
  });

  it('attaches user when token has a valid subject', () => {
    const token = jwt.sign({ sub: 'user-abc' }, SECRET, { algorithm: 'HS256' });
    const req = makeReq(token);
    const res = makeRes();
    optionalAuth(req, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe('user-abc');
  });
});
