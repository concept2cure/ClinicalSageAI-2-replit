/**
 * Auth-boundary coverage (GA-hardening audit finding H2).
 *
 * The default-deny boundary is the highest-blast-radius change in the security
 * wave — a wrong allowlist entry or mode default could either 401 a legitimate
 * public route or silently keep a protected one open. These tests pin the three
 * things that must never regress: the allowlist match semantics, the mode
 * defaults (enforce in prod, warn everywhere else incl. staging), and the
 * pass/deny behaviour of the middleware itself. DB-free by construction —
 * the authenticator and logger are injected.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createAuthBoundary, isPublicApiPath, resolveAuthBoundaryMode } from '../authBoundary';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { method: 'GET', baseUrl: '', path: '/', ...overrides } as Request;
}

function mockRes(): Response {
  const res = {} as Record<string, unknown>;
  res.statusCode = 200;
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn(() => res);
  return res as unknown as Response;
}

/** An authenticator that always rejects the way the canonical one does: it
 *  writes a 401 body and never calls next(). */
const rejectingAuth: RequestHandler = (_req, res) => {
  (res as unknown as { status: (n: number) => { json: (b: unknown) => void } })
    .status(401)
    .json({ error: { code: 'AUTH_001', message: 'Authentication required' } });
};

describe('isPublicApiPath', () => {
  it('matches an exact entry only for itself, not sub-paths', () => {
    expect(isPublicApiPath('/api/time')).toBe(true);
    expect(isPublicApiPath('/api/time/zone')).toBe(false);
  });

  it('matches a prefix entry for the path and its sub-paths', () => {
    expect(isPublicApiPath('/api/auth')).toBe(true);
    expect(isPublicApiPath('/api/auth/login')).toBe(true);
    expect(isPublicApiPath('/api/health/full')).toBe(true);
  });

  it('does not let a lookalike ride on a prefix entry', () => {
    expect(isPublicApiPath('/api/health')).toBe(true);
    expect(isPublicApiPath('/api/healthxyz')).toBe(false);
    expect(isPublicApiPath('/api/authorize-me')).toBe(false);
  });

  it('defaults to deny for protected surfaces', () => {
    expect(isPublicApiPath('/api/control-plane')).toBe(false);
    expect(isPublicApiPath('/api/templates')).toBe(false);
    expect(isPublicApiPath('/api/intelligent-docs')).toBe(false);
  });
});

