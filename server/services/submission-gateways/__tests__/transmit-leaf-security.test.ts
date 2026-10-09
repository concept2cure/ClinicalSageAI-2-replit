/**
 * The transmit guard re-reads the signed bundle and refuses a secured PDF leaf,
 * in every environment and for both eCTD formats.
 *
 * 2026-09-22 (W5/D7). Bundles sit on disk between assembly and transmit, and
 * the packager's security gate had holes for as long as those bundles have
 * existed (a trailer at 513-575 KB, a #-escaped /Encrypt, secured bytes under a
 * non-.pdf name). Nothing between the store and the gateway opened the bundle,
 * so such a package went to the agency — including FDA's test environment
 * ('staging'), the one launch row D7 is judged in.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { getGateway } from '../index';
import type { GatewayTransmitRequest, SubmissionBundle } from '../types';
import { generateIndForm } from '../../ind-forms/ind-form-fill-service';

const secured = Buffer.from('%PDF-1.4\ntrailer<</Root 1 0 R/Encr#79pt 5 0 R>>\n%%EOF\n', 'latin1');
const plain = Buffer.from('%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');

async function bundleOf(files: Record<string, Buffer>, format: SubmissionBundle['format']): Promise<SubmissionBundle> {
  const zip = new JSZip();
  zip.file('index.xml', '<ectd/>');
  for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tx-leaf-sec-'));
  const p = path.join(dir, 'bundle.zip');
  await fs.writeFile(p, buf);
  return { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length, format };
}

function request(bundle: SubmissionBundle, environment: 'staging' | 'production'): GatewayTransmitRequest {
  return {
    organizationId: 7, userId: 11, programId: null, packageId: 99, bundle, environment,
    submissionType: 'original', metadata: {},
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
  };
}

describe('transmit guard — leaf security from the signed bundle', () => {
  it('refuses a secured leaf transmitted to FDA\'s test environment (staging)', async () => {
    const b = await bundleOf({ 'm3/32s3/secured.pdf': secured, 'm3/32s1/plain.pdf': plain }, 'ectd');
    await expect(getGateway('fda', 'esg').transmit(request(b, 'staging'))).rejects.toThrow(
      /Refusing to transmit: 1 PDF leaf\/leaves in the signed package are encrypted\/secured: m3\/32s3\/secured\.pdf/,
    );
  });

  it('refuses in production too', async () => {
    const b = await bundleOf({ 'm3/32s3/secured.pdf': secured }, 'ectd');
    await expect(getGateway('fda', 'esg').transmit(request(b, 'production'))).rejects.toThrow(/encrypted\/secured/);
  });

  it('refuses secured PDF bytes under a non-.pdf name', async () => {
    const b = await bundleOf({ 'm5/data/listing.xpt': secured }, 'ectd');
    await expect(getGateway('fda', 'esg').transmit(request(b, 'staging'))).rejects.toThrow(/listing\.xpt/);
  });

  it('covers the PMDA eCTD format', async () => {
    const b = await bundleOf({ 'm3/32s3/secured.pdf': secured }, 'pmda_ectd');
    await expect(getGateway('pmda', 'pmda_gateway').transmit(request(b, 'staging'))).rejects.toThrow(/encrypted\/secured/);
  });

  it('refuses a bundle that cannot be opened, rather than reading it as clear', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tx-leaf-sec-'));
    const buf = Buffer.from('this is not a zip');
    const p = path.join(dir, 'bundle.zip');
    await fs.writeFile(p, buf);
    const b: SubmissionBundle = { path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length, format: 'ectd' };
    await expect(getGateway('fda', 'esg').transmit(request(b, 'staging'))).rejects.toThrow(/could not be opened as a ZIP/);
  });

  it('lets a bundle carrying the official Form FDA 1571 as FDA issued it past the security check', async () => {
    const form = Buffer.from((await generateIndForm('FDA_1571', { sponsorName: 'C2C', indNumber: '162045' } as never)).pdfBytes);
    const b = await bundleOf({ 'm1/us/form-fda-1571.pdf': form, 'm3/32s1/plain.pdf': plain }, 'ectd');
    // It fails later, on credentials this environment does not have — proof the
    // security check passed it on.
    await expect(getGateway('fda', 'esg').transmit(request(b, 'staging'))).rejects.not.toThrow(/encrypted\/secured/);
  });
});

/* Review fix, 2026-09-22: the format label is chosen at assembly, so a package
   labelled 'estar' skipped the check and reached FDA ESG unexamined. Every
   format is judged now; the official eSTAR passes as the FDA form it is. */
describe('transmit guard — every bundle format, eSTAR included', () => {
  it('refuses a secured leaf in a bundle labelled estar', async () => {
    const b = await bundleOf({ 'm3/32s3/secured.pdf': secured }, 'estar');
    await expect(getGateway('fda', 'esg').transmit(request(b, 'staging'))).rejects.toThrow(/encrypted\/secured/);
  });

  it('lets a filled official eSTAR — FDA-secured, as FDA issued it — past the security check', async () => {
    const { fillEstarSubmission } = await import('../../pathway-engines/estar/estar-fill');
    const { readFileSync } = await import('fs');
    const { resolveEstarTemplateDir } = await import('../../pathway-engines/estar/estar-template-registry');
    const template = readFileSync(path.join(resolveEstarTemplateDir(), 'eSTAR-510k-non-ivd.pdf'));
    const r = await fillEstarSubmission({
      type: '510k', variant: 'device', data: { deviceName: 'Acme Monitor', deviceTradeName: 'Acme', applicantName: 'C2C' }, templateBytes: new Uint8Array(template),
    } as never);
    expect(r.filled).toBe(true);
    const b = await bundleOf({ 'eSTAR-510k.pdf': Buffer.from(r.pdfBytes!) }, 'estar');
    await expect(getGateway('fda', 'esg').transmit(request(b, 'staging'))).rejects.not.toThrow(/encrypted\/secured/);
  });
});
