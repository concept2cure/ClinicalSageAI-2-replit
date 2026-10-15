/**
 * A compliance report leaves sealed: a version-2 manifest over the exact bytes
 * of the data, signed by the ONE audit export signer (signedAuditExport.ts
 * sealManifestV2), so the existing verifier — and POST /api/audit/export/verify —
 * checks it, and a one-byte change to the data fails.
 */
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { stableStringify } from '../../../../../shared/canonical-json';
import { sealManifestV2, sha256Hex, verifySignedAuditExport } from '../../signedAuditExport';
import { buildSignedReport } from '../signed-report';
import type { ReportData } from '../types';

const KEY = 'k'.repeat(48);
const saved = { ...process.env };

beforeEach(() => {
  process.env.AUDIT_EXPORT_SIGNING_KEY = KEY;
  process.env.AUDIT_EXPORT_SIGNING_KEY_ID = 'k-test';
});
afterEach(() => {
  process.env = { ...saved };
});

const data: ReportData = {
  report: { id: 'electronic-signatures', title: 'Electronic signature register', version: 1 },
  organizationId: 7,
  period: { from: '2026-09-01', to: '2026-09-30', kind: 'range' },
  generatedAt: '2026-09-30T12:00:00.000Z',
  chain: { ok: null, scope: 'not-checked', reason: 'This report does not verify the audit chain. The audit trail integrity attestation does.' },
  sections: [
    {
      key: 'signatures',
      title: 'Signatures',
      columns: [
        { key: 'id', label: 'Signature id' },
        { key: 'meaning', label: 'Meaning' },
      ],
      rows: [
        { id: 41, meaning: 'APPROVED' },
        { id: 42, meaning: 'REVIEWED' },
      ],
      rowCount: 2,
      truncated: false,
    },
  ],
  notRecorded: ['Signatures written before the organisation column existed carry no organisation.'],
};

const opts = {
  generatedBy: 'Quality Lead',
  generatedByRole: 'admin',
  basis: ['21 CFR 11.50'],
  chain: data.chain,
};

describe('sealManifestV2 — the one signer', () => {
  it('stamps version 2 and the key id, and signs the canonical manifest with the export key', () => {
    const { manifest, signature } = sealManifestV2({ exportId: 'X', dataHash: 'h', nested: { b: 1, a: 2 } });
    expect(manifest).toMatchObject({ exportId: 'X', manifestVersion: 2, signingKeyId: 'k-test' });
    const expected = crypto.createHmac('sha256', KEY).update(stableStringify(manifest), 'utf8').digest('hex');
    expect(signature).toBe(expected);
  });

  it('refuses in production without the dedicated key, rather than sign under a fallback', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUDIT_EXPORT_SIGNING_KEY;
    expect(() => sealManifestV2({ exportId: 'X' })).toThrow(/AUDIT_EXPORT_SIGNING_KEY/);
  });

  it('sha256Hex is the hash the verifier recomputes', () => {
    expect(sha256Hex('abc')).toBe(crypto.createHash('sha256').update('abc', 'utf8').digest('hex'));
  });
});

describe.each(['json', 'csv'] as const)('a %s compliance report', (format) => {
  it('verifies with the existing export verifier', () => {
    const out = buildSignedReport(data, { ...opts, format });
    const v = verifySignedAuditExport(out.data, out.manifest as never, out.signature);
    expect(v).toEqual({ valid: true, errors: [], signingKeyId: 'k-test' });
  });

  it('fails verification after a one-byte change to the data', () => {
    const out = buildSignedReport(data, { ...opts, format });
    const i = out.data.indexOf('APPROVED');
    const tampered = `${out.data.slice(0, i)}B${out.data.slice(i + 1)}`;
    expect(tampered.length).toBe(out.data.length);
    const v = verifySignedAuditExport(tampered, out.manifest as never, out.signature);
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toMatch(/Data hash mismatch/);
  });

  it('fails verification when a manifest claim is changed', () => {
    const out = buildSignedReport(data, { ...opts, format });
    const forged = { ...out.manifest, sections: [{ key: 'signatures', rowCount: 0, truncated: false }] };
    expect(verifySignedAuditExport(out.data, forged as never, out.signature).valid).toBe(false);
  });

  it('carries the contract manifest', () => {
    const out = buildSignedReport(data, { ...opts, format });
    expect(out.manifest).toMatchObject({
      manifestVersion: 2,
      kind: 'compliance-report',
      report: { id: 'electronic-signatures', title: 'Electronic signature register', version: 1 },
      organizationId: 7,
      period: { from: '2026-09-01', to: '2026-09-30', kind: 'range' },
      generatedAt: '2026-09-30T12:00:00.000Z',
      generatedBy: 'Quality Lead',
      generatedByRole: 'admin',
      format,
      sections: [{ key: 'signatures', rowCount: 2, truncated: false }],
      dataHash: sha256Hex(out.data),
      hashAlgorithm: 'SHA-256',
      signingKeyId: 'k-test',
      chainAtGeneration: data.chain,
      basis: ['21 CFR 11.50'],
    });
    expect(out.manifest.exportId).toMatch(/^COMPLIANCE-REPORT-\d+-[0-9a-f]{8}$/);
    expect(out.manifest.compliance).toMatchObject({ standard: '21 CFR Part 11', section: '§11.10(e)' });
    expect(out.filename).toMatch(new RegExp(`^electronic-signatures_2026-09-01_2026-09-30_[0-9a-f]{8}\\.${format}$`));
    expect(out.contentType).toBe(format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
  });

  it('the data is the report itself', () => {
    const out = buildSignedReport(data, { ...opts, format });
    if (format === 'json') expect(JSON.parse(out.data)).toEqual(data);
    else expect(out.data.split('\n')).toContain('# Signatures');
  });
});
