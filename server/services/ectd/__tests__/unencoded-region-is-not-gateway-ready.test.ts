/**
 * A package for a region whose own rules are not encoded is not reported
 * gateway-ready, and the result says what was not assessed.
 *
 * Until 2026-10-15, for UK, AU, CH, BR, IN and SG validateRegionalPackage applied
 * only the universal eCTD invariants (M1 regional backbone present, ASCII file
 * names, four-digit sequence). CN and KR had named rule packs that applied
 * exactly the same two checks and left their own error rules (NMPA-CDE-002/003,
 * MFDS-KR-002) uncatalogued in practice. No application-number format, gateway
 * size, language or labelling rule ran, nothing in the result said so, and
 * validateEctdPackageHardened answered gatewayReady:true — absence of findings
 * read as clean.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db.js', () => {
  const pool = { query: async () => ({ rows: [] }) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../../db', () => {
  const pool = { query: async () => ({ rows: [] }) };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});

import { validateRegionalPackage, type RegulatoryRegion } from '../ectd-regional-rules';
import { validateEctdPackageHardened } from '../ectd-validator-hardening';
import type { ECTDLeaf } from '../ectd4-validator';

const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const leaf = (sectionCode: string, filePath: string, mimeType = 'application/pdf'): ECTDLeaf => ({
  sectionCode, title: filePath, checksum: MD5, checksumType: 'md5', operation: 'new', filePath, mimeType, fileSize: 1024,
});
const packageFor = (region: string) => [
  leaf('m1', `m1/${region}/${region}-regional.xml`, 'application/xml'),
  leaf('m2.5', 'm2/25-clin-over/clinical-overview.pdf'),
];
const backbone = (region: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd" xmlns:xlink="http://www.w3c.org/1999/xlink">
  <m1-administrative-information-and-prescribing-information>
    <leaf ID="l1" operation="new" checksum-type="md5" checksum="${MD5}" xlink:href="m1/${region}/${region}-regional.xml"/>
  </m1-administrative-information-and-prescribing-information>
  <m2-common-technical-document-summaries>
    <m2-5-clinical-overview>
      <leaf ID="l2" operation="new" checksum-type="md5" checksum="${MD5}" xlink:href="m2/25-clin-over/clinical-overview.pdf"/>
    </m2-5-clinical-overview>
  </m2-common-technical-document-summaries>
</ectd:ectd>`;

const regional = (region: RegulatoryRegion, applicationNumber: string) =>
  validateRegionalPackage(
    { region, applicationNumber, sequenceNumber: '0000', submissionType: 'variation', totalSizeBytes: 2048 },
    packageFor(region.toLowerCase()),
  );

describe('validateRegionalPackage says when a region’s own rules are not encoded', () => {
  it.each(['UK', 'AU', 'CH', 'BR', 'IN', 'SG'] as const)('%s: names what was not assessed', (region) => {
    const notEncoded = regional(region, 'X-1').find((f) => f.ruleId === 'REGION_RULES_NOT_ENCODED');
    expect(notEncoded).toBeDefined();
    expect(notEncoded!.severity).toBe('info');
    expect(notEncoded!.message).toMatch(/application-number format/);
    expect(notEncoded!.message).toMatch(/gateway package size/);
    expect(notEncoded!.message).toMatch(/language/);
  });

  it('CN and KR: names the catalogued rules that were not assessed', () => {
    const cn = regional('CN', 'CXHS2400001').find((f) => f.ruleId === 'REGION_RULES_NOT_ENCODED');
    expect(cn?.message).toMatch(/NMPA-CDE-002.*NMPA-CDE-003.*NMPA-CDE-004/);
    const kr = regional('KR', '20240001').find((f) => f.ruleId === 'REGION_RULES_NOT_ENCODED');
    expect(kr?.message).toMatch(/MFDS-KR-002.*MFDS-KR-003/);
  });

  it.each([['US', 'IND123456'], ['EU', 'EMEA/H/C/005012'], ['JP', '12345678'], ['CA', 'NDS123456']] as const)(
    '%s: a region with its own rules encoded carries no such finding',
    (region, applicationNumber) => {
      expect(regional(region, applicationNumber).some((f) => f.ruleId === 'REGION_RULES_NOT_ENCODED')).toBe(false);
    },
  );
});

describe('validateEctdPackageHardened does not call such a package gateway-ready', () => {
  const hardened = (region: RegulatoryRegion, applicationNumber: string) =>
    validateEctdPackageHardened(
      packageFor(region.toLowerCase()),
      { submissionId: 's-1', organizationId: 7, region, applicationNumber, sequenceNumber: '0000', submissionType: 'variation' },
      backbone(region.toLowerCase()),
    );

  it('a UK package with no error anywhere is not gateway-ready: its regional rules were not assessed', async () => {
    const result = await hardened('UK', 'PL 12345/0001');
    expect(result.summary.errors).toBe(0);
    expect(result.gatewayReady).toBe(false);
    expect(result.regionalRulesAssessed).toBe(false);
    expect(result.regional.some((f) => f.ruleId === 'REGION_RULES_NOT_ENCODED')).toBe(true);
  });

  it('CONTROL: the same package for the US, whose rules are encoded, is gateway-ready', async () => {
    const result = await hardened('US', 'IND123456');
    expect(result.regionalRulesAssessed).toBe(true);
    expect(result.gatewayReady).toBe(true);
  });
});