describe('resolveAuthBoundaryMode', () => {
  it('enforces in production by default', () => {
    expect(resolveAuthBoundaryMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(
      'enforce'
    );
  });

  it('warns in staging and dev/test by default (soak, never silent-open in prod)', () => {
    expect(resolveAuthBoundaryMode({ NODE_ENV: 'staging' } as NodeJS.ProcessEnv)).toBe('warn');
    expect(resolveAuthBoundaryMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe('warn');
    expect(resolveAuthBoundaryMode({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe('warn');
  });

  it('honours an explicit AUTH_BOUNDARY_MODE override both ways', () => {
    expect(
      resolveAuthBoundaryMode({
        NODE_ENV: 'production',
        AUTH_BOUNDARY_MODE: 'warn',
      } as NodeJS.ProcessEnv)
    ).toBe('warn');
    expect(
      resolveAuthBoundaryMode({
        NODE_ENV: 'development',
        AUTH_BOUNDARY_MODE: 'enforce',
      } as NodeJS.ProcessEnv)
    ).toBe('enforce');
  });
});

describe('createAuthBoundary', () => {
  const ORIGINAL_MODE = process.env.AUTH_BOUNDARY_MODE;
  afterEach(() => {
    if (ORIGINAL_MODE === undefined) delete process.env.AUTH_BOUNDARY_MODE;
    else process.env.AUTH_BOUNDARY_MODE = ORIGINAL_MODE;
  });

  it('passes CORS preflight without authenticating', () => {
    const authenticate = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    createAuthBoundary({ authenticate })(
      mockReq({ method: 'OPTIONS', baseUrl: '/api', path: '/control-plane' }),
      mockRes(),
      next
    );
    expect(authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes an allowlisted public path without authenticating', () => {
    const authenticate = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    createAuthBoundary({ authenticate })(
      mockReq({ baseUrl: '/api', path: '/auth/login' }),
      mockRes(),
      next
    );
    expect(authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes a request already authenticated upstream (idempotent)', () => {
    const authenticate = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    createAuthBoundary({ authenticate })(
      mockReq({ baseUrl: '/api', path: '/documents', user: { id: 1 } } as Partial<Request>),
      mockRes(),
      next
    );
    expect(authenticate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('enforce mode delegates a protected unauthenticated request to the canonical 401', () => {
    process.env.AUTH_BOUNDARY_MODE = 'enforce';
    const authenticate = vi.fn(rejectingAuth);
    const next = vi.fn() as unknown as NextFunction;
    const res = mockRes();
    createAuthBoundary({ authenticate })(
      mockReq({ baseUrl: '/api', path: '/control-plane' }),
      res,
      next
    );
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('installs tenant execution context only after authentication succeeds', () => {
    process.env.AUTH_BOUNDARY_MODE = 'enforce';
    const order: string[] = [];
    const authenticate: RequestHandler = (req, _res, next) => {
      order.push('authenticate');
      req.user = { id: 7, userId: 7, organizationId: 42, role: 'member' };
      next();
    };
    const establishTenantContext = vi.fn((_req, _res, next) => {
      order.push('tenant-context');
      next();
    });
    const next = vi.fn(() => order.push('route')) as unknown as NextFunction;

    createAuthBoundary({ authenticate, establishTenantContext })(
      mockReq({ baseUrl: '/api', path: '/documents' }),
      mockRes(),
      next
    );

    expect(order).toEqual(['authenticate', 'tenant-context', 'route']);
    expect(establishTenantContext).toHaveBeenCalledTimes(1);
  });

  it('warn mode lets an unauthenticated protected request through and logs once per route', () => {
    process.env.AUTH_BOUNDARY_MODE = 'warn';
    const authenticate = vi.fn(rejectingAuth);
    const warn = vi.fn();
    const next = vi.fn() as unknown as NextFunction;
    const boundary = createAuthBoundary({ authenticate, logger: { warn } });
    boundary(mockReq({ baseUrl: '/api', path: '/control-plane' }), mockRes(), next);
    boundary(mockReq({ baseUrl: '/api', path: '/control-plane' }), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2); // both passed through
    expect(warn).toHaveBeenCalledTimes(1); // deduped to once per method+path
  });

  it('warn mode ALSO installs tenant execution context after a successful auth', () => {
    // Regression: the mode governs only how auth FAILURE is handled. A
    // successfully authenticated request must get the same tenant execution
    // context (runWithTenantScope) in warn mode as in enforce mode — otherwise,
    // with RLS_ENFORCE=on, its pooled queries run unscoped and fail closed
    // (observed as 500s on every authenticated route in warn+RLS-on envs).
    process.env.AUTH_BOUNDARY_MODE = 'warn';
    const order: string[] = [];
    const authenticate: RequestHandler = (req, _res, next) => {
      order.push('authenticate');
      req.user = { id: 7, userId: 7, organizationId: 42, role: 'member' };
      next();
    };
    const establishTenantContext = vi.fn((_req, _res, next) => {
      order.push('tenant-context');
      next();
    });
    const warn = vi.fn();
    const next = vi.fn(() => order.push('route')) as unknown as NextFunction;

    createAuthBoundary({ authenticate, establishTenantContext, logger: { warn } })(
      mockReq({ baseUrl: '/api', path: '/documents' }),
      mockRes(),
      next
    );

    expect(order).toEqual(['authenticate', 'tenant-context', 'route']);
    expect(establishTenantContext).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled(); // success path does not warn
  });
});
