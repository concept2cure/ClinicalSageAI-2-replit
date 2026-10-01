/**
 * Example-report subscription routes (server/routes/reports/subscriptions-routes.ts)
 * — a 500 carries the envelope, never the thrower's text (security audit
 * 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * The four handlers answered `message: \`Error …: ${error.message}\``: a
 * filesystem path from the download and preview streams, a TypeError naming
 * the request's internals from the generate and subscribe handlers. The
 * register function has no caller today; it is held to the rule wherever it is
 * wired.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = "SENTINEL-FS-DETAIL EACCES: permission denied, open '/srv/app/lumen_reports_backend/static/x.pdf'";

const { fsMock, logError } = vi.hoisted(() => ({
  fsMock: { existsSync: vi.fn(), createReadStream: vi.fn(), mkdirSync: vi.fn() },
  logError: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const patched = {
    ...actual,
    existsSync: fsMock.existsSync,
    createReadStream: fsMock.createReadStream,
    mkdirSync: fsMock.mkdirSync,
  };
  return { ...patched, default: patched };
});
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import { registerSubscriptionsRoutes } from '../reports/subscriptions-routes';

/** No body parser on purpose: the generate/subscribe handlers then throw a TypeError. */
function app() {
  const a = express();
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-reports-subs');
    next();
  });
  registerSubscriptionsRoutes(a);
  return a;
}

/* Read the raw bytes as text: download and preview set their file Content-Type
   (application/pdf, image/png) before the stream throws, so supertest would
   neither parse the JSON error body nor expose it as `res.text`. */
const asText = (res: any, cb: (err: Error | null, body: string) => void) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => (data += chunk));
  res.on('end', () => cb(null, data));
};

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  const text = String(res.body);
  expect(text).not.toMatch(/SENTINEL-FS-DETAIL|\/srv\/app|Cannot destructure|req\.body/);
  const body = JSON.parse(text);
  expect(body.error).toBe('INTERNAL_ERROR');
  expect(body.correlationId).toBe('req-set-a-reports-subs');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  fsMock.existsSync.mockReturnValue(true);
  fsMock.createReadStream.mockImplementation(() => {
    throw new Error(SENTINEL);
  });
});

describe('report subscription 500s: envelope out, detail to the log', () => {
  it('GET /api/reports/download/:personaId/:filename', async () => {
    expectContained(await request(app()).get('/api/reports/download/cxo/report.pdf').buffer(true).parse(asText));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-FS-DETAIL');
  });

  it('GET /api/reports/preview/:personaId/:imageFile', async () => {
    expectContained(await request(app()).get('/api/reports/preview/cxo/cover.png').buffer(true).parse(asText));
  });

  it('POST /api/reports/generate/:personaId', async () => {
    expectContained(await request(app()).post('/api/reports/generate/cxo').buffer(true).parse(asText));
  });

  it('POST /api/reports/subscribe/:personaId', async () => {
    expectContained(await request(app()).post('/api/reports/subscribe/cxo').buffer(true).parse(asText));
  });

  it('creates no directories when they already exist, and leaves the 404 unchanged', async () => {
    const a = app();
    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
    fsMock.existsSync.mockReturnValue(false);
    const res = await request(a).get('/api/reports/download/cxo/report.pdf');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Report file report.pdf not found for persona cxo' });
  });
});
