/**
 * Integration test for the Module 4 preclinical ingest route.
 *
 * Mocks the ingest service so the test runs without a database or LLM.
 * Verifies fail-closed behaviour, request validation, and the happy path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ingestStudyMock = vi.fn();

vi.mock('../../server/services/preclinical/preclinical-ingest-service', () => ({
  ingestStudy: (...args: unknown[]) => ingestStudyMock(...args),
  PreclinicalIngestDisabledError: class PreclinicalIngestDisabledError extends Error {
    constructor() {
      super('disabled');
      this.name = 'PreclinicalIngestDisabledError';
    }
  },
}));

async function buildApp(flag: 'on' | 'off'): Promise<express.Express> {
  vi.resetModules();
  if (flag === 'on') {
    process.env.PRECLINICAL_INGEST_ENABLED = 'true';
  } else {
    delete process.env.PRECLINICAL_INGEST_ENABLED;
  }
  const mod = await import('../../server/routes/preclinical');
  const app = express();
  app.use('/api/preclinical', mod.default);
  return app;
}

describe('POST /api/preclinical/ingest', () => {
  beforeEach(() => {
    ingestStudyMock.mockReset();
  });

  afterEach(() => {
    delete process.env.PRECLINICAL_INGEST_ENABLED;
  });

  it('returns 503 when PRECLINICAL_INGEST_ENABLED is unset', async () => {
    const app = await buildApp('off');
    const res = await request(app)
      .post('/api/preclinical/ingest')
      .field('programId', '42')
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'study.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_DISABLED');
    expect(ingestStudyMock).not.toHaveBeenCalled();
  });

  it('returns 400 when programId is missing or not a positive integer', async () => {
    const app = await buildApp('on');
    const res = await request(app)
      .post('/api/preclinical/ingest')
      .field('programId', 'not-a-number')
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'study.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_BAD_PROGRAM_ID');
  });

  it('returns 400 when no file is attached', async () => {
    const app = await buildApp('on');
    const res = await request(app)
      .post('/api/preclinical/ingest')
      .field('programId', '42');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_NO_FILE');
  });

  it('returns 200 + studyId when ingestion succeeds', async () => {
    ingestStudyMock.mockResolvedValueOnce({
      studyId: 1234,
      extractionConfidence: 0.87,
      model: 'claude-opus-4-7',
      data: {},
    });
    const app = await buildApp('on');
    const res = await request(app)
      .post('/api/preclinical/ingest')
      .field('programId', '42')
      .field('sourcePdfId', 'pdf-abc-123')
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'study.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.studyId).toBe(1234);
    expect(res.body.data.sourcePdfId).toBe('pdf-abc-123');
    expect(res.body.data.extractionConfidence).toBeCloseTo(0.87);
    expect(res.body.data.model).toBe('claude-opus-4-7');
    expect(ingestStudyMock).toHaveBeenCalledTimes(1);
    const arg = ingestStudyMock.mock.calls[0][0];
    expect(arg.programId).toBe(42);
    expect(arg.sourcePdfId).toBe('pdf-abc-123');
    expect(Buffer.isBuffer(arg.pdfBuffer)).toBe(true);
  });

  it('maps Zod-style validation errors to 422', async () => {
    ingestStudyMock.mockRejectedValueOnce(new Error('Invalid studyType: expected enum value'));
    const app = await buildApp('on');
    const res = await request(app)
      .post('/api/preclinical/ingest')
      .field('programId', '42')
      .attach('file', Buffer.from('%PDF-1.4 fake'), {
        filename: 'study.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_VALIDATION');
  });
});
