/**
 * Public /readyz is cheap and says only whether the task is ready (MR-03 Stage 7, OPS-22).
 *
 * It is mounted before rate limiting and is reachable through CloudFront. Each hit used to run
 * a database query, a Vault-store probe and a scanner ping, and to answer anyone with every
 * dependency's state. Now:
 *  - the database query and the store probe run at most once per READYZ_CACHE_MS, and concurrent
 *    hits share them; in-memory state (schema, AnA) is read on every hit;
 *  - in production, the body is { ready } alone for an outside caller without READYZ_TOKEN;
 *  - the status code is the same for every caller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const probe = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../services/storage', () => ({
  getStorageProvider: () => ({
    name: 's3',
    isAvailable: async () => {
      probe.calls++;
      return true;
    },
  }),
}));

import type { Request } from 'express';
import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import { readyzShowsDetail } from '../readyz';
import { setSchemaReadiness } from '../readiness-state';
import { setAnaReadiness } from '../ana-readiness-state';

const ENV_KEYS = ['NODE_ENV', 'READYZ_CACHE_MS', 'READYZ_TOKEN', 'CLAMAV_HOST', 'REDIS_URL', 'REDIS_TLS_URL'] as const;
let saved: Record<string, string | undefined> = {};
let queries = 0;
const countingPool = {
  query: async () => {
    queries++;
    return { rows: [{ '?column?': 1 }] };
  },
} as never;

function appWithHealth() {
  const app = express();
  mountFastPathHealthEndpoints(app, countingPool);
  return app;
}

function fakeRequest(peer: string, token?: string): Request {
  return {
    socket: { remoteAddress: peer },
    get: (name: string) => (name.toLowerCase() === 'x-readyz-token' ? token : undefined),
  } as unknown as Request;
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ['READYZ_CACHE_MS', 'READYZ_TOKEN', 'CLAMAV_HOST', 'REDIS_URL', 'REDIS_TLS_URL']) delete process.env[k];
  process.env.NODE_ENV = 'development';
  setSchemaReadiness('ready');
  setAnaReadiness('ready', 'test fixture: AnA provider pinned healthy');
  queries = 0;
  probe.calls = 0;
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('/readyz round-trip cache (OPS-22)', () => {
  it('runs one database query and one store probe for repeated hits inside the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    const app = appWithHealth();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(200);
    }
    expect(queries).toBe(1);
    expect(probe.calls).toBe(1);

    vi.setSystemTime(new Date('2026-11-10T12:00:05Z'));
    await request(app).get('/readyz');
    expect(queries).toBe(2);
    expect(probe.calls).toBe(2);
  });

  it('shows a change in in-memory state on the next hit, inside the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    const app = appWithHealth();
    setAnaReadiness('no_provider', 'test fixture: no provider');
    expect((await request(app).get('/readyz')).status).toBe(503);
    setAnaReadiness('ready', 'test fixture: provider back');
    vi.setSystemTime(new Date('2026-11-10T12:00:01Z'));
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.anaState).toBe('ready');
    expect(queries).toBe(1);
  });

  it('shares one computation between concurrent hits', async () => {
    const app = appWithHealth();
    const all = await Promise.all(Array.from({ length: 10 }, () => request(app).get('/readyz')));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(queries).toBe(1);
  });

  it('never holds a verdict longer than 10 s, whatever READYZ_CACHE_MS says', async () => {
    process.env.READYZ_CACHE_MS = '600000';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    const app = appWithHealth();
    await request(app).get('/readyz');
    vi.setSystemTime(new Date('2026-11-10T12:00:10Z'));
    await request(app).get('/readyz');
    expect(queries).toBe(2);
  });

  it('computes every hit when READYZ_CACHE_MS is 0', async () => {
    process.env.READYZ_CACHE_MS = '0';
    const app = appWithHealth();
    await request(app).get('/readyz');
    await request(app).get('/readyz');
    expect(queries).toBe(2);
  });
});

describe('/readyz detail is for the task and its operators, not the public (OPS-22)', () => {
  it('in production, an outside caller without the token gets the verdict and nothing else', () => {
    process.env.NODE_ENV = 'production';
    process.env.READYZ_TOKEN = 'r'.repeat(40);
    expect(readyzShowsDetail(fakeRequest('10.10.101.17'))).toBe(false);
    expect(readyzShowsDetail(fakeRequest('10.10.101.17', 'wrong-token-of-another-length'))).toBe(false);
    expect(readyzShowsDetail(fakeRequest('10.10.101.17', 's'.repeat(40)))).toBe(false);
  });

  it('in production, the token holder and a loopback peer get the detail', () => {
    process.env.NODE_ENV = 'production';
    process.env.READYZ_TOKEN = 'r'.repeat(40);
    expect(readyzShowsDetail(fakeRequest('10.10.101.17', 'r'.repeat(40)))).toBe(true);
    expect(readyzShowsDetail(fakeRequest('127.0.0.1'))).toBe(true);
    expect(readyzShowsDetail(fakeRequest('::1'))).toBe(true);
    expect(readyzShowsDetail(fakeRequest('::ffff:127.0.0.1'))).toBe(true);
  });

  it('a short or unset READYZ_TOKEN admits no one by token', () => {
    process.env.NODE_ENV = 'production';
    process.env.READYZ_TOKEN = 'short';
    expect(readyzShowsDetail(fakeRequest('10.10.101.17', 'short'))).toBe(false);
    delete process.env.READYZ_TOKEN;
    expect(readyzShowsDetail(fakeRequest('10.10.101.17', ''))).toBe(false);
  });

  it('outside production the detail is always shown (the Codespace and the doctor read it)', () => {
    process.env.NODE_ENV = 'development';
    expect(readyzShowsDetail(fakeRequest('10.10.101.17'))).toBe(true);
  });

  it('the public body is the verdict alone, with the same status', async () => {
    process.env.NODE_ENV = 'production';
    setSchemaReadiness('unknown');
    const app = express();
    // The peer of a supertest request is loopback; this stands in for one arriving through the ALB.
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', { value: '10.10.101.17', configurable: true });
      next();
    });
    mountFastPathHealthEndpoints(app, countingPool);
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ready: false });
  });
});
