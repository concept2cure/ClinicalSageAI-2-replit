/**
 * A Module 2 summary built without a recorded drug-substance name says so: the
 * narrative does not stand a generic phrase in for the product, and the name is
 * listed as a gap.
 *
 * What the builders used to do (until 2026-10-15): buildM26NonclinicalSummaries,
 * buildM23QualityOverallSummary and buildM24NonclinicalOverview read
 * `drugSubstanceName || 'the drug substance'`, so a summary for a product whose
 * name nobody recorded read as finished prose — "the nonclinical pharmacology
 * ... of the drug substance" — and nothing reported the name missing.
 */
import { describe, expect, it } from 'vitest';
import { buildM23QualityOverallSummary, buildM24NonclinicalOverview } from '../m2-summary-builders';
import { buildM26NonclinicalSummaries } from '../preclinical/m26-nonclinical-summaries';

const NAME_GAP = /drug substance name/;

describe('Module 2 narratives with no recorded drug-substance name', () => {
  it('2.6: names the gap and uses no generic placeholder', () => {
    const r = buildM26NonclinicalSummaries({ studies: [] });
    expect(r.narrative).not.toMatch(/of the drug substance/);
    expect(r.gaps.some((g) => NAME_GAP.test(g))).toBe(true);
  });

  it('2.3: names the gap and uses no generic placeholder', () => {
    const r = buildM23QualityOverallSummary({ module3Sections: [] });
    expect(r.narrative).not.toMatch(/for the drug substance/);
    expect(r.gaps.some((g) => NAME_GAP.test(g))).toBe(true);
  });

  it('2.4: names the gap and uses no generic placeholder', () => {
    const r = buildM24NonclinicalOverview({ nonclinicalStudies: [] });
    expect(r.narrative).not.toMatch(/data for the drug substance/);
    expect(r.gaps.some((g) => NAME_GAP.test(g))).toBe(true);
  });

  it('a recorded name is used and is not a gap', () => {
    const r = buildM26NonclinicalSummaries({ studies: [], drugSubstanceName: 'ACME-401' });
    expect(r.narrative).toMatch(/of ACME-401/);
    expect(r.gaps.some((g) => NAME_GAP.test(g))).toBe(false);
  });
});
