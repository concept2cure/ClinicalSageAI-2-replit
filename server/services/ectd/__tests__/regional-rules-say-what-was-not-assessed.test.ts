/**
 * Every catalogued regional rule is either evaluated or named as not assessed;
 * FDA-ESG-006 (PDF version) blocks a US package when it was not assessed.
 *
 * What it used to do (until 2026-10-15): FDA-ESG-006 (error severity) was
 * catalogued but never evaluated, and US is a fully encoded region, so a US
 * package of PDFs nobody version-checked could be gatewayReady. EMA-CESP-003,
 * PMDA-005 and HC-REP-002 were neither evaluated nor reported as not assessed.
 */
import { describe, it, expect } from 'vitest';
import { validateRegionalPackage, type RegionalLeafRef } from '../ectd-regional-rules';

const backbone = (region: string): RegionalLeafRef => ({
  sectionCode: 'm1', filePath: `m1/${region}/${region}-regional.xml`, mimeType: 'application/xml', fileSize: 10,
});
const pdf = (extra: Partial<RegionalLeafRef> = {}): RegionalLeafRef => ({
  sectionCode: 'm2.5', filePath: 'm2/25-clin-over/clinical-overview.pdf', mimeType: 'application/pdf', fileSize: 100, ...extra,
});
const us = (leaves: RegionalLeafRef[]) => validateRegionalPackage(
  { region: 'US', applicationNumber: 'IND123456', sequenceNumber: '0001', submissionType: 'amendment', totalSizeBytes: 1000 },
  [backbone('us'), ...leaves],
);

describe('FDA-ESG-006 — PDF version', () => {
  it('a PDF whose version was not supplied: a blocking not-assessed finding', () => {
    const f = us([pdf()]).find((x) => x.ruleId === 'FDA-ESG-006');
    expect(f, 'FDA-ESG-006 was never evaluated: the US package reads clean').toBeDefined();
    expect(f!.severity).toBe('error');
    expect(f!.message).toMatch(/not assessed/i);
  });

  it('PDF 2.0 is an error naming the leaf; 1.4–1.7 passes', () => {
    const bad = us([pdf({ pdfVersion: '2.0' })]).filter((x) => x.ruleId === 'FDA-ESG-006');
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ severity: 'error', scope: 'leaf', leafPath: 'm2/25-clin-over/clinical-overview.pdf' });
    expect(us([pdf({ pdfVersion: '1.7' }), pdf({ filePath: 'm2/a.pdf', pdfVersion: '1.4' })]).filter((x) => x.ruleId === 'FDA-ESG-006')).toEqual([]);
  });

  it('no PDF leaf: nothing to assess', () => {
    expect(us([]).filter((x) => x.ruleId === 'FDA-ESG-006')).toEqual([]);
  });
});

describe('catalogued EU / JP / CA rules nobody evaluates are listed as not assessed', () => {
  it.each([
    ['EU', 'EMEA/H/C/005012', 'eu', 'EMA-CESP-003'],
    ['JP', '12345678', 'jp', 'PMDA-005'],
    ['CA', 'NDS 123456', 'ca', 'HC-REP-002'],
  ] as const)('%s names %s', (region, app, dir, rule) => {
    const findings = validateRegionalPackage(
      { region, applicationNumber: app, sequenceNumber: '0000', submissionType: 'initial', totalSizeBytes: 1000 },
      [backbone(dir)],
    );
    const notAssessed = findings.find((f) => f.ruleId === 'REGION_RULES_NOT_ASSESSED');
    expect(notAssessed, `${rule} was neither evaluated nor listed as not assessed`).toBeDefined();
    expect(notAssessed!.message).toContain(rule);
  });
});

describe('the hardened validator reads the PDF version from the leaf bytes it holds', () => {
  it('a PDF 2.0 leaf is refused by FDA-ESG-006; a 1.7 leaf is assessed and passes', async () => {
    const { validateEctdPackageHardened } = await import('../ectd-validator-hardening');
    const { createHash } = await import('node:crypto');
    const run = async (header: string) => {
      const bytes = Buffer.from(`${header}\n...`);
      const md5 = createHash('md5').update(bytes).digest('hex');
      const result = await validateEctdPackageHardened(
        [{ sectionCode: 'm2.5', title: 'o', checksum: md5, checksumType: 'md5', operation: 'new', filePath: 'm2/o.pdf', mimeType: 'application/pdf', fileSize: bytes.length, buffer: bytes }],
        { submissionId: 's', organizationId: 7, region: 'US', applicationNumber: 'IND123456', sequenceNumber: '0000', submissionType: 'original' },
      );
      return result.regional.filter((f) => f.ruleId === 'FDA-ESG-006');
    };
    expect((await run('%PDF-2.0')).map((f) => f.scope)).toEqual(['leaf']);
    expect(await run('%PDF-1.7')).toEqual([]);
  });
});
