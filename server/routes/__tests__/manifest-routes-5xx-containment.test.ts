/**
 * Example-report manifest routes (server/routes/reports/manifest-routes.ts) —
 * a 500 carries the envelope, never the thrower's text (security audit
 * 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * The four handlers answered `message: \`Error fetching …: ${error.message}\``.
 * They read JSON files off the server's disk, so the message is a filesystem
 * path or a JSON parser's report of the file's contents. The router has no
 * importer today; it is held to the rule wherever it is mounted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = "SENTINEL-FS-DETAIL EACCES: permission denied, open '/srv/app/attached_assets/report_index.json'";

const { fsMock, logError } = vi.hoisted(() => ({
  fsMock: { existsSync: vi.fn(), readFileSync: vi.fn() },
  logError: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const patched = { ...actual, existsSync: fsMock.existsSync, readFileSync: fsMock.readFileSync };
  return { ...patched, default: patched };
});
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../reports/manifest-routes';

function app() {
  const a = express();
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-reports-manifest');
    next();
  });
  a.use('/api/reports', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-FS-DETAIL');
  expect(JSON.stringify(res.body)).not.toContain('/srv/app');
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-reports-manifest');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  fsMock.existsSync.mockReturnValue(true);
  fsMock.readFileSync.mockImplementation(() => {
    throw new Error(SENTINEL);
  });
});

describe('report manifest 500s: envelope out, detail to the log', () => {
  it('GET /personas', async () => {
    expectContained(await request(app()).get('/api/reports/personas'));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-FS-DETAIL');
  });

  it('GET /persona/:personaId', async () => {
    expectContained(await request(app()).get('/api/reports/persona/cxo'));
  });

  it('GET /launch-config', async () => {
    expectContained(await request(app()).get('/api/reports/launch-config'));
  });

  it('GET /index', async () => {
    expectContained(await request(app()).get('/api/reports/index'));
  });

  it('leaves the 404 answer unchanged', async () => {
    fsMock.existsSync.mockReturnValue(false);
    const res = await request(app()).get('/api/reports/personas');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Report index not found' });
  });
});
