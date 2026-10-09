/**
 * The transmit guard reports what it checked, including checks that failed
 * without blocking.
 *
 * 2026-09-22 (W5/D7). The guard ran evaluatePreTransmit, threw on blockers and
 * dropped everything else: `checks` (e.g. dtd-self-contained passed:false — true
 * of every package while no DTDs are vendored) and `warnings`. A package that
 * failed DTD self-containment transmitted with transmitted:true and no trace in
 * the response or the ECTD_TRANSMITTED audit row.
 */
import { describe, it, expect, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';

vi.mock('../fda-esg', () => ({
  FdaEsgGateway: class {
    region = 'fda';
    gateway = 'esg';
    transport = 'as2';
    async isConfigured() { return true; }
    async transmit() {
      return { transmittalId: 1, transmissionId: 'T-1', status: 'received', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok' };
    }
    async checkStatus() { throw new Error('unused'); }
    async downloadAcknowledgment() { throw new Error('unused'); }
  },
}));

import { getGateway, preTransmitFindings } from '../index';
import type { SubmissionBundle } from '../types';

async function bundle(): Promise<SubmissionBundle> {
  const zip = new JSZip();
  zip.file('index.xml', '<ectd/>');
  zip.file('m2/25/overview.pdf', Buffer.from('%PDF-1.4\ntrailer<</Root 1 0 R>>\n%%EOF\n'));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tx-guard-'));
  const p = path.join(dir, 'bundle.zip');
  await fs.writeFile(p, buf);
  return {
    path: p, sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length, format: 'ectd',
    builtRegion: 'fda',
    dtdStatus: { selfContained: false, missing: ['ich-ectd-3-2.dtd'], missingStylesheets: [] } as never,
  };
}

describe('transmit guard — the result carries what was checked', () => {
  it('returns a failed, non-blocking check and the leaf-security report with the gateway result', async () => {
    const r = await getGateway('fda', 'esg').transmit({
      organizationId: 7, userId: 11, programId: null, packageId: 1, bundle: await bundle(), environment: 'staging',
      authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    });
    expect(r.transmittalId).toBe(1);
    const dtd = r.preTransmit?.checks.find((c) => c.name === 'dtd-self-contained');
    expect(dtd).toMatchObject({ passed: false });
    expect(dtd?.detail).toMatch(/ich-ectd-3-2\.dtd/);
    expect(r.preTransmit?.leafSecurity).toEqual({ pdfEntries: 1, agencyFormsAsIssued: [] });
  });

  // 2026-09-23 (W5/D7, round-2 review): one reduction of that report, exported
  // beside the guard, is what every transmit record carries — the sequence
  // spine's §11.10(e) row and the governed transmit's sign record alike.
  it('reduces to the failed checks and warnings a transmit record carries; null when the guard reported nothing', async () => {
    const r = await getGateway('fda', 'esg').transmit({
      organizationId: 7, userId: 11, programId: null, packageId: 1, bundle: await bundle(), environment: 'staging',
      authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    });
    const f = preTransmitFindings(r);
    expect(f.failedChecks).toEqual(
      expect.arrayContaining([expect.stringMatching(/^dtd-self-contained: missing: ich-ectd-3-2\.dtd/)]),
    );
    expect(f.failedChecks).toHaveLength(r.preTransmit!.checks.filter((c) => !c.passed).length);
    expect(f.warnings).toEqual(r.preTransmit!.warnings);
    // A result the guard attached nothing to is "reported nothing", never "all passed".
    expect(preTransmitFindings({})).toEqual({ failedChecks: null, warnings: null });
  });
});
