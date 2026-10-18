/**
 * /readyz says the scanner is down when the scanner check throws (MR-08).
 *
 * pingClamd promises never to reject, but a malformed CLAMAV_PORT once made it
 * reject, and /readyz then answered a bare 500 with no dependency map. The
 * endpoint no longer relies on that promise: whatever the scanner check
 * throws, readiness reports `virusScan: 'down'` (503). The ping itself is
 * replaced here by one that rejects, so this pins the endpoint's own guard,
 * independent of the client fix (readyz-virus-scan.test.ts covers that).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../services/storage', () => ({
  getStorageProvider: () => ({ name: 's3', isAvailable: async () => true }),
}));
vi.mock('../../utils/virusScan', () => ({
  pingClamdCached: () => Promise.reject(new RangeError('Port should be >= 0 and < 65536')),
}));

import { mountFastPathHealthEndpoints } from '../inline-endpoints';
import { setSchemaReadiness } from '../readiness-state';
import { setAnaReadiness } from '../ana-readiness-state';

const okPool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as never;
const ENV_KEYS = ['NODE_ENV', 'CLAMAV_HOST', 'REDIS_URL', 'REDIS_TLS_URL'] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  delete process.env.REDIS_URL;
  delete process.env.REDIS_TLS_URL;
  setSchemaReadiness('ready');
  setAnaReadiness('ready', 'test fixture: AnA provider pinned healthy');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('/readyz when the scanner check throws', () => {
  it('answers 503 with virusScan down, not a bare 500', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLAMAV_HOST = '127.0.0.1';
    const app = express();
    mountFastPathHealthEndpoints(app, okPool);
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.dependencies.virusScan).toBe('down');
    expect(res.body.dependencies.database).toBe('ok');
  });
});
