import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyPerformanceMiddleware,
  cacheResponse,
  cleanup,
  performanceMonitor,
} from '../enterprise-performance';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  cleanup();
  performanceMonitor.clear();
  delete process.env.ENABLE_PERF_DEBUG_ROUTES;
  process.env.NODE_ENV = originalNodeEnv;
});

describe('cacheResponse', () => {
  it('caches successful GET responses and returns cache hit on repeat request', async () => {
    const app = express();
    let calls = 0;

    app.get('/health', cacheResponse(), (_req, res) => {
      calls += 1;
      res.json({ calls });
    });

    const first = await request(app).get('/health');
    const second = await request(app).get('/health');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(second.headers['x-cache']).toBe('HIT');
    expect(first.body).toEqual({ calls: 1 });
    expect(second.body).toEqual({ calls: 1 });
    expect(calls).toBe(1);
  });

  it('does not cache requests with authorization headers by default', async () => {
    const app = express();
    let calls = 0;

    app.get('/profile', cacheResponse(), (_req, res) => {
      calls += 1;
      res.json({ calls });
    });

    const first = await request(app).get('/profile').set('Authorization', 'Bearer token');
    const second = await request(app).get('/profile').set('Authorization', 'Bearer token');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-cache']).toBeUndefined();
    expect(second.headers['x-cache']).toBeUndefined();
    expect(first.body).toEqual({ calls: 1 });
    expect(second.body).toEqual({ calls: 2 });
    expect(calls).toBe(2);
  });

  it('replays cached status code in addition to response body', async () => {
    const app = express();
    let calls = 0;

    app.get('/partial', cacheResponse(), (_req, res) => {
      calls += 1;
      res.status(206).json({ calls });
    });

    const first = await request(app).get('/partial');
    const second = await request(app).get('/partial');

    expect(first.status).toBe(206);
    expect(second.status).toBe(206);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual({ calls: 1 });
    expect(calls).toBe(1);
  });

  it('does not cache responses that set cookies', async () => {
    const app = express();
    let calls = 0;

    app.get('/session', cacheResponse(), (_req, res) => {
      calls += 1;
      res.cookie('sid', 'abc123').json({ calls });
    });

    const first = await request(app).get('/session');
    const second = await request(app).get('/session');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-cache']).toBeUndefined();
    expect(second.headers['x-cache']).toBeUndefined();
    expect(second.body).toEqual({ calls: 2 });
    expect(calls).toBe(2);
  });

  it('does not cache responses with cache-control private/no-store', async () => {
    const app = express();
    let calls = 0;

    app.get('/private', cacheResponse(), (_req, res) => {
      calls += 1;
      res.setHeader('Cache-Control', 'private, no-store').json({ calls });
    });

    const first = await request(app).get('/private');
    const second = await request(app).get('/private');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers['x-cache']).toBeUndefined();
    expect(second.headers['x-cache']).toBeUndefined();
    expect(second.body).toEqual({ calls: 2 });
    expect(calls).toBe(2);
  });
});

describe('applyPerformanceMiddleware', () => {
  it('does not expose perf debug routes unless explicitly enabled', async () => {
    const app = express();
    applyPerformanceMiddleware(app);

    const response = await request(app).get('/api/perf/stats');
    expect(response.status).toBe(404);
  });

  it('exposes perf debug routes when ENABLE_PERF_DEBUG_ROUTES is true in non-production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_PERF_DEBUG_ROUTES = 'true';

    const app = express();
    applyPerformanceMiddleware(app);

    const response = await request(app).get('/api/perf/stats');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('performance');
    expect(response.body).toHaveProperty('memory');
    expect(response.body).toHaveProperty('cache');
  });
});
