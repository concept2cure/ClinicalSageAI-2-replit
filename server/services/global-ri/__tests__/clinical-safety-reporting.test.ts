/**
 * Investigational (clinical-trial) expedited safety reporting — timelines +
 * ICH E2A case classification per region (FDA IND safety reports; EU CTR SUSARs).
 */

import { describe, it, expect } from 'vitest';
import {
  getSafetyReportingTimelines,
  classifySafetyReport,
  SAFETY_REGIONS,
  type SafetyRegion,
} from '../clinical-safety-reporting';

describe('getSafetyReportingTimelines', () => {
  it('models a 7-day and a 15-day expedited category (with citations) for every region', () => {
    for (const region of SAFETY_REGIONS) {
      const t = getSafetyReportingTimelines(region);
      expect(t.region).toBe(region);
      expect(t.electronicStandard).toBe('ICH E2B(R3) ICSR');
      expect(t.citation).toBeTruthy();
      expect(t.periodicReport).toBeTruthy();
      expect(t.notes.length).toBeGreaterThan(0);

      const days = t.expedited.map((e) => e.timelineDays);
      expect(days).toContain(7);
      expect(days).toContain(15);
      for (const cat of t.expedited) {
        expect(cat.citation).toBeTruthy();
        expect(cat.trigger).toBeTruthy();
        expect(cat.category).toBeTruthy();
      }
    }
  });

  it('throws for an unmodeled region', () => {
    expect(() => getSafetyReportingTimelines('JP' as SafetyRegion)).toThrow();
  });
});

describe('classifySafetyReport — FDA', () => {
  it('serious + unexpected + suspected (not fatal) → reportable, IND safety report, 15 days', () => {
    const r = classifySafetyReport({
      region: 'FDA',
      serious: true,
      unexpected: true,
      suspectedCausality: true,
    });
    expect(r.reportable).toBe(true);
    expect(r.reportType).toBe('IND safety report');
    expect(r.timelineDays).toBe(15);
  });

  it('+ fatalOrLifeThreatening → 7 days', () => {
    const r = classifySafetyReport({
      region: 'FDA',
      serious: true,
      unexpected: true,
      suspectedCausality: true,
      fatalOrLifeThreatening: true,
    });
    expect(r.reportable).toBe(true);
    expect(r.timelineDays).toBe(7);
  });
});

describe('classifySafetyReport — EU', () => {
  it('serious + unexpected + suspected, fatal → SUSAR, 7 days', () => {
    const r = classifySafetyReport({
      region: 'EU',
      serious: true,
      unexpected: true,
      suspectedCausality: true,
      fatalOrLifeThreatening: true,
    });
    expect(r.reportable).toBe(true);
    expect(r.reportType).toBe('SUSAR report to EudraVigilance');
    expect(r.timelineDays).toBe(7);
  });

  it('serious + unexpected + suspected, non-fatal → 15 days', () => {
    const r = classifySafetyReport({
      region: 'EU',
      serious: true,
      unexpected: true,
      suspectedCausality: true,
    });
    expect(r.reportable).toBe(true);
    expect(r.timelineDays).toBe(15);
  });
});

describe('classifySafetyReport — not individually reportable', () => {
  it('not serious → reportable false, timelineDays null, rationale names the criterion', () => {
    const r = classifySafetyReport({
      region: 'FDA',
      serious: false,
      unexpected: true,
      suspectedCausality: true,
    });
    expect(r.reportable).toBe(false);
    expect(r.timelineDays).toBeNull();
    expect(r.reportType).toBe('Not individually expedited-reportable');
    expect(r.rationale).toContain('not serious');
  });

  it('not unexpected → reportable false, rationale names the criterion', () => {
    const r = classifySafetyReport({
      region: 'EU',
      serious: true,
      unexpected: false,
      suspectedCausality: true,
    });
    expect(r.reportable).toBe(false);
    expect(r.timelineDays).toBeNull();
    expect(r.rationale).toContain('not unexpected');
  });

  it('no suspected causality → reportable false, rationale names the criterion', () => {
    const r = classifySafetyReport({
      region: 'FDA',
      serious: true,
      unexpected: true,
      suspectedCausality: false,
    });
    expect(r.reportable).toBe(false);
    expect(r.timelineDays).toBeNull();
    expect(r.rationale).toContain('no suspected causal relationship');
  });

  it('omitted flags default to not reportable', () => {
    const r = classifySafetyReport({ region: 'FDA' });
    expect(r.reportable).toBe(false);
    expect(r.timelineDays).toBeNull();
  });
});

describe('classifySafetyReport — errors + determinism', () => {
  it('throws for an unmodeled region', () => {
    expect(() =>
      classifySafetyReport({ region: 'PMDA' as SafetyRegion, serious: true, unexpected: true, suspectedCausality: true }),
    ).toThrow();
  });

  it('is deterministic', () => {
    const input = { region: 'EU' as SafetyRegion, serious: true, unexpected: true, suspectedCausality: true, fatalOrLifeThreatening: true };
    expect(classifySafetyReport(input)).toEqual(classifySafetyReport(input));
  });
});
