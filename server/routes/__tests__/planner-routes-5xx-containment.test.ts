/**
 * Planner routes — a 500 carries the envelope, never the thrower's text
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * The three generate-* handlers and the shared PDF export answered
 * `{ success: false, error: error.message }`. The export writes to the server's
 * exports directory, so its failure text is a filesystem path; the generate
 * handlers' outer catch receives whatever the prompt assembly throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = "SENTINEL-FS-DETAIL EACCES: permission denied, open '/srv/app/exports/sap_x.pdf'";

const { pdfCtor, analyzeText, logError } = vi.hoisted(() => ({
  pdfCtor: vi.fn(),
  analyzeText: vi.fn(),
  logError: vi.fn(),
}));

// PDFKit throws on construction, before any file is opened — the export's
// 500 path, without writing to the real exports directory.
vi.mock('pdfkit', () => ({
  default: function PDFDocument(...args: unknown[]) {
    return pdfCtor(...args);
  },
}));
vi.mock('../../openai-service', () => ({ analyzeText }));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../planner-routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-planner');
    next();
  });
  a.use('/api/planner', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-');
  expect(JSON.stringify(res.body)).not.toContain('/srv/app/exports');
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-planner');
}

/** A csrContext whose every field read throws: drives the generate-* outer catch. */
const poisonedContext = (): Record<string, unknown> =>
  new Proxy(
    {},
    {
      get() {
        throw new Error('SENTINEL-CTX-DETAIL relation "csr_semantic_index" does not exist');
      },
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  pdfCtor.mockImplementation(() => {
    throw new Error(SENTINEL);
  });
});

describe('planner 500s: envelope out, detail to the log', () => {
  for (const path of ['/export-sap', '/export-ind', '/export-summary']) {
    it(`POST ${path}`, async () => {
      expectContained(await request(app()).post(`/api/planner${path}`).send({ content: 'x', sessionId: 's1' }));
      expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-FS-DETAIL');
    });
  }

  for (const path of ['/generate-ind', '/generate-sap', '/generate-summary']) {
    it(`POST ${path}`, async () => {
      // JSON cannot carry a getter, so the poisoned context is handed to the
      // handler directly through a pre-parsed body.
      const a = express();
      a.use((req, res, next) => {
        res.setHeader('X-Request-Id', 'req-set-a-planner');
        (req as any).body = { protocol: 'P', sessionId: 's1', csrContext: poisonedContext() };
        next();
      });
      a.use('/api/planner', router);
      expectContained(await request(a).post(`/api/planner${path}`));
      expect(analyzeText).not.toHaveBeenCalled();
    });
  }

  it('leaves the 400 answers unchanged', async () => {
    const res = await request(app()).post('/api/planner/export-sap').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Content is required for PDF export' });
  });
});
