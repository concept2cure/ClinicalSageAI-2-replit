/**
 * Predictive section suggestions — a 500 carries the envelope, never the
 * thrower's text (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * suggestions / analyze-document / update-context / completion-status answered
 * `{ error, message: error.message }`. The suggestion service calls the model
 * gateway and reads stored section patterns, so the message is provider or
 * driver text in practice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-DB-DETAIL relation "section_patterns" does not exist';

const { getSectionSuggestions, logError } = vi.hoisted(() => ({
  getSectionSuggestions: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../services/predictiveSectionService', () => ({ default: { getSectionSuggestions } }));
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({ execute: vi.fn(async () => ({ rows: [] })) }) }));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});

import router from '../predictive-sections';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, res, next) => {
    res.setHeader('X-Request-Id', 'req-set-a-predsec');
    (req as any).user = { id: 2, organizationId: 7 };
    next();
  });
  a.use('/api/predictive-sections', router);
  return a;
}

function expectContained(res: request.Response) {
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('SENTINEL-DB-DETAIL');
  expect(JSON.stringify(res.body)).not.toMatch(/section_patterns|does not exist/);
  expect(res.body.error).toBe('INTERNAL_ERROR');
  expect(res.body.correlationId).toBe('req-set-a-predsec');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getSectionSuggestions.mockRejectedValue(new Error(SENTINEL));
});

describe('predictive-sections 500s: envelope out, detail to the log', () => {
  it('POST /suggestions', async () => {
    expectContained(
      await request(app())
        .post('/api/predictive-sections/suggestions')
        .send({ documentType: 'CSR', submissionType: 'IND' }),
    );
    expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-DB-DETAIL');
  });

  it('POST /analyze-document', async () => {
    expectContained(
      await request(app()).post('/api/predictive-sections/analyze-document').send({ documentContent: 'x' }),
    );
  });

  it('POST /update-context', async () => {
    expectContained(
      await request(app())
        .post('/api/predictive-sections/update-context')
        .send({ documentId: 'd1', updates: { documentType: 'CSR' } }),
    );
  });

  it('GET /completion-status/:submissionType', async () => {
    expectContained(await request(app()).get('/api/predictive-sections/completion-status/IND?existingSections=2.5'));
  });

  it('leaves the 400 answer unchanged', async () => {
    const res = await request(app()).post('/api/predictive-sections/suggestions').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Document type and submission type are required' });
  });
});
