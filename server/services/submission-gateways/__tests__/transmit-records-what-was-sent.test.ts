/**
 * The transmit guard records what a sequence transmit sends (F1, rows D7 and
 * D2; 2026-11-01).
 *
 * Nothing on record said which leaves a transmit carried: transmit re-assembles
 * and writes no compile, so the filed state was read from compiles, including
 * previews made while the sequence was a draft. The guard now stamps, beside
 * `sentPackage` and after the caller's metadata, the leaf manifest of the
 * package it hands the gateway and the dispatch binding that ties it to the
 * sequence's transmit attempt. The gateway writes both onto the transmittal row
 * before the wire; the fold (ectd/prior-sequence-loader.ts) reads them.
 *
 * A caller can never supply either: a bound transmit's are overwritten, and an
 * unbound transmit's are removed. A bound transmit whose bundle carries no
 * leaf manifest is refused before anything is kept or sent.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const h = vi.hoisted(() => ({
  calls: [] as Array<{ text: string; params: unknown[] }>,
  put: vi.fn(),
}));

// The guard keeps the bytes it sends (sent-package-archive.ts); in memory here.
vi.mock('../../storage', () => ({ getStorageProvider: () => ({ name: 'test', put: h.put }) }));

vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: async (text: string, params: unknown[] = []) => {
      h.calls.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      if (/FROM organization_gateway_accounts/.test(text)) return { rowCount: 0, rows: [] };
      return /INSERT INTO submission_transmittals/.test(text) ? { rowCount: 1, rows: [{ id: 41 }] } : { rowCount: 1, rows: [] };
    },
  },
}));

import { getGateway, refusedBeforeWire } from '../index';
import { FdaEsgGateway } from '../fda-esg';
import { CredentialError, ValidationError, type GatewayTransmitRequest } from '../types';
import { buildLeafManifest } from '../../ectd/sequence-manifest';

const bundle = { path: '', sha256: '', sizeBytes: 0, format: 'ectd' as const };

/** What the packager returns for the one leaf in the package (regional-packager.ts). */
const LEAF_MANIFEST = [{
  ctdSection: '2.2', fileName: 'intro.pdf', href: 'm2/22-intro/intro.pdf', md5: '1'.repeat(32), operation: 'new',
  title: 'Introduction', leafKey: 'doc:intro', leafId: 'leaf-intro', backbone: 'index.xml',
}];

/* The real FDA ESG gateway reads its transport and credentials from FDA_ESG_*
   (fda-esg.ts envFor). The row case relies on none being set: with
   FDA_ESG_STAGING_TRANSPORT=rest the adapter refuses before any row, and with
   a full staging set the real gateway would open a connection. So every one is
   cleared for this file and restored after (F1 review, 2026-11-01). */
const operatorFdaEnv: Record<string, string> = {};
const clearFdaEnv = () => { for (const k of Object.keys(process.env)) if (k.startsWith('FDA_ESG_')) delete process.env[k]; };
afterAll(() => {
  clearFdaEnv();
  Object.assign(process.env, operatorFdaEnv);
});

beforeAll(async () => {
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('FDA_ESG_') && v !== undefined) operatorFdaEnv[k] = v;
  clearFdaEnv();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'sent-leaves-')), 'b.zip');
  await fs.writeFile(p, buf);
  Object.assign(bundle, { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length });
});

beforeEach(() => {
  clearFdaEnv();
  vi.restoreAllMocks();
  h.calls.length = 0;
  h.put.mockReset();
  h.put.mockImplementation(async (o: { bytes: Buffer }) => ({
    vaultFileId: 'vault://7/sent-packages/x', vaultVersionId: 'v-1', sizeBytes: o.bytes.length,
    sha256: createHash('sha256').update(o.bytes).digest('hex'), provider: 'test',
  }));
});

const binding = () => ({
  attemptId: 'a0000000-0000-4000-8000-000000000041', organizationId: 7, sequenceId: 41, signatureActionId: 'sig-1', bundleSha256: bundle.sha256,
});

