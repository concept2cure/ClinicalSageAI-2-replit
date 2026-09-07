import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { assembleRealPackage, serializeTable, sectionToContent } from '../orchestrator-real-package';
import { validateEctdPackageHardened } from '../ectd-validator-hardening';
import type { ComposedSection } from '../../module3Composer';

function section(sectionKey: string, narrative: string, tables: ComposedSection['tables'] = []): ComposedSection {
  return {
    sectionKey,
    sectionPath: sectionKey,
    structuredPayload: {},
    narrativeDraft: narrative,
    tables,
    completeness: 1,
    missingInputs: [],
    lineage: [],
  };
}

const CTX = { region: 'US' as const, applicationNumber: 'IND-123', sequenceNumber: '0000', submissionType: 'IND' };  // an APPLICATION type, which is what this ctx field holds

describe('serializeTable / sectionToContent', () => {
  it('serializes a table to delimited plain text (not HTML)', () => {
    const s = serializeTable({ title: 'Batch Formula', headers: ['Component', 'mg'], rows: [['API', '50'], ['Excipient', '100']] });
    expect(s).toBe('Batch Formula\nComponent  |  mg\nAPI  |  50\nExcipient  |  100');
  });
  it('flattens narrative + tables into one content string', () => {
    const c = sectionToContent(section('3.2.P.1', 'The drug product is...', [{ title: 'T', headers: ['a'], rows: [['1']] }]));
    expect(c).toContain('The drug product is...');
    expect(c).toContain('T\na\n1');
  });
});

describe('assembleRealPackage', () => {
  it('produces a real ICH backbone, real checksums, and href-keyed buffers', async () => {
    const res = await assembleRealPackage(
      [section('3.2.S.1', 'Drug substance general information.'), section('3.2.P.1', 'Drug product description.')],
      CTX,
    );

    // Real ICH backbone (not the stand-in): DOCTYPE + root + hierarchy + leaves.
    expect(res.backboneXml).toMatch(/<!DOCTYPE ectd:ectd SYSTEM "[^"]*ich-ectd-3-2\.dtd">/);
    expect(res.backboneXml).toContain('<ectd:ectd');
    expect(res.backboneXml).toContain('<m3-quality>');
    expect(res.backboneXml).toContain('<m3-2-s-drug-substance>');
    expect(res.backboneXml).toContain('<m3-2-p-drug-product>');
    expect(res.backboneXml).toMatch(/<leaf operation="new"/);

    // Two leaves with validator sectionCodes + real hrefs.
    expect(res.leaves.map((l) => l.sectionCode).sort()).toEqual(['m3.2.P.1', 'm3.2.S.1']);
    for (const leaf of res.leaves) {
      expect(leaf.checksumType).toBe('md5');
      expect(leaf.filePath).toMatch(/^m3\/.+\.pdf$/);
      // The buffer MUST be keyed by filePath (the validator's lookup key) and
      // its md5 MUST equal the declared checksum — the whole point of MD5 verify.
      const buf = res.leafBuffers[leaf.filePath];
      expect(buf).toBeInstanceOf(Buffer);
      expect(createHash('md5').update(buf).digest('hex')).toBe(leaf.checksum);
    }
    expect(res.totalSizeBytes).toBeGreaterThan(0);
  });

  it('is DETERMINISTIC across re-renders (drift check depends on stable checksums)', async () => {
    const mk = () => assembleRealPackage([section('3.2.S.1', 'Stable content.')], CTX);
    const a = await mk();
    const b = await mk();
    expect(a.leaves.map((l) => l.checksum)).toEqual(b.leaves.map((l) => l.checksum));
  });

  it('drives the hardened validator: DTD conformance runs (no DTD_NO_BACKBONE) and MD5 verifies', async () => {
    const res = await assembleRealPackage([section('3.2.S.1', 'Content A'), section('3.2.P.1', 'Content B')], CTX);
    const result = await validateEctdPackageHardened(
      res.leaves,
      {
        submissionId: 'sub-1',
        region: 'US',
        applicationNumber: CTX.applicationNumber,
        sequenceNumber: CTX.sequenceNumber,
        submissionType: CTX.submissionType,
        totalSizeBytes: res.totalSizeBytes,
        leafBuffers: res.leafBuffers,
      },
      res.backboneXml,
    );
    // Real backbone was validated — the "no backbone" warning must be gone,
    // and a real DTD conformance pass ran with no unknown-element/doctype errors.
    const dtdCodes = result.dtd.map((f) => f.code);
    expect(dtdCodes).not.toContain('DTD_NO_BACKBONE');
    expect(dtdCodes).not.toContain('DTD_NO_DOCTYPE');
    expect(dtdCodes).not.toContain('DTD_UNKNOWN_ELEMENT');
    // Real MD5 verification ran and matched (buffers keyed by filePath).
    expect(result.findings.some((f) => f.code === 'MD5_MISMATCH')).toBe(false);
  });

  it('fails closed with no backbone: DTD_NO_BACKBONE is an error and the package is not gateway-ready', async () => {
    const res = await assembleRealPackage([section('3.2.S.1', 'Content A')], CTX);
    const result = await validateEctdPackageHardened(
      res.leaves,
      {
        submissionId: 'sub-1',
        region: 'US',
        applicationNumber: CTX.applicationNumber,
        sequenceNumber: CTX.sequenceNumber,
        submissionType: CTX.submissionType,
        totalSizeBytes: res.totalSizeBytes,
        leafBuffers: res.leafBuffers,
      },
      // no backboneXml → DTD conformance could not run
    );
    const dtd = result.dtd.find((f) => f.code === 'DTD_NO_BACKBONE');
    expect(dtd).toBeDefined();
    expect(dtd!.severity).toBe('error'); // was 'warning' — left gatewayReady true
    expect(result.gatewayReady).toBe(false);
  });
});
