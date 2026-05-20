/**
 * Verifies sendInternalError matches the central errorHandler's
 * production-safety contract: raw error.message stays server-side
 * (logger), client sees only the curated userMessage.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let isProductionFlag = false;
vi.mock('../../config/environment', () => ({
  config: {
    get isProduction() {
      return isProductionFlag;
    },
  },
}));

import { sendInternalError } from '../sendInternalError';

function buildApp(throwIt: () => never) {
  const logger = { error: vi.fn() };
  const app = express();
  app.get('/x', (_req, res) => {
    try {
      throwIt();
    } catch (err) {
      sendInternalError(res, logger, 'Failed to load widget', err);
    }
  });
  return { app, logger };
}

describe('sendInternalError — production', () => {
  beforeEach(() => {
    isProductionFlag = true;
  });

  afterEach(() => {
    isProductionFlag = false;
  });

  it('responds with only the curated userMessage (no raw detail)', async () => {
    const { app } = buildApp(() => {
      throw new Error('column "secret_token" of relation "users" violates not-null constraint');
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load widget' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret_token|not-null/);
  });

  it('logs the raw exception server-side', async () => {
    const { app, logger } = buildApp(() => {
      throw new Error('raw DB error');
    });
    await request(app).get('/x');
    expect(logger.error).toHaveBeenCalledWith('Failed to load widget', { err: 'raw DB error' });
  });

  it('allows overriding the status code (e.g. 503)', async () => {
    const app = express();
    app.get('/x', (_req, res) => {
      try {
        throw new Error('unavailable');
      } catch (err) {
        sendInternalError(res, { error: vi.fn() }, 'Service down', err, 503);
      }
    });
    const res = await request(app).get('/x');
    expect(res.status).toBe(503);
  });

  it('handles non-Error throwables (strings, objects)', async () => {
    const app = express();
    const logger = { error: vi.fn() };
    app.get('/x', (_req, res) => {
      try {
        throw 'plain string';
      } catch (err) {
        sendInternalError(res, logger, 'Failed', err);
      }
    });
    const res = await request(app).get('/x');
    expect(res.body).toEqual({ error: 'Failed' });
    expect(logger.error).toHaveBeenCalledWith('Failed', { err: 'plain string' });
  });
});

describe('sendInternalError — non-production', () => {
  beforeEach(() => {
    isProductionFlag = false;
  });

  it('includes detail in dev for the feedback loop', async () => {
    const { app } = buildApp(() => {
      throw new Error('rich dev detail');
    });
    const res = await request(app).get('/x');
    expect(res.body.error).toBe('Failed to load widget');
    expect(res.body.detail).toBe('rich dev detail');
  });
});
