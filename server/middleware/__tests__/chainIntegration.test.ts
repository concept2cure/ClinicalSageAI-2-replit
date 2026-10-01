/**
 * Integration tests for the composed middleware chain.
 *
 * Ported from PR #495 (May 2026) and adapted to the CURRENT production stack.
 * Each unit test in this directory pins one module; these pin the
 * COMPOSITION, which is where the sanitizeInput-before-body-parser bug lived.
 *
 * What changed since the PR, and why the chain below differs from it:
 *   - The mounted CSRF check is enterprise-security's ORIGIN check
 *     (applySecurityMiddleware), not the token-based ./csrf.ts, which nothing
 *     in production imports. It only enforces when NODE_ENV=production at
 *     import time, so the module is imported under production env.
 *   - The error handler mounted by server/index.ts is
 *     server/src/mw/observability.ts `errorHandler`.
 *   - authenticateToken requires `type: 'access'` and admits asynchronously
 *     after revocation / account-standing / membership reads, answered here by
 *     the pool + drizzle doubles auth-role-from-database.test.ts uses.
 *
 * Order under test mirrors server/startup/middleware.ts + server/index.ts:
 *   requestId → csrfProtection (applySecurityMiddleware)
 *     → express.json (mountPreAuthBodyParsers) → sanitizeInput (step 6b)
 *     → cookieParser (step 8) → authenticateToken (route) → handler
 *     → errorHandler (last)
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

const poolDouble = vi.hoisted(() => {
  const chain: any = {};
  for (const m of ['select', 'from', 'leftJoin', 'where']) chain[m] = () => chain;
  chain.limit = async () => [{ role: 'member', orgUuid: null }];
  return {
    pool: {
      query: async (sql: string) => {
        if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT status FROM users/i.test(sql)) {
          return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
        }
        throw new Error(`unmodelled pool query: ${sql}`);
      },
    },
    db: chain,
    query: vi.fn(async () => ({ rows: [] })),
  };
});
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);
// A CSRF refusal fire-and-forgets an audit write (enterprise-security
// auditSecurityEvent → dynamic import of auditService). Left real, that import
// drags the schema graph in concurrently with the membership lookup's own
// dynamic import of shared/schema, and under a loaded parallel run the lookup
// intermittently saw a half-evaluated module (organizationUsers undefined →
// AUTH_010 503). The audit write is not under test here.
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn(async () => undefined) } }));

const passThrough = vi.hoisted(() => (_req: unknown, _res: unknown, next: () => void) => next());
vi.mock('../establishRequestTenantScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../establishRequestTenantScope')>()),
  establishRequestTenantScope: passThrough,
}));
vi.mock('../tenantLifecycleGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tenantLifecycleGuard')>()),
  enforceTenantLifecycle: passThrough,
}));
vi.mock('../storageQuotaGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storageQuotaGuard')>()),
  enforceStorageQuota: passThrough,
}));

import { authenticateToken } from '../auth';
import { invalidateOrgMembershipCache } from '../orgMembership';
import { errorHandler } from '../../src/mw/observability';

const ORIGIN = 'https://app.example.com';
const SECRET = process.env.JWT_SECRET as string;
const ORIGINAL_ENV = process.env.NODE_ENV;

let csrfProtection: express.RequestHandler;
let requestId: express.RequestHandler;
let sanitizeInput: express.RequestHandler;

beforeAll(async () => {
  // Evaluate the schema graph once, up front, before any request races for it.
  await import('../../../shared/schema');
  // enterprise-security computes `config.isProduction` / allowedOrigins at
  // import time; under NODE_ENV=test the CSRF check is a pass-through and
  // every CSRF assertion below would be vacuous.
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = ORIGIN;
  const mod = await import('../enterprise-security');
  csrfProtection = mod.csrfProtection as express.RequestHandler;
  requestId = mod.requestId as express.RequestHandler;
  sanitizeInput = mod.sanitizeInput as express.RequestHandler;
  process.env.NODE_ENV = ORIGINAL_ENV;
  delete process.env.ALLOWED_ORIGINS;
});

beforeEach(() => invalidateOrgMembershipCache());
afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

function mountStack(handler: express.RequestHandler) {
  const app = express();
  app.use(requestId);
  app.use(csrfProtection);
  app.use(express.json());
  app.use(sanitizeInput);
  app.use(cookieParser());
  app.post('/api/widgets', authenticateToken, handler);
  app.get('/api/widgets', authenticateToken, handler);
  app.use(errorHandler);
  return app;
}

const sign = (claims: Record<string, unknown>) =>
  jwt.sign({ type: 'access', ...claims }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const validJwt = () => sign({ userId: 42, organizationId: 7 });

describe('chain composition: CSRF gates state-changing requests before auth', () => {
  it('rejects a POST with no Origin, Referer or Bearer (CSRF runs first: 403, not 401)', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app).post('/api/widgets').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('rejects a POST from a foreign Origin even with a valid Bearer token', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .post('/api/widgets')
      .set('Origin', 'https://evil.example.net')
      .set('Authorization', `Bearer ${validJwt()}`)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CSRF_ORIGIN_MISMATCH');
  });
});

describe('chain composition: auth rejects subjectless / malformed JWTs', () => {
  it('rejects a JWT with no subject claim even when CSRF is satisfied', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .post('/api/widgets')
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${sign({ email: 'x@example.com' })}`)
      .send({});
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_007');
  });

  it('rejects a malformed Authorization header that the old replace() would have mangled', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .post('/api/widgets')
      .set('Origin', ORIGIN)
      .set('Authorization', `Foo Bearer ${validJwt()}`)
      .send({});
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_001');
  });
});

describe('chain composition: prototype-pollution scrub on a real JSON body', () => {
  it('strips __proto__ keys from the parsed body the handler receives, strings verbatim', async () => {
    let observed: any = null;
    const app = mountStack((req, res) => {
      observed = { keys: Object.keys(req.body), body: req.body, queryKeys: Object.keys(req.query) };
      res.json({ ok: true });
    });

    const response = await request(app)
      .post('/api/widgets?tag=a&constructor=x')
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${validJwt()}`)
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":true},"name":"widget","title":"<b>hi</b>"}');

    expect(response.status).toBe(200);
    expect(observed.keys).toEqual(['name', 'title']);
    // The input layer does NOT HTML-encode.
    expect(observed.body.title).toBe('<b>hi</b>');
    // The query scrub survives to the route handler (Express 5 re-parses req.query per access).
    expect(observed.queryKeys).toEqual(['tag']);
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe('chain composition: errorHandler scrubs 5xx in production', () => {
  it('does not leak handler-thrown error messages or details in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = mountStack(async () => {
      const err: any = new Error('pg: relation "users" does not exist at /app/server/db.ts:42');
      err.statusCode = 500;
      err.details = { query: 'SELECT * FROM users WHERE password = $1' };
      throw err;
    });

    const response = await request(app)
      .post('/api/widgets')
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${validJwt()}`)
      .send({});

    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('Internal server error');
    expect(response.body.error.details).toBeUndefined();
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/relation/);
    expect(body).not.toMatch(/db\.ts/);
    expect(body).not.toMatch(/password/);
    // The correlation id reaches the error body.
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('chain composition: requestId hardening', () => {
  it('echoes a safe client-supplied request id through to the response', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .get('/api/widgets')
      .set('Authorization', `Bearer ${validJwt()}`)
      .set('X-Request-Id', 'corr-abc.123');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('corr-abc.123');
  });

  it('replaces an unsafe client-supplied request id with a generated one', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .get('/api/widgets')
      .set('Authorization', `Bearer ${validJwt()}`)
      .set('X-Request-Id', '<script>alert(1)</script>');
    expect(response.headers['x-request-id']).not.toContain('<');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f]{32}$/);
  });
});
