/**
 * Integration tests for the hardened middleware chain.
 *
 * Each unit test in this directory pins one module's behavior. These
 * integration tests pin behavior of the COMPOSITION — they would have caught
 * the sanitizeInput-before-body-parser ordering bug, which no per-module
 * unit test could expose. They also lock in the cross-cutting contract
 * (subjectless JWT rejection, scrubbed 5xx responses in production, validated
 * request ids) so a future reshuffle of the stack can't silently reintroduce
 * the same gaps.
 *
 * Order under test mirrors production:
 *   cookieParser → requestId → csrfProtection → express.json
 *     → sanitizeInput → authenticateToken (route) → handler
 *     → errorHandler (last)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

vi.mock('../../config/environment', () => ({
  config: { jwt: { secret: 'integration-test-secret-32-bytes-long!!!!', expiresIn: '1d' } },
}));

import { csrfProtection } from '../csrf';
import { authenticateToken } from '../auth';
import { sanitizeInput, requestId } from '../enterprise-security';
import { errorHandler, asyncHandler } from '../errorHandler';

const SECRET = 'integration-test-secret-32-bytes-long!!!!';
const ORIGINAL_ENV = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

function mountStack(handler: express.RequestHandler) {
  const app = express();
  app.use(cookieParser());
  app.use(requestId);
  app.use(csrfProtection);
  app.use(express.json());
  app.use(sanitizeInput);
  app.post('/api/widgets', authenticateToken, handler);
  app.get('/api/widgets', authenticateToken, handler);
  app.use(errorHandler);
  return app;
}

function validJwt(payload: object) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256' });
}

/**
 * Seed a request with a valid CSRF cookie + matching X-CSRF-Token header,
 * captured from a prior GET. Returns a function that applies them to a
 * supertest Test object.
 */
async function getCsrfCredentials(app: express.Express) {
  const seed = await request(app).get('/api/widgets').set('Authorization', `Bearer ${validJwt({ userId: 42 })}`);
  const cookieHeader = seed.headers['set-cookie']?.[0] || '';
  const csrfToken = /csrf_token=([^;]+)/.exec(cookieHeader)?.[1];
  if (!csrfToken) throw new Error('Failed to extract csrf token from seed response');
  return csrfToken;
}

describe('chain composition: CSRF gates state-changing requests before auth', () => {
  it('rejects POST with no CSRF token (CSRF runs first)', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app).post('/api/widgets').send({});
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CSRF_VALIDATION_FAILED');
  });

  it('rejects POST with auth but no CSRF token', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const token = validJwt({ userId: 42 });
    const response = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(403);
  });
});

describe('chain composition: auth rejects subjectless / malformed JWTs', () => {
  it('rejects a JWT with no subject claim even when CSRF is satisfied', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const csrfToken = await getCsrfCredentials(app);
    const subjectless = validJwt({ email: 'x@example.com' });

    const response = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Bearer ${subjectless}`)
      .set('Cookie', `csrf_token=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_007');
  });

  it('rejects a malformed Authorization header that the old replace() would have mangled', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const csrfToken = await getCsrfCredentials(app);

    const response = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Foo Bearer ${validJwt({ userId: 42 })}`)
      .set('Cookie', `csrf_token=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTH_001');
  });
});

describe('chain composition: prototype-pollution scrub on a real JSON body', () => {
  it('strips __proto__ keys from the parsed body the handler receives', async () => {
    let observedBody: any = null;
    const app = mountStack((req, res) => {
      observedBody = req.body;
      res.json({ ok: true });
    });

    const csrfToken = await getCsrfCredentials(app);
    const token = validJwt({ userId: 42 });

    const response = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `csrf_token=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":true},"name":"widget","title":"<b>hi</b>"}');

    expect(response.status).toBe(200);
    expect(observedBody.polluted).toBeUndefined();
    // Strings pass through verbatim — the input layer does NOT HTML-encode.
    expect(observedBody.name).toBe('widget');
    expect(observedBody.title).toBe('<b>hi</b>');
    // Global Object.prototype must remain unpolluted.
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe('chain composition: errorHandler scrubs 5xx in production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('does not leak handler-thrown error messages or details in production', async () => {
    const app = mountStack(
      asyncHandler(async () => {
        const err: any = new Error(
          'pg: relation "users" does not exist at /app/server/db.ts:42'
        );
        err.statusCode = 500;
        err.details = { query: 'SELECT * FROM users WHERE password = $1' };
        throw err;
      })
    );

    const csrfToken = await getCsrfCredentials(app);
    const token = validJwt({ userId: 42 });

    const response = await request(app)
      .post('/api/widgets')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', `csrf_token=${csrfToken}`)
      .set('X-CSRF-Token', csrfToken)
      .send({});

    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('Internal server error');
    expect(response.body.error.details).toBeUndefined();
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/relation/);
    expect(body).not.toMatch(/db\.ts/);
    expect(body).not.toMatch(/password/);
  });
});

describe('chain composition: requestId hardening', () => {
  it('echoes a safe client-supplied request id through to the response', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .get('/api/widgets')
      .set('Authorization', `Bearer ${validJwt({ userId: 42 })}`)
      .set('X-Request-Id', 'corr-abc.123');
    expect(response.headers['x-request-id']).toBe('corr-abc.123');
  });

  it('replaces an unsafe client-supplied request id with a generated one', async () => {
    const app = mountStack((_req, res) => res.json({ ok: true }));
    const response = await request(app)
      .get('/api/widgets')
      .set('Authorization', `Bearer ${validJwt({ userId: 42 })}`)
      .set('X-Request-Id', '<script>alert(1)</script>');
    expect(response.headers['x-request-id']).not.toContain('<');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f]{32}$/);
  });
});
