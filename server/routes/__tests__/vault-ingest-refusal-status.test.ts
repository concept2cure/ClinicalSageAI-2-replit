/**
 * POST /api/vault/ingest — a refused upload is a 4xx, never a 500.
 *
 * ── The defect (VSR-001 F-4, OQ-VAULT-02) ────────────────────────────────────
 * The multer `fileFilter` refused a `.exe` with a bare `Error`, which multer
 * hands to `next(err)`. Nothing between multer and the platform's generic error
 * handler knew what that error meant, so the refusal reached the client as
 *
 *   500 SERVER_ERROR "File type .exe is not allowed"
 *
 * Nothing was stored — integrity held — but the status said the server broke,
 * a client retries a 500, and a validation step that asks "is a disallowed
 * type refused with a 4xx" (URS-VAULT-003) fails.
 *
 * These tests run the router under the SAME generic error handler the app
 * mounts, so the 500 is reproduced faithfully by the pre-fix route and the
 * first test fails against it. The service is mocked: a refusal must happen
 * before any governed write, and a mock that is never called proves it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const ingestVaultDocument = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/orgMembership', () => ({
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../db/tenantStore', () => ({
  runWithTenantScope: (_scope: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../../services/vault/vault-ingest.service', () => ({
  ingestVaultDocument: (...a: unknown[]) => ingestVaultDocument(...a),
}));

import createVaultIngestRoutes from '../vault-ingest';
import { errorHandler } from '../../middleware/errorHandler';

const PROGRAM = '11111111-1111-1111-1111-111111111111';

function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 1, organizationId: 2, role: 'editor' };
    (req as unknown as { tenantId: number }).tenantId = 2;
    next();
  });
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  // The app's own generic handler: whatever the router lets escape lands here
  // and becomes a 500 SERVER_ERROR — exactly what OQ-VAULT-02 recorded.
  a.use(errorHandler);
  return a;
}

const fields = (r: request.Test) =>
  r
    .field('programId', PROGRAM)
    .field('documentCode', 'payload')
    .field('documentTitle', 'OQ-002 disallowed')
    .field('documentType', 'OTHER');

beforeEach(() => {
  ingestVaultDocument.mockReset();
});

describe('POST /api/vault/ingest — refusals are 4xx with a reason, never 500', () => {
  it('refuses a .exe with 400 FILE_TYPE_NOT_ALLOWED and stores nothing (F-4)', async () => {
    const res = await fields(request(app()).post('/api/vault/ingest')).attach(
      'file',
      Buffer.from('MZ\u0000\u0000not-a-document'),
      { filename: 'payload.exe', contentType: 'application/octet-stream' },
    );
    // Pre-fix: 500 { error: { code: 'SERVER_ERROR', message: 'File type .exe is not allowed' } }
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
    expect(res.body.error.message).toMatch(/\.exe/);
    expect(res.body.error.message).toMatch(/\.pdf/); // the reason names what IS accepted
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it('refuses an upload under the wrong field name with 400, not 500 (multer LIMIT_UNEXPECTED_FILE)', async () => {
    const res = await fields(request(app()).post('/api/vault/ingest')).attach(
      'document',
      Buffer.from('%PDF-1.4 fake'),
      { filename: 'protocol.pdf', contentType: 'application/pdf' },
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UPLOAD_INVALID');
    expect(typeof res.body.error.message).toBe('string');
    expect(ingestVaultDocument).not.toHaveBeenCalled();
  });

  it('still admits an allowed type to the governed ingest (the happy path is untouched)', async () => {
    ingestVaultDocument.mockResolvedValueOnce({
      ok: true,
      document: { id: 'doc-1', programId: PROGRAM },
      filing: { placementStatus: 'unfiled' },
    });
    const res = await fields(request(app()).post('/api/vault/ingest')).attach(
      'file',
      Buffer.from('%PDF-1.4 fake'),
      { filename: 'protocol.pdf', contentType: 'application/pdf' },
    );
    expect(res.status).toBe(201);
    expect(ingestVaultDocument).toHaveBeenCalledTimes(1);
    expect(ingestVaultDocument.mock.calls[0][0]).toMatchObject({ programId: PROGRAM, fileName: 'protocol.pdf' });
  });
});
