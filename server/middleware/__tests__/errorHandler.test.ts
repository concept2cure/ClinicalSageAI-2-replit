/**
 * Pins the production safety contract on the central error handler:
 *
 *   - 5xx responses MUST NOT echo the raw error.message back to the
 *     client in prod. Internal exceptions routinely contain SQL
 *     fragments, column names, env var names — none of which can reach
 *     a customer browser.
 *   - 4xx responses keep their message only when the error was raised
 *     through our `ApiError` helpers (curated for a user audience).
 *   - In dev, messages echo through unchanged so the feedback loop
 *     works as expected.
 *
 * Without these tests, a future refactor could silently re-introduce
 * the leak that this branch fixes.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the config module so we can flip isProduction per test without
// touching real environment variables.
let isProductionFlag = false;

vi.mock('../../config/environment', () => ({
  config: {
    get isProduction() {
      return isProductionFlag;
    },
  },
}));

import {
  ApiError,
  errorHandler,
  createValidationError,
  createAuthError,
} from '../errorHandler';

function buildApp(thrower: (req: Request, res: Response, next: NextFunction) => void) {
  const app = express();
  app.get('/boom', thrower);
  app.use(errorHandler);
  return app;
}

describe('errorHandler — production', () => {
  beforeEach(() => {
    isProductionFlag = true;
  });

  it('replaces raw 5xx error.message with the generic string', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('duplicate key value violates unique constraint "users_email_idx"'));
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('Internal server error');
    expect(res.body.error.message).not.toMatch(/duplicate key/);
  });

  it('drops error.details on raw 5xx', async () => {
    const app = buildApp((_req, _res, next) => {
      const err: any = new Error('boom');
      err.details = { query: 'SELECT * FROM users WHERE email = $1', binds: ['leaked@test'] };
      next(err);
    });
    const res = await request(app).get('/boom');
    expect(res.body.error.details).toBeUndefined();
  });

  it('keeps the message and details on a 4xx ApiError', async () => {
    const app = buildApp((_req, _res, next) => {
      next(createValidationError('Missing fields', { required: ['email'] }));
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Missing fields');
    expect(res.body.error.details).toEqual({ required: ['email'] });
  });

  it('scrubs message on a 4xx non-ApiError (third-party SDK error surfacing through)', async () => {
    const app = buildApp((_req, _res, next) => {
      const err: any = new Error('Stripe: No such customer cus_xxxxxx');
      err.statusCode = 400;
      next(err);
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Bad request');
    expect(res.body.error.message).not.toMatch(/Stripe|cus_/);
  });

  it('returns the generic 401 message when ApiError code is generic', async () => {
    const app = buildApp((_req, _res, next) => {
      next(createAuthError());
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(401);
    // createAuthError curates the message itself — it should pass through.
    expect(res.body.error.message).toBe('Unauthorized access');
  });

  it('strips raw error message even when statusCode is on the error', async () => {
    const app = buildApp((_req, _res, next) => {
      const err: any = new Error('ECONNREFUSED 10.0.0.5:5432');
      err.statusCode = 503;
      next(err);
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('Internal server error');
    expect(res.body.error.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });

  it('still emits status, code, request metadata for support correlation', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('internal'));
    });
    const res = await request(app).get('/boom');
    expect(res.body.error.status).toBe(500);
    expect(res.body.error.code).toBe('UNKNOWN_ERROR');
    expect(res.body.error.path).toBe('/boom');
    expect(res.body.error.method).toBe('GET');
    expect(res.body.error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('errorHandler — non-production', () => {
  beforeEach(() => {
    isProductionFlag = false;
  });

  afterEach(() => {
    isProductionFlag = false;
  });

  it('echoes raw 5xx error.message in dev (feedback loop)', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('duplicate key value violates unique constraint'));
    });
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toMatch(/duplicate key/);
  });

  it('echoes raw error.details in dev', async () => {
    const app = buildApp((_req, _res, next) => {
      const err: any = new Error('boom');
      err.details = { query: 'SELECT 1' };
      next(err);
    });
    const res = await request(app).get('/boom');
    expect(res.body.error.details).toEqual({ query: 'SELECT 1' });
  });
});

describe('ApiError', () => {
  it('preserves statusCode, code, details', () => {
    const err = new ApiError(422, 'Invalid', 'INVALID', { field: 'email' });
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('INVALID');
    expect(err.details).toEqual({ field: 'email' });
    expect(err.message).toBe('Invalid');
    expect(err).toBeInstanceOf(Error);
  });
});
