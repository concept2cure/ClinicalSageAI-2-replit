/**
 * Integration test for the Module 4 preclinical ingest route.
 *
 * Mocks the ingest service so the test runs without a database or LLM.
 * Verifies fail-closed behaviour, request validation, and the happy path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { ingestStudyMock, ExtractionInputError } = vi.hoisted(() => ({
  ingestStudyMock: vi.fn(),
  ExtractionInputError: class PreclinicalExtractionInputError extends Error {
    constructor(readonly code: string, message: string, readonly coverage?: {
      pageCount: number | null; pagesRead: number | null; limitedBy: string | null;
    }) {
      super(message);
      this.name = 'PreclinicalExtractionInputError';
    }
  },
}));

vi.mock('../../server/services/preclinical/preclinical-extractor', () => ({
  PreclinicalExtractionInputError: ExtractionInputError,
}));

vi.mock('../../server/services/preclinical/preclinical-ingest-service', () => ({
  ingestStudy: (...args: unknown[]) => ingestStudyMock(...args),
  PreclinicalIngestDisabledError: class PreclinicalIngestDisabledError extends Error {
    constructor() {
      super('disabled');
      this.name = 'PreclinicalIngestDisabledError';
    }
  },
}));

async function buildApp(flag: 'on' | 'off', context: Record<string, unknown> = {}): Promise<express.Express> {
  vi.resetModules();
  if (flag === 'on') {
    process.env.PRECLINICAL_INGEST_ENABLED = 'true';
  } else {
    delete process.env.PRECLINICAL_INGEST_ENABLED;
  }
  const mod = await import('../../server/routes/preclinical');
  const app = express();
  app.use((req, _res, next) => { Object.assign(req, context); next(); });
  app.use('/api/preclinical', mod.default);
  return app;
}

const EXTRACTED = {
  studyId: 1234, extractionConfidence: 0.87, model: 'test-model', data: {},
  registration: { status: 'not_requested' },
};
const CONTEXT = { tenantId: 7, userId: 11 };

function uploadStudy(app: express.Express, fields: Record<string, string | undefined> = {}) {
  const pending = request(app).post('/api/preclinical/ingest');
  for (const [key, value] of Object.entries({ programId: '42', ...fields })) {
    if (value !== undefined) pending.field(key, value);
  }
  return pending.attach('file', Buffer.from('%PDF-1.4 fake'), {
    filename: 'study.pdf', contentType: 'application/pdf',
  });
}

beforeEach(() => {
  ingestStudyMock.mockReset();
  ingestStudyMock.mockResolvedValue(EXTRACTED);
});

afterEach(() => {
  delete process.env.PRECLINICAL_INGEST_ENABLED;
});

describe('POST /api/preclinical/ingest', () => {
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
      registration: { status: 'not_requested' },
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
    expect(res.body.data.registration).toEqual({ status: 'not_requested' });
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

describe('POST /api/preclinical/ingest request admission', () => {
  it.each(['42junk', '42.5', '1e2', '+42', '0x2a', '9007199254740992', '0', '-1'])(
    'refuses malformed program ID %s instead of interpreting a numeric prefix', async programId => {
      const res = await uploadStudy(await buildApp('on'), { programId });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PRECLINICAL_INGEST_BAD_PROGRAM_ID');
      expect(ingestStudyMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { governed: 'true' }, { submissionId: '19' }, { iacucProtocolId: '23' },
    { governed: 'true', organizationId: '7', userId: '11' },
  ])('refuses requested registration %j without trusted context before extraction', async fields => {
    const res = await uploadStudy(await buildApp('on'), fields);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_GOVERNANCE_CONTEXT_REQUIRED');
    expect(ingestStudyMock).not.toHaveBeenCalled();
  });

  it.each(['TRUE', 'yes', '1', ''])('refuses malformed governed flag %j instead of silently downgrading', async governed => {
    const res = await uploadStudy(await buildApp('on'), { governed });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_BAD_GOVERNED');
    expect(ingestStudyMock).not.toHaveBeenCalled();
  });

  it('refuses duplicate governed fields instead of silently downgrading', async () => {
    const res = await request(await buildApp('on')).post('/api/preclinical/ingest')
      .field('programId', '42').field('governed', 'true').field('governed', 'false')
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'study.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_BAD_GOVERNED');
    expect(ingestStudyMock).not.toHaveBeenCalled();
  });

  it('accepts an explicit false governed flag as program-only extraction', async () => {
    const res = await uploadStudy(await buildApp('on'), { governed: 'false' });
    expect(res.status).toBe(200);
    expect(res.body.data.registration).toEqual({ status: 'not_requested' });
    expect(ingestStudyMock).toHaveBeenCalledWith(expect.objectContaining({ governance: undefined }));
  });

  it.each([
    { tenantId: 0, userId: 11 }, { tenantId: -7, userId: 11 },
    { tenantId: 7.5, userId: 11 }, { tenantId: '7junk', userId: 11 },
    { tenantId: 7, userId: 0 }, { tenantId: 7, userId: -11 },
    { tenantId: 7, userId: '1e2' }, { tenantId: 7, userId: true },
    { tenantId: 7, userId: 9007199254740992 },
  ])('refuses invalid trusted governance context %j before extraction', async context => {
    const res = await uploadStudy(await buildApp('on', context), { governed: 'true' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PRECLINICAL_INGEST_GOVERNANCE_CONTEXT_REQUIRED');
    expect(ingestStudyMock).not.toHaveBeenCalled();
  });

  it.each([
    ['submissionId', '19junk', 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['submissionId', '19.5', 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['submissionId', '0', 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['submissionId', '-19', 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['submissionId', '9007199254740992', 'PRECLINICAL_INGEST_BAD_SUBMISSION_ID'],
    ['iacucProtocolId', '23junk', 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID'],
    ['iacucProtocolId', '1e2', 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID'],
    ['iacucProtocolId', '0', 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID'],
    ['iacucProtocolId', '-23', 'PRECLINICAL_INGEST_BAD_IACUC_PROTOCOL_ID'],
  ])('refuses malformed %s %s before extraction', async (key, value, code) => {
    const res = await uploadStudy(await buildApp('on', CONTEXT), { governed: 'true', [key]: value });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
    expect(ingestStudyMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/preclinical/ingest registration and refusal outcomes', () => {
  it('passes validated context to registration and reports that review is still required', async () => {
    const registration = {
      status: 'registered', governedStudyId: 77, ctdSection: '4.2.3.2', reviewRequired: true,
    };
    ingestStudyMock.mockResolvedValueOnce({
      ...EXTRACTED, governedStudyId: 77, ctdSection: '4.2.3.2', registration,
    });
    const res = await uploadStudy(await buildApp('on', CONTEXT), {
      governed: 'true', submissionId: '19', iacucProtocolId: '23', reason: 'Intake of study report',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.registration).toEqual(registration);
    expect(ingestStudyMock).toHaveBeenCalledWith(expect.objectContaining({
      governance: { organizationId: 7, userId: 11, submissionId: 19, iacucProtocolId: 23, reason: 'Intake of study report' },
    }));
  });

  it('returns a failed requested registration with the retained study ID and safe message', async () => {
    const registration = { status: 'failed', code: 'PRECLINICAL_GOVERNED_REGISTRATION_FAILED' };
    ingestStudyMock.mockResolvedValueOnce({ ...EXTRACTED, registration });
    const res = await uploadStudy(await buildApp('on', CONTEXT), { governed: 'true', sourcePdfId: 'pdf-retained' });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false, code: 'PRECLINICAL_GOVERNED_REGISTRATION_FAILED',
      error: 'The study extraction was saved, but governed registration was not confirmed.',
      data: { studyId: 1234, sourcePdfId: 'pdf-retained', registration },
    });
    expect(res.body.data.governedStudyId).toBeUndefined();
    expect(res.body.data.ctdSection).toBeUndefined();
  });

  it.each(['PRECLINICAL_NO_TEXT', 'PRECLINICAL_INCOMPLETE_TEXT', 'PRECLINICAL_REPORT_TOO_LARGE'])(
    'maps the typed extraction refusal %s to a safe 422', async code => {
      const coverage = { pageCount: 8, pagesRead: 2, limitedBy: 'time_budget' };
      ingestStudyMock.mockRejectedValueOnce(new ExtractionInputError(code, 'SENTINEL-INTERNAL-PDF-DETAIL', coverage));
      const res = await uploadStudy(await buildApp('on'));
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ success: false, code, coverage });
      expect(res.body.error).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toContain('SENTINEL-INTERNAL');
    },
  );

  it('contains internal error text even when it resembles validation failure', async () => {
    ingestStudyMock.mockRejectedValueOnce(new Error('Invalid database response: expected relation SENTINEL-INTERNAL-TABLE'));
    const res = await uploadStudy(await buildApp('on'));
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      success: false, code: 'PRECLINICAL_INGEST_VALIDATION',
      error: 'The extracted study did not pass validation.',
    });
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-INTERNAL');
  });

  it('contains ordinary server failures without revealing provider or database details', async () => {
    ingestStudyMock.mockRejectedValueOnce(new Error('SENTINEL-INTERNAL-PROVIDER-SECRET'));
    const res = await uploadStudy(await buildApp('on'));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-INTERNAL');
  });
});
