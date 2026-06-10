import { describe, it, expect } from 'vitest';
import { aggregateRisk, type ShadowFinding } from '../shadow-review-service';

const f = (over: Partial<ShadowFinding> & { dimension: ShadowFinding['dimension']; severity: ShadowFinding['severity'] }): ShadowFinding => ({
  title: over.title ?? 't',
  ...over,
});

describe('aggregateRisk', () => {
  it('is zero risk on both gates when there are no findings', () => {
    expect(aggregateRisk([])).toEqual({ rtf: 0, crl: 0 });
  });

  it('saturates the RTF gate when any rtf/format finding is critical', () => {
    const r = aggregateRisk([f({ dimension: 'rtf', severity: 'critical' })]);
    expect(r.rtf).toBe(1);
  });

  it('saturates the CRL gate when any crl/nb finding is critical', () => {
    const r = aggregateRisk([f({ dimension: 'crl', severity: 'critical' })]);
    expect(r.crl).toBe(1);
  });

  it('routes rtf+format to the RTF gate and crl+nb to the CRL gate', () => {
    const r = aggregateRisk([
      f({ dimension: 'format', severity: 'major' }),
      f({ dimension: 'nb', severity: 'major' }),
    ]);
    expect(r.rtf).toBeGreaterThan(0);
    expect(r.crl).toBeGreaterThan(0);
  });

  it('keeps scores within [0,1] even with many findings', () => {
    const many = Array.from({ length: 12 }, () => f({ dimension: 'crl', severity: 'major' }));
    const r = aggregateRisk(many);
    expect(r.crl).toBeGreaterThan(0);
    expect(r.crl).toBeLessThanOrEqual(1);
    expect(r.rtf).toBe(0); // no rtf/format findings
  });

  it('treats info findings as negligible', () => {
    const r = aggregateRisk([f({ dimension: 'rtf', severity: 'info' })]);
    expect(r.rtf).toBeLessThan(0.3);
  });
});
