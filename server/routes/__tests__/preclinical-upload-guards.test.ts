/**
 * The preclinical ingest upload is bounded, filtered and byte-checked
 * (security audit 2026-09-24, IAM-14; plan P1-5, D6 upload sweep).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * The route's filter was `cb(null, file.mimetype === 'application/pdf')`: a
 * declared type, which the client chooses, was the only check, and a refused
 * file was dropped silently so the client saw "no file" (400). Nothing looked
 * at the bytes before they went to the extraction model, and no malware scan
 * ran. The size limit (50 MB) was already there.
 *
 * The ingest service and the feature flag are doubles: every case but the
 * control stops at the upload guard, before ingestStudy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { ingestStudy } = vi.hoisted(() => ({
  ingestStudy: vi.fn(async () => ({ studyId: 1, extractionConfidence: 0.9, model: 'double' })),
}));

vi.mock('../../services/preclinical/feature-flags', () => ({
  PRECLINICAL_INGEST_ENABLED: true,
  PRECLINICAL_REVIEWER_ENABLED: false,
}));
vi.mock('../../services/preclinical/preclinical-ingest-service', () => ({
  ingestStudy,
  PreclinicalIngestDisabledError: class PreclinicalIngestDisabledError extends Error {},
}));

import router from '../preclinical';

function app() {
  const a = express();
  a.use('/api/preclinical', router);
  return a;
}

const INGEST = '/api/preclinical/ingest';

beforeEach(() => ingestStudy.mockClear());

describe('POST /api/preclinical/ingest: the upload guard', () => {
  it('refuses a body over the size limit with 413 instead of buffering it', async () => {
    const oversize = Buffer.alloc(51 * 1024 * 1024, 0x41); // 51 MB of "A"
    const r = await request(app())
      .post(INGEST)
      .field('programId', '42')
      .attach('file', oversize, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(r.status, 'an oversize upload was buffered into the heap').toBe(413);
    expect(ingestStudy).not.toHaveBeenCalled();
  });

  it('refuses an executable named file whatever type it declares (415)', async () => {
    const r = await request(app())
      .post(INGEST)
      .field('programId', '42')
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'payload.exe', contentType: 'application/pdf' });
    expect(r.status, 'a .exe declared as application/pdf was admitted').toBe(415);
    expect(ingestStudy).not.toHaveBeenCalled();
  });

  it('refuses a declared type this route does not read (415, not a silent "no file")', async () => {
    const r = await request(app())
      .post(INGEST)
      .field('programId', '42')
      .attach('file', Buffer.from('study text'), { filename: 'study.txt', contentType: 'text/plain' });
    expect(r.status).toBe(415);
    expect(ingestStudy).not.toHaveBeenCalled();
  });

  it('refuses bytes that are not a PDF under a PDF declaration (the shared byte check)', async () => {
    const r = await request(app())
      .post(INGEST)
      .field('programId', '42')
      .attach('file', Buffer.from('this is not a pdf'), { filename: 'study.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, code: 'FILE_SIGNATURE_MISMATCH' });
    expect(ingestStudy).not.toHaveBeenCalled();
  });

  it('leaves a request with no file to the handler (its own NO_FILE code, unchanged)', async () => {
    const r = await request(app()).post(INGEST).field('programId', '42');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PRECLINICAL_INGEST_NO_FILE');
  });

  it('control: a real PDF passes the guard and reaches ingestStudy', async () => {
    const r = await request(app())
      .post(INGEST)
      .field('programId', '42')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'), { filename: 'study.pdf', contentType: 'application/pdf' });
    expect(r.status, `the guard refused a plain PDF: ${JSON.stringify(r.body)}`).toBe(200);
    expect(ingestStudy).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer((ingestStudy.mock.calls[0] as any[])[0].pdfBuffer)).toBe(true);
  });
});
