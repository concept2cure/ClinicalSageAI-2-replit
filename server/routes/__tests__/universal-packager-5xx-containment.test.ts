/**
 * Universal packager — a 500 carries the envelope, never the thrower's text
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * generate / download / multi-download answered `{ success: false, error:
 * err.message }`. The packager renders through PDFKit, docx, ExcelJS and
 * archiver and writes temporary files, so the text is a library's internals or
 * a filesystem path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = "SENTINEL-FS-DETAIL ENOSPC: no space left on device, write '/tmp/packager-7f3a/out.docx'";

const { packageDeliverable, logError } = vi.hoisted(() => ({
  packageDeliverable: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../services/universal-packager', () => ({ packageDeliverable, packageSingleFormat: vi.fn() }));
vi.mock('../../utils/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger.js')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../universal-packager';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-packager');
    next();
  });
  a.use('/api/packager', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-FS-DETAIL|ENOSPC|\/tmp\/packager/);
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-packager');
}

const BODY = { title: 'T', content: 'C', formats: ['pdf'] };

beforeEach(() => {
  vi.clearAllMocks();
  packageDeliverable.mockRejectedValue(new Error(SENTINEL));
});

describe('packager 500s: envelope out, detail to the log', () => {
  it('POST /generate', async () => {
    expectContained(await request(app()).post('/api/packager/generate').send(BODY));
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-FS-DETAIL');
  });

  it('POST /download/:format', async () => {
    expectContained(await request(app()).post('/api/packager/download/pdf').send(BODY));
  });

  it('POST /multi-download', async () => {
    expectContained(await request(app()).post('/api/packager/multi-download').send(BODY));
  });

  it('leaves the 400 answers unchanged', async () => {
    const res = await request(app()).post('/api/packager/generate').send({ title: 'T', content: 'C', formats: ['exe'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Invalid formats: exe/);
  });
});
