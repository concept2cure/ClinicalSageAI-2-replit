/**
 * Clinical-trial registration & results-disclosure expert — requirements +
 * deadline projection per market.
 */

import { describe, it, expect } from 'vitest';
import {
  getDisclosureRequirements,
  computeDisclosureDeadlines,
  DISCLOSURE_MARKETS,
  type DisclosureMarket,
} from '../clinical-trial-disclosure';

describe('disclosure requirements catalog', () => {
  it('models registry + citation for every market', () => {
    for (const m of DISCLOSURE_MARKETS) {
      const req = getDisclosureRequirements(m);
      expect(req.market).toBe(m);
      expect(req.registry).toBeTruthy();
      expect(req.citation).toBeTruthy();
      expect(req.registrationTiming).toBeTruthy();
      expect(req.resultsTiming).toBeTruthy();
      expect(Array.isArray(req.notes)).toBe(true);
    }
  });

  it('EU requires a lay-person summary; US does not', () => {
    expect(getDisclosureRequirements('EU').laySummaryRequired).toBe(true);
    expect(getDisclosureRequirements('US').laySummaryRequired).toBe(false);
  });

  it('throws for an unmodeled market', () => {
    expect(() => getDisclosureRequirements('JP' as DisclosureMarket)).toThrow();
  });
});

describe('computeDisclosureDeadlines — US', () => {
  it('registration = first enrolment + 21 days', () => {
    const r = computeDisclosureDeadlines({ market: 'US', firstEnrollmentDate: '2026-01-01' });
    expect(r.registrationDeadline).toBe('2026-01-22');
  });

  it('results = primary completion + 365 days', () => {
    const r = computeDisclosureDeadlines({ market: 'US', primaryCompletionDate: '2026-01-01' });
    expect(r.resultsDeadline).toBe('2027-01-01');
  });

  it('both deadlines together', () => {
    const r = computeDisclosureDeadlines({
      market: 'US',
      firstEnrollmentDate: '2026-01-01',
      primaryCompletionDate: '2026-01-01',
    });
    expect(r.registrationDeadline).toBe('2026-01-22');
    expect(r.resultsDeadline).toBe('2027-01-01');
  });
});

describe('computeDisclosureDeadlines — EU', () => {
  it('registration deadline is null (pre-authorisation via CTIS)', () => {
    const r = computeDisclosureDeadlines({ market: 'EU', primaryCompletionDate: '2026-01-01' });
    expect(r.registrationDeadline).toBeNull();
  });

  it('non-paediatric results = completion + 365 days', () => {
    const r = computeDisclosureDeadlines({ market: 'EU', primaryCompletionDate: '2026-01-01', pediatric: false });
    expect(r.resultsDeadline).toBe('2027-01-01');
  });

  it('paediatric results = completion + 182 days', () => {
    const r = computeDisclosureDeadlines({ market: 'EU', primaryCompletionDate: '2026-01-01', pediatric: true });
    expect(r.resultsDeadline).toBe('2026-07-02');
  });
});

describe('computeDisclosureDeadlines — WHO_ICMJE', () => {
  it('registration deadline is the enrolment date itself', () => {
    const r = computeDisclosureDeadlines({ market: 'WHO_ICMJE', firstEnrollmentDate: '2026-01-01' });
    expect(r.registrationDeadline).toBe('2026-01-01');
  });

  it('results = completion + 365 days', () => {
    const r = computeDisclosureDeadlines({ market: 'WHO_ICMJE', primaryCompletionDate: '2026-01-01' });
    expect(r.resultsDeadline).toBe('2027-01-01');
  });
});

describe('computeDisclosureDeadlines — null anchors, errors, determinism', () => {
  it('null deadlines when the anchor date is missing', () => {
    const r = computeDisclosureDeadlines({ market: 'US' });
    expect(r.registrationDeadline).toBeNull();
    expect(r.resultsDeadline).toBeNull();
  });

  it('throws for an unmodeled market', () => {
    expect(() => computeDisclosureDeadlines({ market: 'JP' as DisclosureMarket })).toThrow();
  });

  it('is deterministic', () => {
    const input = { market: 'US' as DisclosureMarket, firstEnrollmentDate: '2026-01-01', primaryCompletionDate: '2026-01-01' };
    expect(computeDisclosureDeadlines(input)).toEqual(computeDisclosureDeadlines(input));
  });
});