function request(overrides: Partial<GatewayTransmitRequest> = {}): GatewayTransmitRequest {
  return {
    organizationId: 7, userId: 11, programId: null, packageId: null,
    bundle: { ...bundle, leafManifest: LEAF_MANIFEST },
    environment: 'staging', submissionType: 'original',
    metadata: { applicationId: 'IND123456', sequence: '0000', environment: 'staging' },
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    ...overrides,
  } as GatewayTransmitRequest;
}
const failureOf = (p: Promise<unknown>) => p.then(() => { throw new Error('expected the transmit to reject'); }, (e) => e);
const ok = { transmittalId: 41, transmissionId: 'm-1', status: 'submitted', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' } as never;

describe('a sequence transmit records what it carries, beside where its bytes are kept', () => {
  it('stamps the leaf manifest of the package it hands the gateway, and its binding', async () => {
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue(ok);
    await getGateway('fda', 'esg').transmit(request({ dispatchBinding: binding() }));
    const metadata = (wire.mock.calls[0][0] as GatewayTransmitRequest).metadata!;
    // The stored shape every compile row uses (sequence-manifest.ts), so the fold reads both alike.
    expect(metadata.leafManifest).toEqual(buildLeafManifest(LEAF_MANIFEST));
    expect(metadata.dispatchBinding).toEqual(binding());
    expect(metadata.sentPackage).toMatchObject({ sha256: bundle.sha256 });
  });

  it('a caller cannot supply what was sent: a bound transmit’s are overwritten', async () => {
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue(ok);
    await getGateway('fda', 'esg').transmit(request({
      dispatchBinding: binding(),
      metadata: { applicationId: 'IND123456', sequence: '0000', environment: 'staging',
        leafManifest: [{ ctdSection: '2.5', fileName: 'forged.pdf', href: 'm2/forged.pdf', md5: 'f'.repeat(32) }],
        dispatchBinding: { ...binding(), attemptId: 'f0000000-0000-4000-8000-00000000000f', sequenceId: 99 } },
    }));
    const metadata = (wire.mock.calls[0][0] as GatewayTransmitRequest).metadata!;
    expect(metadata.leafManifest).toEqual(buildLeafManifest(LEAF_MANIFEST));
    expect(metadata.dispatchBinding).toEqual(binding());
  });

  it('and an unbound transmit’s are removed, so nothing reads it as a sequence’s send', async () => {
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue(ok);
    await getGateway('fda', 'esg').transmit(request({
      metadata: { applicationId: 'IND123456', sequence: '0000', environment: 'staging',
        leafManifest: [{ ctdSection: '2.5', fileName: 'forged.pdf', href: 'm2/forged.pdf', md5: 'f'.repeat(32) }],
        dispatchBinding: binding() },
    }));
    const stored = JSON.parse(JSON.stringify((wire.mock.calls[0][0] as GatewayTransmitRequest).metadata));
    expect(stored).not.toHaveProperty('leafManifest');
    expect(stored).not.toHaveProperty('dispatchBinding');
    expect(stored).toMatchObject({ applicationId: 'IND123456', sequence: '0000' });
  });

  it('a sequence transmit with no leaf manifest is refused before anything is kept or sent', async () => {
    const wire = vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue(ok);
    const err = await getGateway('fda', 'esg').transmit(request({ dispatchBinding: binding(), bundle: { ...bundle } })).then(() => null, (e: unknown) => e);
    expect(err, 'the transmit was refused').toBeInstanceOf(ValidationError);
    expect((err as Error).message).toMatch(/nothing records what it would carry, so it is not sent\. Nothing was transmitted\.$/);
    expect(refusedBeforeWire(err)).toBe(true);
    expect(wire).not.toHaveBeenCalled();
    expect(h.put).not.toHaveBeenCalled();
  });

  it('the FDA ESG transmittal row, written before any connection, carries both', async () => {
    // No FDA credentials (cleared above): the gateway writes its row, then
    // refuses at the credential check, before any connection.
    expect(await failureOf(getGateway('fda', 'esg').transmit(request({ dispatchBinding: binding() })))).toBeInstanceOf(CredentialError);
    const insert = h.calls.find((c) => /INSERT INTO submission_transmittals/.test(c.text));
    expect(insert, 'the gateway wrote its transmittal row').toBeDefined();
    const metadata = JSON.parse(String(insert!.params[10]));
    expect(metadata.leafManifest).toEqual(buildLeafManifest(LEAF_MANIFEST));
    expect(metadata.dispatchBinding).toEqual(binding());
    expect(metadata.sentPackage).toMatchObject({ sha256: bundle.sha256 });
  });
});
