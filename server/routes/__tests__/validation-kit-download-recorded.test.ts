/**
 * A validation-kit document is recorded before it is delivered (D5).
 *
 * GET /api/validation-kit/:docId is served at launch (the Admin surface's
 * validation section) and streamed the IQ/OQ/PQ protocols with nothing
 * recorded: no audit row, no hash, no answer to "who took which version of
 * which validation document, and when" — the question a customer's QA is
 * asked about its own CSV file. Found by the recorded-downloads contract
 * (services/export/__tests__/recorded-downloads.contract.test.ts). It now
 * delivers through sendAuditedDownload, the one recorded-download
 * implementation, which writes EXPORT_GENERATED with the SHA-256 of these
 * bytes and delivers nothing when that row does not persist.
 */
import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendAuditedDownload } = vi.hoisted(() => ({
  sendAuditedDownload: vi.fn(async (res: express.Response, input: { buffer: Buffer; filename: string; mimeType: string }) => {
    res.setHeader('Content-Type', input.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${input.filename}"`);
    res.send(input.buffer);
    return { sha256: 'recorded' };
  }),
}));
vi.mock('../../services/export/governedExportConsequence', async (orig) => ({
  ...(await orig<typeof import('../../services/export/governedExportConsequence')>()),
  sendAuditedDownload,
}));

const { default: validationKit } = await import('../validation-kit');

function app(identity: { userId?: number; organizationId?: number } = { userId: 3, organizationId: 7 }) {
  const a = express();
  a.use((req, _res, next) => {
    (req as any).user = { id: identity.userId, organizationId: identity.organizationId };
    next();
  });
  a.use('/api/validation-kit', validationKit);
  return a;
}

const IQ = 'IQ-001-INSTALLATION-QUALIFICATION.md';
const iqBytes = fs.readFileSync(path.join(process.cwd(), 'docs', 'validation', IQ));

beforeEach(() => {
  sendAuditedDownload.mockClear();
});

describe('GET /api/validation-kit/:docId', () => {
  it('records the exact bytes it delivers, under the caller', async () => {
    const catalog = await request(app()).get('/api/validation-kit');
    const iq = catalog.body.artifacts.find((a: { file: string }) => a.file === IQ);
    expect(iq, 'the IQ protocol is in the catalog').toBeTruthy();

    const res = await request(app()).get(`/api/validation-kit/${encodeURIComponent(iq.docId)}`);
    expect(res.status).toBe(200);
    expect(sendAuditedDownload).toHaveBeenCalledTimes(1);
    const input = sendAuditedDownload.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(input).toMatchObject({
      organizationId: 7,
      userId: 3,
      sourceType: 'export_stored_file',
      resourceType: 'validation_kit_document',
      resourceId: iq.docId,
      filename: IQ,
      backendRoute: '/api/validation-kit/:docId',
    });
    expect(Buffer.compare(input.buffer as Buffer, iqBytes)).toBe(0);
    expect(input.metadata).toMatchObject({ version: iq.version, status: iq.status });
  });

  it('delivers nothing when the record cannot be written', async () => {
    sendAuditedDownload.mockRejectedValueOnce(new Error('UNAUDITED_EXPORT_REFUSED: the audit row did not persist'));
    const catalog = await request(app()).get('/api/validation-kit');
    const res = await request(app()).get(`/api/validation-kit/${encodeURIComponent(catalog.body.artifacts[0].docId)}`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('UNAUDITED_EXPORT_REFUSED');
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('refuses a caller with no organisation or no user, and records nothing', async () => {
    const catalog = await request(app()).get('/api/validation-kit');
    const docId = encodeURIComponent(catalog.body.artifacts[0].docId);
    for (const identity of [{ userId: 3 }, { organizationId: 7 }]) {
      const res = await request(app(identity)).get(`/api/validation-kit/${docId}`);
      expect(res.status).toBe(401);
    }
    expect(sendAuditedDownload).not.toHaveBeenCalled();
  });

  it('a document not in the catalog is 404, and nothing is recorded', async () => {
    const res = await request(app()).get('/api/validation-kit/NOT-A-DOC');
    expect(res.status).toBe(404);
    expect(sendAuditedDownload).not.toHaveBeenCalled();
  });
});
