/**
 * The exact bytes sent to an agency are kept, before they are sent
 * (2026-10-29, W5/D7; CSR path review, transmission row).
 *
 * The transmittal row recorded the package's SHA-256 and a staged path, and
 * transmitSequence then deleted the staged package. A re-assembly gives a
 * different zip, so what was sent could be named by digest but not produced.
 * The guarded transmit now stores the package through the storage provider as
 * its last step before the wire, refuses to send when the copy cannot be kept
 * or does not match, and stamps where it is kept on the request the gateway
 * records, after the caller's metadata.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';

const { order, sent, put } = vi.hoisted(() => ({
  order: [] as string[],
  sent: [] as Array<Record<string, unknown>>,
  put: vi.fn(),
}));

vi.mock('../fda-esg', () => ({
  FdaEsgGateway: class {
    region = 'fda';
    gateway = 'esg';
    transport = 'as2';
    async isConfigured() { return true; }
    async transmit(req: Record<string, unknown>) {
      order.push('wire');
      sent.push(req);
      return { transmittalId: 1, transmissionId: 'T-1', status: 'received', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' };
    }
    async checkStatus() { throw new Error('unused'); }
    async downloadAcknowledgment() { throw new Error('unused'); }
  },
}));
vi.mock('../../../db', () => ({ pool: { query: async () => ({ rows: [], rowCount: 0 }) } }));
vi.mock('../../storage', () => ({ getStorageProvider: () => ({ name: 'test', put }) }));

import { getGateway, refusedBeforeWire, SentPackageNotArchivedError } from '../index';
import type { GatewayTransmitRequest } from '../types';

let bytes: Buffer;
let bundlePath: string;
let sha256: string;

beforeEach(async () => {
  order.length = 0;
  sent.length = 0;
  put.mockReset();
  put.mockImplementation(async (o: { bytes: Buffer }) => {
    order.push('store');
    return { vaultFileId: 'vault://7/sent-packages/x', vaultVersionId: 'v-1', sizeBytes: o.bytes.length,
      sha256: createHash('sha256').update(o.bytes).digest('hex'), provider: 's3' };
  });
  const zip = new JSZip();
  zip.file('index.xml', '<ectd/>');
  zip.file('m5/53-clin-stud-rep/csr.pdf', Buffer.from('%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n'));
  bytes = await zip.generateAsync({ type: 'nodebuffer' });
  bundlePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'sent-pkg-')), 'bundle.zip');
  await fs.writeFile(bundlePath, bytes);
  sha256 = createHash('sha256').update(bytes).digest('hex');
});

const request = (over: Partial<GatewayTransmitRequest> = {}): GatewayTransmitRequest => ({
  organizationId: 7, userId: 11, programId: 'prog-1', packageId: null, environment: 'staging',
  bundle: { path: bundlePath, sha256, sizeBytes: bytes.length, format: 'ectd', builtRegion: 'fda' },
  metadata: { applicationId: 'IND123456', sequence: '0001' },
  authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
  ...over,
} as GatewayTransmitRequest);

const rejection = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a refusal'); }, (e: unknown) => e);

describe('the guarded transmit keeps the bytes it sends', () => {
  it('stores the exact package before the wire, and the gateway records where', async () => {
    const r = await getGateway('fda', 'esg').transmit(request());
    expect(order).toEqual(['store', 'wire']);
    const stored = put.mock.calls[0][0] as { orgId: number; projectId: string; bytes: Buffer; mime: string; metadata: Record<string, string> };
    expect(stored.orgId).toBe(7);
    expect(stored.projectId).toBe('sent-packages');
    expect(stored.bytes.equals(bytes)).toBe(true);
    expect(stored.mime).toBe('application/zip');
    expect(stored.metadata).toMatchObject({ kind: 'sent-package', region: 'fda', gateway: 'esg', environment: 'staging', programId: 'prog-1', sha256 });
    const record = { storageVersionId: 'v-1', provider: 's3', sha256, sizeBytes: bytes.length, filename: `fda-esg-${sha256}.zip` };
    expect((sent[0].metadata as Record<string, unknown>).sentPackage).toEqual(record);
    expect(r.sentPackage).toEqual(record);
  });

  it('a caller cannot say where the bytes are kept', async () => {
    await getGateway('fda', 'esg').transmit(request({
      metadata: { applicationId: 'IND123456', sequence: '0001', sentPackage: { storageVersionId: 'forged', provider: 'local', sha256: 'f'.repeat(64), sizeBytes: 1, filename: 'x.zip' } },
    }));
    expect((sent[0].metadata as { sentPackage: { storageVersionId: string } }).sentPackage.storageVersionId).toBe('v-1');
  });

  it('sends nothing when the copy cannot be stored, and the refusal releases the claim', async () => {
    put.mockRejectedValueOnce(new Error('bucket unavailable'));
    const err = await rejection(getGateway('fda', 'esg').transmit(request()));
    expect(err).toBeInstanceOf(SentPackageNotArchivedError);
    expect((err as Error).message).toMatch(/^Nothing was sent/);
    expect(sent).toHaveLength(0);
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('sends nothing when the stored copy is not the signed package', async () => {
    put.mockResolvedValueOnce({ vaultFileId: 'x', vaultVersionId: 'v-2', sizeBytes: bytes.length, sha256: '0'.repeat(64), provider: 's3' });
    const err = await rejection(getGateway('fda', 'esg').transmit(request()));
    expect(err).toBeInstanceOf(SentPackageNotArchivedError);
    expect(sent).toHaveLength(0);
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('stores nothing for a transmit the guard refuses first', async () => {
    const err = await rejection(getGateway('fda', 'esg').transmit(request({ authorization: undefined as never })));
    expect((err as Error).name).toBe('TransmitAuthorizationError');
    expect(put).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('stores nothing when the package on disk is not the signed one', async () => {
    await fs.writeFile(bundlePath, Buffer.concat([bytes, Buffer.from('x')]));
    const err = await rejection(getGateway('fda', 'esg').transmit(request()));
    expect((err as Error).name).toBe('ValidationError');
    expect(put).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});
