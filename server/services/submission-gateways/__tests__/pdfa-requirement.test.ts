/**
 * The PDF/A rule (D7, decided 2026-10-01 under the founder's delegation;
 * evidence docs/evidence/D7/2026-10-01-pdfa-rule/).
 *
 * PDF/A is required only where someone chose it, because every agency here
 * accepts plain PDF 1.4–1.7 as well:
 *   - nobody chose it: a production transmit with plain-PDF leaves goes out;
 *   - the organisation chose it (Admin, Setup): that transmit is refused before
 *     the wire, and the refusal says it was the organisation's own setting;
 *   - the deployment chose it (ECTD_REQUIRE_PDFA): refused, naming the deployment;
 *   - the setting cannot be read, or the organisation row cannot be seen:
 *     refused, never sent as plain PDF;
 *   - only the literal boolean true turns the setting on.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';

const h = vi.hoisted(() => ({
  requirePdfA: undefined as unknown,
  settingsReadFails: false,
  noRow: false,
}));
vi.mock('../../../db', () => ({
  db: {},
  pool: {
    query: async (text: string) => {
      if (/settings->'submission'->'requirePdfA'/.test(text)) {
        if (h.settingsReadFails) throw new Error('connection terminated');
        if (h.noRow) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ require_pdfa: h.requirePdfA ?? null }] };
      }
      return { rowCount: 0, rows: [] };
    },
  },
}));

import { getGateway, refusedBeforeWire } from '../index';
import { FdaEsgGateway } from '../fda-esg';
import type { GatewayTransmitRequest } from '../types';
import { pdfaRequirementFrom, resolvePdfARequirement } from '../../ectd/pdfa-requirement';

const bundle: Record<string, unknown> = { format: 'ectd' };

beforeAll(async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const zip = new JSZip();
  zip.file('0000/m2/22-intro/intro.pdf', pdf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'pdfa-rule-')), 'b.zip');
  await fs.writeFile(p, buf);
  Object.assign(bundle, {
    path: p,
    sha256: createHash('sha256').update(buf).digest('hex'),
    sizeBytes: buf.length,
    // The packager's grade: one PDF leaf, shipped as plain PDF.
    submissionGrade: { total: 1, pdfLeaves: 1, pdfaConverted: 0, notConverted: ['m2/22-intro/intro.pdf'], allPdfA: false, agencyFormsAsIssued: [] },
  });
});

let savedEnv: string | undefined;
beforeEach(() => {
  h.requirePdfA = undefined;
  h.settingsReadFails = false;
  h.noRow = false;
  savedEnv = process.env.ECTD_REQUIRE_PDFA;
  delete process.env.ECTD_REQUIRE_PDFA;
  vi.restoreAllMocks();
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.ECTD_REQUIRE_PDFA;
  else process.env.ECTD_REQUIRE_PDFA = savedEnv;
});

const productionTransmit = (): GatewayTransmitRequest =>
  ({
    organizationId: 7,
    userId: 11,
    programId: null,
    packageId: null,
    bundle,
    environment: 'production',
    submissionType: 'original',
    metadata: { applicationId: 'IND123456', sequence: '0000', environment: 'production' },
    authorization: { kind: 'governed-signature', signatureActionId: 'sig-1', actorUserId: 11 },
  }) as unknown as GatewayTransmitRequest;

const wire = () =>
  vi.spyOn(FdaEsgGateway.prototype, 'transmit').mockResolvedValue({
    transmittalId: 41, transmissionId: 'm-1', status: 'submitted', transport: 'as2', httpStatus: 200, ackReceivedAt: null, message: 'ok',
  } as never);
const failureOf = (p: Promise<unknown>) => p.then(() => { throw new Error('expected the transmit to reject'); }, (e) => e);

describe('the PDF/A rule at the transmit guard', () => {
  it('nobody chose PDF/A: a production transmit with a plain-PDF leaf goes out', async () => {
    const sent = wire();
    await getGateway('fda', 'esg').transmit(productionTransmit());
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("the organisation chose it: refused before the wire, naming the organisation's own setting", async () => {
    h.requirePdfA = true;
    const sent = wire();
    const err = await failureOf(getGateway('fda', 'esg').transmit(productionTransmit()));
    expect(sent).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
    expect(String(err.message)).toMatch(/1 PDF leaf\/leaves are not PDF\/A \(m2\/22-intro\/intro\.pdf\)/);
    expect(String(err.message)).toMatch(/this organisation's own setting requires PDF\/A for its submissions \(Admin, Setup\)/);
    expect(String(err.message)).toMatch(/agency itself also accepts plain PDF 1\.4–1\.7/);
  });

  it('the deployment chose it: refused, naming the deployment, whatever the organisation set', async () => {
    process.env.ECTD_REQUIRE_PDFA = 'true';
    h.requirePdfA = false;
    const sent = wire();
    const err = await failureOf(getGateway('fda', 'esg').transmit(productionTransmit()));
    expect(sent).not.toHaveBeenCalled();
    expect(String(err.message)).toMatch(/this deployment requires PDF\/A for every submission \(ECTD_REQUIRE_PDFA\)/);
  });

  it('the organisation row cannot be seen: refused before the wire, never taken as not required', async () => {
    h.noRow = true;
    const sent = wire();
    const err = await failureOf(getGateway('fda', 'esg').transmit(productionTransmit()));
    expect(sent).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('the setting cannot be read: refused before the wire, never sent as plain PDF', async () => {
    h.settingsReadFails = true;
    const sent = wire();
    const err = await failureOf(getGateway('fda', 'esg').transmit(productionTransmit()));
    expect(sent).not.toHaveBeenCalled();
    expect(refusedBeforeWire(err)).toBe(true);
  });

  it('a test (staging) transmit is never refused for PDF/A', async () => {
    h.requirePdfA = true;
    const sent = wire();
    await getGateway('fda', 'esg').transmit({ ...productionTransmit(), environment: 'staging' } as GatewayTransmitRequest);
    expect(sent).toHaveBeenCalledTimes(1);
  });
});

describe('who requires PDF/A', () => {
  const db = (value: unknown) => ({ query: async () => ({ rows: [{ require_pdfa: value }] }) });

  it('only the literal boolean true turns the organisation setting on', async () => {
    for (const v of ['true', 1, 'yes', null, false, {}]) {
      expect(await resolvePdfARequirement(db(v), 7, {} as NodeJS.ProcessEnv)).toEqual({ required: false, source: null });
    }
    expect(await resolvePdfARequirement(db(true), 7, {} as NodeJS.ProcessEnv)).toEqual({ required: true, source: 'organization' });
  });

  it('the deployment wins when both chose it, without reading the organisation', async () => {
    const never = { query: async () => { throw new Error('not read'); } };
    expect(await resolvePdfARequirement(never, 7, { ECTD_REQUIRE_PDFA: 'true' } as NodeJS.ProcessEnv)).toEqual({ required: true, source: 'deployment' });
    expect(pdfaRequirementFrom({ ECTD_REQUIRE_PDFA: 'true' } as NodeJS.ProcessEnv, true).source).toBe('deployment');
  });
});
