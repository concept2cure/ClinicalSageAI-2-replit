/**
 * Predicate-shadow ops probe tests.
 *
 * Verifies that the unauthenticated /api/_ops/predicate-intelligence/{live,ready,info}
 * endpoints return the expected probe semantics under different config /
 * upstream-availability conditions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

let app: express.Express;
let origToken: string | undefined;
let origShadowUrl: string | undefined;

beforeEach(async () => {
  origToken = process.env.REVIEW_ADMIN_TOKEN;
  origShadowUrl = process.env.SHADOW_SERVICE_URL;
  fetchMock.mockReset();

  vi.resetModules();
  const mod = await import('../../routes/_ops-predicate-shadow');
  app = express();
  app.use('/api/_ops/predicate-intelligence', mod.default);
});

afterEach(() => {
  if (origToken !== undefined) process.env.REVIEW_ADMIN_TOKEN = origToken;
  else delete process.env.REVIEW_ADMIN_TOKEN;
  if (origShadowUrl !== undefined) process.env.SHADOW_SERVICE_URL = origShadowUrl;
  else delete process.env.SHADOW_SERVICE_URL;
});

describe('GET /api/_ops/predicate-intelligence/live', () => {
  it('returns 200 unconditionally', async () => {
    delete process.env.REVIEW_ADMIN_TOKEN;
    delete process.env.SHADOW_SERVICE_URL;
    const res = await request(app).get('/api/_ops/predicate-intelligence/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('live');
  });
});

describe('GET /api/_ops/predicate-intelligence/ready', () => {
  it('returns 503 when REVIEW_ADMIN_TOKEN is missing', async () => {
    delete process.env.REVIEW_ADMIN_TOKEN;
    process.env.SHADOW_SERVICE_URL = 'http://localhost:1';
    fetchMock.mockResolvedValue({ status: 200 });

    const res = await request(app).get('/api/_ops/predicate-intelligence/ready');
    expect(res.status).toBe(503);
    expect(res.body.reasons).toContain('REVIEW_ADMIN_TOKEN missing');
  });

  it('returns 503 when shadow returns 5xx', async () => {
    process.env.REVIEW_ADMIN_TOKEN = 'tok';
    process.env.SHADOW_SERVICE_URL = 'http://localhost:1';
    fetchMock.mockResolvedValue({ status: 500 });

    const res = await request(app).get('/api/_ops/predicate-intelligence/ready');
    expect(res.status).toBe(503);
    expect(res.body.reasons).toEqual(expect.arrayContaining([expect.stringContaining('500')]));
  });

  it('returns 503 when shadow probe rejects', async () => {
    process.env.REVIEW_ADMIN_TOKEN = 'tok';
    process.env.SHADOW_SERVICE_URL = 'http://localhost:1';
    fetchMock.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/_ops/predicate-intelligence/ready');
    expect(res.status).toBe(503);
    expect(res.body.reasons[0]).toContain('connection refused');
  });

  it('returns 200 when token configured and shadow returns 2xx', async () => {
    process.env.REVIEW_ADMIN_TOKEN = 'tok';
    process.env.SHADOW_SERVICE_URL = 'http://localhost:1';
    fetchMock.mockResolvedValue({ status: 200 });

    const res = await request(app).get('/api/_ops/predicate-intelligence/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });
});

describe('GET /api/_ops/predicate-intelligence/info', () => {
  it('reports config without leaking the token value', async () => {
    process.env.REVIEW_ADMIN_TOKEN = 'tok-secret';
    process.env.SHADOW_SERVICE_URL = 'http://localhost:9999';
    const res = await request(app).get('/api/_ops/predicate-intelligence/info');
    expect(res.status).toBe(200);
    expect(res.body.shadowUrl).toBe('http://localhost:9999');
    expect(res.body.adminTokenConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('tok-secret');
  });
});
