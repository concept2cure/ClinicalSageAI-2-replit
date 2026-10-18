/**
 * Expedited SAE reporting clock (21 CFR 312.32(c)) — expectedness is a closed
 * vocabulary, the same one the IND classifier uses: "expected" or "unexpected".
 *
 * What the code used to do (until 2026-10-15): any non-empty expectedness
 * counted as ASSESSED, and anything but exactly "unexpected" as LISTED. A
 * serious, related case recorded with expectedness "unknown" — a value the
 * pharmacovigilance intake route accepts and stores — returned category
 * 'none', the basis "No expedited reporting clock — not unexpected (listed)."
 * and reportabilityDetermined: true: a case nobody had assessed against the
 * reference safety information was reported as decided and non-reportable.
 */
import { describe, it, expect } from 'vitest';
import { computeExpeditedReportingClock } from '../expedited-reporting-clock';

const today = new Date('2026-07-05T00:00:00Z');
const seriousRelated = (expectedness: string | null) => ({
  awarenessDate: '2026-07-01',
  seriousnessCriteria: ['hospitalization'],
  causality: 'related',
  expectedness,
});

describe('computeExpeditedReportingClock — text outside the vocabulary is not an assessment', () => {
  for (const text of ['unknown', 'pending', 'not assessed', 'TBD', 'N/A', 'listed']) {
    it(`"${text}" leaves reportability undetermined — never "not unexpected (listed)"`, () => {
      const r = computeExpeditedReportingClock(seriousRelated(text), today);
      expect(r.category).toBe('none');
      expect(r.unassessedInputs).toEqual(['expectedness']);
      expect(r.reportabilityDetermined).toBe(false);
      expect(r.basis).not.toMatch(/not unexpected \(listed\)/);
      expect(r.basis).toMatch(/NOT a determination that the case is non-reportable/);
      expect(r.basis).toContain(`"${text}"`);
    });
  }

  it('"expected" is still a determination, and "unexpected" still runs the clock', () => {
    const listed = computeExpeditedReportingClock(seriousRelated(' Expected '), today);
    expect(listed.reportabilityDetermined).toBe(true);
    expect(listed.basis).toMatch(/not unexpected \(listed\)/);
    expect(computeExpeditedReportingClock(seriousRelated('Unexpected'), today).category).toBe('15-day');
  });
});
