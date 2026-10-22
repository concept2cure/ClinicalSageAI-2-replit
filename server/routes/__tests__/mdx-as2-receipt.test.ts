import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getTenantScope, runWithTenantScope } from '../../db/tenantStore';

const h = vi.hoisted(() => ({ ingest: vi.fn(), query: vi.fn(), scan: vi.fn() }));
vi.mock('../../utils/virusScan', () => ({ scanBuffer: h.scan }));
vi.mock('../../db', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn() }, writeChainedAuditRow: vi.fn() }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));
vi.mock('../../services/submission-gateways/fda-esg-receipts', () => ({
  ingestFdaAs2Receipt: h.ingest,
  FdaAs2ReceiptRefusal: class extends Error {
    constructor(readonly code: string, readonly status: number, message: string) { super(message); }
  },
}));

import gateways from '../mdx-submission-gateway';
import { FdaAs2ReceiptRefusal } from '../../services/submission-gateways/fda-esg-receipts';
const app = express();
app.use((req, _res, next) => {
  (req as any).user = { id: 3, organizationId: 7, role: req.get('x-test-role') ?? 'member' };
  runWithTenantScope({ tenantId: '7', orgUuid: '00000000-0000-4000-8000-000000000007', role: (req as any).user.role, source: 'request', caller: 'receipt-route-test' }, next);
});
app.use('/api/mdx', gateways);
const post = (id = '41') => request(app).post(`/api/mdx/gateways/transmittals/${id}/as2-receipt`);
const attach = (r: request.Test) => r.field('contentType', 'multipart/signed; boundary="original-boundary"').attach('receipt', Buffer.from('original signed MDN bytes'), 'agency.mdn');

beforeEach(() => { h.ingest.mockReset(); h.query.mockReset(); h.scan.mockReset(); h.scan.mockResolvedValue({ clean: true, scanned: true }); });

describe('reachable verified FDA AS2 receipt endpoint', () => {
  it('passes exact bytes with authenticated actor/org, restores the original tenant scope after multipart, and returns verified proof', async () => {
    h.ingest.mockImplementation(async () => {
      expect(getTenantScope()).toMatchObject({ tenantId: '7', role: 'member', source: 'request' });
      return { verified: true, recorded: true, status: 'received', duplicate: false, auditTrail: true };
    });
    const response = await attach(post());
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ verified: true, recorded: true, auditTrail: true });
    expect(h.ingest).toHaveBeenCalledWith({ organizationId: 7, userId: 3, transmittalId: 41, body: Buffer.from('original signed MDN bytes'), contentType: 'multipart/signed; boundary="original-boundary"' });
  });

  it('retains the real editor permission gate before accepting a receipt', async () => {
    const response = await attach(post().set('x-test-role', 'viewer'));
    expect(response.status).toBe(403);
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('passes a typed cryptographic or tenant refusal back without a success claim', async () => {
    h.ingest.mockRejectedValue(new FdaAs2ReceiptRefusal('NOT_FOUND', 404, 'Transmittal was not found in this organization.'));
    const response = await attach(post());
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: 'Transmittal was not found in this organization.', details: { code: 'NOT_FOUND' } });
    expect(response.body.data).toBeUndefined();
  });

  it('rejects an invalid transmittal identifier and a missing receipt before verification', async () => {
    expect((await attach(post('41tail'))).status).toBe(422);
    expect((await post().field('contentType', 'multipart/signed')).status).toBe(400);
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('enforces the eight-megabyte multipart bound before verification', async () => {
    const response = await post().field('contentType', 'multipart/signed').attach('receipt', Buffer.alloc(8 * 1024 * 1024 + 1), 'too-large.mdn');
    expect(response.status).toBe(413);
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('refuses executable filenames before receipt verification', async () => {
    const response = await post().field('contentType', 'multipart/signed').attach('receipt', Buffer.from('MZ unsafe executable'), 'agency.exe');
    expect(response.status).toBe(400);
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('runs the canonical malware gate before cryptographic verification', async () => {
    h.scan.mockResolvedValue({ clean: false, scanned: true });
    const response = await attach(post());
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('FILE_SCAN_REJECTED');
    expect(h.scan).toHaveBeenCalledWith(Buffer.from('original signed MDN bytes'));
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('rejects malformed binary CMS without passing it to receipt verification', async () => {
    const response = await post().field('contentType', 'application/pkcs7-mime; smime-type=signed-data').attach('receipt', Buffer.from('MZ falsely declared CMS'), 'agency.p7m');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('FILE_SIGNATURE_MISMATCH');
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('passes a bounded binary SignedData entity through the actual byte and scan gates', async () => {
    const content = Buffer.from('06092a864886f70d010702a0023000', 'hex');
    const der = Buffer.concat([Buffer.from([0x30, content.length]), content]);
    h.ingest.mockResolvedValue({ verified: true, recorded: true, status: 'received' });
    const response = await post().field('contentType', 'application/pkcs7-mime; smime-type=signed-data').attach('receipt', der, 'agency.p7m');
    expect(response.status).toBe(200);
    expect(h.scan).toHaveBeenCalledWith(der);
    expect(h.ingest).toHaveBeenCalledWith(expect.objectContaining({ body: der, contentType: 'application/pkcs7-mime; smime-type=signed-data' }));
  });

  it('retains fail-closed production scanner availability before recording receipt state', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    h.scan.mockResolvedValue({ clean: true, scanned: false });
    try {
      const response = await attach(post());
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('FILE_SCAN_UNAVAILABLE');
      expect(h.ingest).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
});
