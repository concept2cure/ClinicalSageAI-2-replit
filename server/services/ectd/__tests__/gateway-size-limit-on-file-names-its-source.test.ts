/**
 * A gateway package-size limit is given only where one is on file, with the
 * source it was taken from; elsewhere the answer is "none on file" (null).
 *
 * Until 2026-10-15 the only accessor, getGatewaySizeLimit, returned a figure for
 * every region: FDA's 4 GB for Health Canada, and a "conservative 1 GB default
 * pending verification" for CN and KR (and, through its `default:` arm, UK, AU,
 * CH, BR, IN and SG) although the code's own comments say none of those agencies
 * publishes such a limit. pre-transmit-check turned the figure into a hard
 * "over the CN gateway limit of 1.00 GB" refusal, and the workspace config
 * published it as the region's limit. getGatewaySizeLimitOnFile is the sourced
 * accessor those consumers move to (see the report for their edits).
 */
import { describe, it, expect } from 'vitest';
import { getGatewaySizeLimitOnFile, getRulesForRegion, type RegulatoryRegion } from '../ectd-regional-rules';

const GB = 1024 * 1024 * 1024;
const citationOf = (region: RegulatoryRegion, ruleId: string) =>
  getRulesForRegion(region).find((r) => r.id === ruleId)!.citation;

describe('getGatewaySizeLimitOnFile', () => {
  it('answers null for every region with no published limit on file', () => {
    for (const region of ['CA', 'CN', 'KR', 'UK', 'AU', 'CH', 'BR', 'IN', 'SG'] as const) {
      expect(getGatewaySizeLimitOnFile(region), region).toBeNull();
    }
  });

  it('gives each figure it holds with the citation of the rule it comes from', () => {
    // FDA's 10 GB (Form 5640 v2.0), read as 10^10 bytes (2026-10-08, W5/D7, sweep VP-6; it was 4 GiB).
    expect(getGatewaySizeLimitOnFile('US')).toEqual({ bytes: 10 * 1000 ** 3, source: citationOf('US', 'FDA-ESG-003') });
    expect(getGatewaySizeLimitOnFile('US')!.source).toMatch(/5640/);
    expect(getGatewaySizeLimitOnFile('EU')).toEqual({ bytes: 600 * 1024 * 1024, source: citationOf('EU', 'EMA-CESP-004') });
    expect(getGatewaySizeLimitOnFile('JP')).toEqual({ bytes: GB, source: citationOf('JP', 'PMDA-003') });
  });
});
