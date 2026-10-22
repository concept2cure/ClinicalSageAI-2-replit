/**
 * The pre-transmit gate checks a package's size only against a gateway limit on
 * file, and says where that limit comes from.
 *
 * Until 2026-10-15 it read getGatewaySizeLimit, which answered a figure for every
 * region: FDA's 4 GB for Health Canada, and an unpublished 1 GB for CN and KR
 * (and, through its default arm, UK, AU, CH, BR, IN and SG). A 2 GB package bound
 * for NMPA was refused as "over the CN gateway limit of 1.00 GB", a limit no
 * agency publishes, and no size check named the source of the figure it applied.
 */
import { describe, it, expect } from 'vitest';
import { evaluatePreTransmit } from '../pre-transmit-check';
import { getGatewaySizeLimitOnFile } from '../../ectd/ectd-regional-rules';
import type { Region, SubmissionBundle } from '../types';

const GB = 1024 ** 3;

function run(region: Region, sizeBytes: number) {
  const bundle: SubmissionBundle = {
    path: '/tmp/x.zip',
    sha256: 'a'.repeat(64),
    sizeBytes,
    format: region === 'pmda' ? 'pmda_ectd' : 'ectd',
    builtRegion: region,
  };
  return evaluatePreTransmit({ region, bundle, environment: 'production', enforceExternal: false, env: {} });
}

const sizeCheck = (r: ReturnType<typeof run>) => r.checks.find((c) => c.name === 'gateway-size-limit');

describe('pre-transmit gateway size limit', () => {
  it.each(['ca', 'uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as const)(
    '%s: no limit is on file, so the size is not checked against one and the gate says so',
    (region) => {
      const r = run(region, 2 * GB);
      const R = region.toUpperCase();
      expect(r.blockers.filter((b) => /gateway limit/.test(b)), 'refused on a limit nobody published').toEqual([]);
      expect(sizeCheck(r), 'a size check against an unpublished figure').toBeUndefined();
      expect(r.warnings).toContain(
        `No published ${R} gateway package-size limit is on file; the package size was not checked against one.`,
      );
    },
  );

  it('fda: a package over the limit on file is blocked, and the check names the source of the limit', () => {
    const onFile = getGatewaySizeLimitOnFile('US')!;
    const r = run('fda', onFile.bytes + 1);
    expect(r.blockers.some((b) => /over the FDA gateway limit/.test(b))).toBe(true);
    expect(sizeCheck(r)?.passed).toBe(false);
    expect(sizeCheck(r)?.detail).toContain(`(source: ${onFile.source})`);
  });

  it('ema: a package within the limit on file passes, naming the source of the limit', () => {
    const onFile = getGatewaySizeLimitOnFile('EU')!;
    const r = run('ema', onFile.bytes);
    expect(sizeCheck(r)?.passed).toBe(true);
    expect(sizeCheck(r)?.detail).toContain(`(source: ${onFile.source})`);
  });

  it('pmda: the 1 GB figure still only warns (its cited manual is not on file), naming the citation', () => {
    const onFile = getGatewaySizeLimitOnFile('JP')!;
    const r = run('pmda', onFile.bytes + 1);
    expect(r.blockers.filter((b) => /gateway limit/.test(b))).toEqual([]);
    expect(sizeCheck(r)?.detail).toContain(`(source: ${onFile.source})`);
    expect(sizeCheck(r)?.detail).toMatch(/not enforced: no PMDA source/);
    expect(r.warnings.some((w) => /PMDA/.test(w) && /Not enforced/.test(w))).toBe(true);
  });
});
