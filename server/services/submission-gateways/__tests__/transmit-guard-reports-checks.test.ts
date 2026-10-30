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

// The guard keeps the bytes it sends (sent-package-archive.ts); in memory here.
vi.mock('../../storage', async () => (await import('./sent-package-storage-stub')).storageModule);

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

// The guard reads the organisation's gateway-account choice (gateway-accounts.ts,
// 2026-10-01); no row is the platform account. Unstubbed, that read reached the
// tenant-scoped pool and both cases above failed closed before the gateway.
vi.mock('../../../db', () => ({ pool: { query: async () => ({ rows: [], rowCount: 0 }) } }));

import { getGateway, preTransmitFindings, ValidationError } from '../index';
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

  // 2026-10-08 (W5/D7, sweep HS-3): the guard's refusal carried its blockers as
  // bare strings, which a surface reading findings objects dropped — so the
  // refusal read as one with "0 findings" beside a message naming them. Each
  // blocker is now an itemised error finding, and the refusal names its source.
  it('a refusal itemises each blocker as an error finding and names itself as the pre-transmit guard', async () => {
    const assembledForEma = { ...(await bundle()), builtRegion: 'ema' as const };
    const err = await getGateway('fda', 'esg').transmit({
      organizationId: 7, userId: 11, programId: null, packageId: 1, bundle: assembledForEma, environment: 'staging',
      authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as Error).name).toBe('ValidationError');
    expect((err as { code?: string }).code).toBe('PRE_TRANSMIT_BLOCKED');
    expect((err as ValidationError).findings).toEqual([
      { severity: 'error', ruleId: 'PRE-TRANSMIT', message: expect.stringMatching(/assembled for EMA .*cannot be transmitted to FDA/) },
    ]);
    expect((err as Error).message).toMatch(/failed pre-transmit checks/);
  });
});
